'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Project, VirtualFile } from '@/lib/vfs/types';
import { vfs } from '@/lib/vfs';
import { logger } from '@/lib/utils';
import { FileExplorer } from '@/components/file-explorer';
import { MultiTabEditor, openFileInEditor } from '@/components/editor/multi-tab-editor';
import { MultipagePreview, MultipagePreviewHandle } from '@/components/preview/multipage-preview';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MessageSquare, FolderTree, Code2, Eye, Settings, Save, Bug, RotateCcw, History, Settings2, Terminal as TerminalIcon, Sparkles } from 'lucide-react';
import { AppHeader, HeaderAction } from '@/components/ui/app-header';
import { MultiAgentOrchestrator, PendingImage } from '@/lib/llm/multi-agent-orchestrator';
import { configManager, migrateBackendKey } from '@/lib/config/storage';
import { useCostSettings } from '@/lib/hooks/use-cost-settings';
import { getProvider, modelSupportsVision } from '@/lib/llm/providers/registry';
import { toast } from 'sonner';
import { debugEventsState } from '@/lib/llm/debug-events-state';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { checkpointManager } from '@/lib/vfs/checkpoint';
import { saveManager } from '@/lib/vfs/save-manager';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { SettingsPanel } from '@/components/settings';
import { GuidedTourOverlay } from '@/components/guided-tour/overlay';
import { useGuidedTour } from '@/components/guided-tour/context';
import { GuidedTourTranscriptEvent } from '@/components/guided-tour/types';
import { track } from '@/lib/telemetry';
import { FocusContextPayload } from '@/lib/preview/types';
import type { PlacedBlock } from '@/lib/semantic-blocks/types';
import type { PlacementResult } from '@/lib/preview/types';
import { getBlockById } from '@/lib/semantic-blocks/registry';
import { DebugPanel, DebugEvent } from '@/components/debug-panel';
import { ChatPanel } from '@/components/chat-panel';
import { DeploymentSelector } from '@/components/workspace/deployment-selector';
import { CheckpointPanel } from '@/components/checkpoint-panel';
import { ProjectSettingsModal } from '@/components/project-backend';
import { SkillsPanel } from '@/components/workspace/skills-panel';
import { PanelDragProvider } from '@/components/ui/panel';
import { ConsolePanel } from '@/components/console';
import { getRuntimeConfig } from '@/lib/runtimes/registry';
import { drainRuntimeErrors, peekRuntimeErrors, formatRuntimeErrors } from '@/lib/preview/runtime-errors';

interface WorkspaceProps {
  project: Project;
  onBack: () => void;
  workspaceId?: string;
}

type FocusTarget = FocusContextPayload & { timestamp: number };

export function Workspace({ project, onBack, workspaceId }: WorkspaceProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [currentOrchestrator, setCurrentOrchestrator] = useState<MultiAgentOrchestrator | null>(null);
  const [persistedOrchestrator, setPersistedOrchestrator] = useState<MultiAgentOrchestrator | null>(null);
  const [activeMobilePanel, setActiveMobilePanel] = useState<'chat' | 'files' | 'editor' | 'preview' | 'console'>('preview');
  const [isDirty, setIsDirty] = useState(false);
  const [saveInProgress, setSaveInProgress] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(project.lastSavedAt ?? null);
  const [entryPoint, setEntryPoint] = useState<string | undefined>(project.settings?.previewEntryPoint);
  const [focusContext, setFocusContext] = useState<FocusTarget | null>(null);
  const [placedBlocks, setPlacedBlocks] = useState<PlacedBlock[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [chatMode, setChatMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('osw-studio-chat-mode');
      return stored ? stored === 'true' : false;
    }
    return false;
  });
  const lastFocusSignatureRef = useRef<{ signature: string; timestamp: number } | null>(null);
  const previewRef = useRef<MultipagePreviewHandle>(null);
  const retryTriggerRef = useRef<boolean>(false);
  const [runtimeErrors, setRuntimeErrors] = useState<string[]>([]);
  const generatingRef = useRef(false);
  const [initialCheckpointId, setInitialCheckpointId] = useState<string | null>(null);
  const [checkpointRefreshKey, setCheckpointRefreshKey] = useState(0);
  const [currentModel, setCurrentModel] = useState(configManager.getDefaultModel());
  const [projectCost, setProjectCost] = useState(0);
  const { state: tourState, start: startTour, setWorkspaceHandler } = useGuidedTour();
  const tourStep = tourState.currentStep?.id;
  const tourRunning = tourState.status === 'running';
  const isTourLockingInput = tourRunning && tourStep !== 'wrap-up';

  // Keep generatingRef in sync for runtime error listener
  useEffect(() => { generatingRef.current = generating; }, [generating]);

  // Subscribe to runtime errors that arrive after generation completes
  useEffect(() => {
    const handler = () => {
      if (!generatingRef.current) {
        setRuntimeErrors(peekRuntimeErrors());
      }
    };
    window.addEventListener('runtimeErrorsChanged', handler);
    return () => window.removeEventListener('runtimeErrorsChanged', handler);
  }, []);

  // Get cost settings for conditional display
  const { shouldShowCosts } = useCostSettings();

  // Check if current model supports vision for image input
  const supportsVision = useMemo(() => {
    const currentProvider = configManager.getSelectedProvider();
    const modelId = currentModel || configManager.getDefaultModel();

    // Check cached discovered models first (has accurate modality data from API)
    const cached = configManager.getCachedModels(currentProvider);
    if (cached) {
      const model = (cached.models as import('@/lib/llm/providers/types').ProviderModel[])
        .find(m => m.id === modelId);
      if (model?.supportsVision !== undefined) {
        return model.supportsVision;
      }
    }

    // Fall back to name-based heuristics for hardcoded providers
    return modelSupportsVision(currentProvider, modelId);
  }, [currentModel]);

  // Check if current provider has credentials configured
  const providerReady = useMemo(() => {
    const provider = configManager.getSelectedProvider();
    const config = getProvider(provider);
    if (config.isLocal) return true;
    if (config.apiKeyRequired || config.usesOAuth) return !!configManager.getProviderApiKey(provider);
    return true;
  }, [currentModel]);
  
  // Console panel — visible by default for terminal-mode runtimes (Python, Lua), togglable for all
  const isTerminalRuntime = getRuntimeConfig(project.settings?.runtime || 'handlebars').previewMode === 'terminal';

  // Load persisted panel visibility from localStorage, with runtime-aware defaults
  const savedPanels = useMemo(() => {
    try {
      const stored = localStorage.getItem('osw-workspace-panels');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  }, []);

  const [showChat, setShowChat] = useState(savedPanels?.chat ?? true);
  const [showFiles, setShowFiles] = useState(savedPanels?.files ?? true);
  const [showEditor, setShowEditor] = useState(savedPanels?.editor ?? false);
  const [showPreview, setShowPreview] = useState(savedPanels?.preview ?? !isTerminalRuntime);
  const [showCheckpoints, setShowCheckpoints] = useState(savedPanels?.checkpoints ?? false);
  const [showDebugPanel, setShowDebugPanel] = useState(savedPanels?.debug ?? false);
  const [showProjectSettingsModal, setShowProjectSettingsModal] = useState(false);
  const [showSkillsPanel, setShowSkillsPanel] = useState(savedPanels?.skills ?? false);

  const [showConsole, setShowConsole] = useState(savedPanels?.console ?? isTerminalRuntime);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);

  // Persist panel visibility when it changes
  useEffect(() => {
    try {
      localStorage.setItem('osw-workspace-panels', JSON.stringify({
        chat: showChat, files: showFiles, editor: showEditor, preview: showPreview,
        checkpoints: showCheckpoints, debug: showDebugPanel, skills: showSkillsPanel,
        console: showConsole,
      }));
    } catch { /* localStorage full or unavailable */ }
  }, [showChat, showFiles, showEditor, showPreview, showCheckpoints, showDebugPanel, showSkillsPanel, showConsole]);
  // Ref to imperatively reset panel sizes after reorder
  const panelGroupRef = useRef<import('react-resizable-panels').ImperativePanelGroupHandle | null>(null);

  // Panel ordering — persisted to localStorage, controls left-to-right rendering
  const DEFAULT_PANEL_ORDER = ['chat', 'files', 'editor', 'skills', 'console', 'preview', 'checkpoints', 'debug'];
  const [panelOrder, setPanelOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('osw-workspace-panel-order');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge: keep stored order but ensure all panels are present
        const all = new Set(DEFAULT_PANEL_ORDER);
        const ordered = parsed.filter((k: string) => all.has(k));
        for (const k of DEFAULT_PANEL_ORDER) {
          if (!ordered.includes(k)) ordered.push(k);
        }
        return ordered;
      }
    } catch {}
    return DEFAULT_PANEL_ORDER;
  });

  useEffect(() => {
    try { localStorage.setItem('osw-workspace-panel-order', JSON.stringify(panelOrder)); } catch {}
  }, [panelOrder]);

  // Drag-to-reorder state
  const [draggingPanel, setDraggingPanel] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null); // index in visible panels where the drop zone is highlighted

  const handlePanelDragStart = useCallback((panelKey: string) => {
    // Capture the dragged panel's center X for "stay put" distance comparison
    const container = panelContainerRef.current;
    if (container) {
      const panelEl = container.querySelector(`[data-panel-id="${panelKey}"]`);
      if (panelEl) {
        const rect = panelEl.getBoundingClientRect();
        draggedPanelCenter.current = rect.left + rect.width / 2;
      }
    }
    document.body.style.cursor = 'grabbing';
    setDraggingPanel(panelKey);
  }, []);

  const handlePanelDragEnd = useCallback(() => {
    if (draggingPanel && dropTarget !== null) {
      // Capture current sizes keyed by panel identity before reordering
      const visibleBefore = panelOrder.filter(k => {
        if (k === 'chat') return showChat;
        if (k === 'files') return showFiles;
        if (k === 'editor') return showEditor;
        if (k === 'console') return showConsole;
        if (k === 'preview') return showPreview;
        if (k === 'checkpoints') return showCheckpoints;
        if (k === 'debug') return showDebugPanel;
        if (k === 'skills') return showSkillsPanel;
        return false;
      });
      const currentLayout = panelGroupRef.current?.getLayout() || [];
      const sizeByKey: Record<string, number> = {};
      visibleBefore.forEach((key, i) => {
        if (i < currentLayout.length) sizeByKey[key] = currentLayout[i];
      });

      setPanelOrder(prev => {
        const newOrder = prev.filter(k => k !== draggingPanel);
        const targetKey = visibleBefore[dropTarget];
        if (targetKey) {
          const insertIdx = newOrder.indexOf(targetKey);
          newOrder.splice(insertIdx, 0, draggingPanel);
        } else {
          newOrder.push(draggingPanel);
        }
        return newOrder;
      });

      // Restore sizes in the new order after React re-renders
      requestAnimationFrame(() => {
        if (panelGroupRef.current && visibleBefore.length > 0) {
          // Compute new visible order
          const newVisible = [...visibleBefore];
          const dragIdx = newVisible.indexOf(draggingPanel);
          if (dragIdx >= 0) newVisible.splice(dragIdx, 1);
          const targetKey = visibleBefore[dropTarget];
          const insertIdx = targetKey ? newVisible.indexOf(targetKey) : newVisible.length;
          newVisible.splice(insertIdx >= 0 ? insertIdx : newVisible.length, 0, draggingPanel);

          const sizes = newVisible.map(k => sizeByKey[k] || Math.floor(100 / newVisible.length));
          // Normalize to exactly 100
          const total = sizes.reduce((a, b) => a + b, 0);
          if (total !== 100 && sizes.length > 0) {
            sizes[sizes.length - 1] += 100 - total;
          }
          panelGroupRef.current.setLayout(sizes);
        }
      });
    }
    setDraggingPanel(null);
    setDropTarget(null);
    draggedPanelCenter.current = null;
    document.body.style.cursor = '';
  }, [draggingPanel, dropTarget, panelOrder, showChat, showFiles, showEditor, showConsole, showPreview, showCheckpoints, showDebugPanel, showSkillsPanel]);

  // Document-level mouseup listener — ends drag whether inside or outside the container.
  // If mouseUp is inside the container, the container's own onMouseUp handles it (with drop logic).
  // If mouseUp is outside, this fires and cancels the drag.
  useEffect(() => {
    if (!draggingPanel) return;
    const handleDocumentMouseUp = () => {
      // Only cancel if still dragging — the container's onMouseUp may have already handled it
      setDraggingPanel(prev => {
        if (prev) {
          setDropTarget(null);
          draggedPanelCenter.current = null;
          document.body.style.cursor = '';
        }
        return null;
      });
    };
    document.addEventListener('mouseup', handleDocumentMouseUp);
    return () => document.removeEventListener('mouseup', handleDocumentMouseUp);
  }, [draggingPanel]);

  // During drag: track mouse X and find closest drop zone
  const panelContainerRef = useRef<HTMLDivElement>(null);
  const dropZonePositions = useRef<Map<number, number>>(new Map()); // position index → X center
  const draggedPanelCenter = useRef<number | null>(null); // X center of the panel being dragged

  const registerDropZone = useCallback((position: number, el: HTMLDivElement | null) => {
    if (el) {
      const rect = el.getBoundingClientRect();
      dropZonePositions.current.set(position, rect.left + rect.width / 2);
    } else {
      dropZonePositions.current.delete(position);
    }
  }, []);

  const handleDragMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingPanel) return;
    const positions = dropZonePositions.current;
    if (positions.size === 0) return;

    // Check distance to each drop zone
    let closest: number | null = null;
    let closestDist = Infinity;
    for (const [pos, x] of positions) {
      const dist = Math.abs(e.clientX - x);
      if (dist < closestDist) {
        closestDist = dist;
        closest = pos;
      }
    }

    // If the mouse is closer to the dragged panel's own center, stay put (no move)
    if (draggedPanelCenter.current !== null) {
      const distToSelf = Math.abs(e.clientX - draggedPanelCenter.current);
      if (distToSelf <= closestDist) {
        setDropTarget(null);
        return;
      }
    }

    setDropTarget(closest);
  }, [draggingPanel]);

  // Panel toggle with max 3 visible constraint.
  // When opening a panel would exceed 3, close the rightmost visible panel.
  const MAX_VISIBLE_PANELS = 3;

  // Panel definitions ordered by current panelOrder (for rightmost-close logic)
  const panelDefsMap: Record<string, { get: boolean; set: (v: boolean) => void }> = useMemo(() => ({
    chat: { get: showChat, set: setShowChat },
    files: { get: showFiles, set: setShowFiles },
    editor: { get: showEditor, set: setShowEditor },
    console: { get: showConsole, set: setShowConsole },
    preview: { get: showPreview, set: setShowPreview },
    checkpoints: { get: showCheckpoints, set: setShowCheckpoints },
    debug: { get: showDebugPanel, set: setShowDebugPanel },
    skills: { get: showSkillsPanel, set: setShowSkillsPanel },
  }), [showChat, showFiles, showEditor, showConsole, showPreview, showCheckpoints, showDebugPanel, showSkillsPanel]);

  const panelDefs = useMemo(() =>
    panelOrder.map(key => ({ key, ...panelDefsMap[key] })).filter(p => p.get !== undefined),
    [panelOrder, panelDefsMap]
  );

  const togglePanel = useCallback((key: string) => {
    setPanelReplacePreview(null);
    setPanelInsertPreview(null);
    const panel = panelDefs.find(p => p.key === key);
    if (!panel) return;

    if (panel.get) {
      // Closing — always allowed
      panel.set(false);
      return;
    }

    // Opening — check if we'd exceed the limit
    const visibleCount = panelDefs.filter(p => p.get).length;
    if (visibleCount >= MAX_VISIBLE_PANELS) {
      // Close the rightmost visible panel and insert the new panel at its position
      for (let i = panelDefs.length - 1; i >= 0; i--) {
        if (panelDefs[i].get && panelDefs[i].key !== key) {
          const closedKey = panelDefs[i].key;
          panelDefs[i].set(false);
          // Move the new panel to the closed panel's position in the order
          setPanelOrder(prev => {
            const newOrder = prev.filter(k => k !== key);
            const insertIdx = newOrder.indexOf(closedKey);
            if (insertIdx >= 0) {
              newOrder.splice(insertIdx, 0, key);
            } else {
              newOrder.push(key);
            }
            return newOrder;
          });
          break;
        }
      }
    } else {
      // Room available — always open as the rightmost panel
      setPanelOrder(prev => {
        const newOrder = prev.filter(k => k !== key);
        newOrder.push(key);
        return newOrder;
      });
    }
    panel.set(true);
  }, [panelDefs]);

  // Track which panel would be replaced when hovering a sidebar button
  const [panelReplacePreview, setPanelReplacePreview] = useState<string | null>(null);
  const [panelInsertPreview, setPanelInsertPreview] = useState<number | null>(null); // index where new panel would appear

  const handleSidebarHover = useCallback((key: string | null) => {
    if (!key) { setPanelReplacePreview(null); setPanelInsertPreview(null); return; }
    const panel = panelDefs.find(p => p.key === key);
    if (!panel || panel.get) { setPanelReplacePreview(null); setPanelInsertPreview(null); return; } // already open or not found
    const visibleCount = panelDefs.filter(p => p.get).length;
    if (visibleCount < MAX_VISIBLE_PANELS) {
      // New panels always open as the rightmost panel
      setPanelInsertPreview(visibleCount);
      setPanelReplacePreview(null);
      return;
    }
    // At max panels — show which panel would be replaced
    setPanelInsertPreview(null);
    for (let i = panelDefs.length - 1; i >= 0; i--) {
      if (panelDefs[i].get && panelDefs[i].key !== key) {
        setPanelReplacePreview(panelDefs[i].key);
        return;
      }
    }
    setPanelReplacePreview(null);
  }, [panelDefs, panelOrder]);

  const [hasUnreadConsole, setHasUnreadConsole] = useState(false);
  const consoleBufferRef = useRef<{ level: string; text: string }[]>([]);
  const showConsoleRef = useRef(showConsole);

  // Keep showConsoleRef in sync for buffering logic (tracks both desktop and mobile)
  useEffect(() => {
    showConsoleRef.current = showConsole || activeMobilePanel === 'console';
  }, [showConsole, activeMobilePanel]);

  // Buffer previewConsole events when console is hidden
  useEffect(() => {
    const handler = (e: Event) => {
      if (!showConsoleRef.current) {
        const { level, args } = (e as CustomEvent<{ level: string; args: string[] }>).detail;
        consoleBufferRef.current.push({ level, text: args.join(' ') });
        setHasUnreadConsole(true);
      }
    };
    window.addEventListener('previewConsole', handler);
    return () => window.removeEventListener('previewConsole', handler);
  }, []);

  // Clear unread flag when console opens (desktop or mobile)
  useEffect(() => {
    if (showConsole || activeMobilePanel === 'console') {
      setHasUnreadConsole(false);
    }
  }, [showConsole, activeMobilePanel]);

  // Backend enabled state (persisted per-project in localStorage)
  const [backendEnabled, setBackendEnabled] = useState<boolean>(() => {
    return migrateBackendKey(project.id);
  });

  // Backend context state (deployment selection for backend features)
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);

  // Debug events state
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const debugIdCounter = useRef(0);
  const saveDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Maximum debug events to keep in memory to prevent unbounded growth
  const MAX_DEBUG_EVENTS = 2000;

  // Debounced save function to persist events array to IndexedDB
  const debouncedSaveEvents = useCallback((events: DebugEvent[]) => {
    if (saveDebounceTimer.current) {
      clearTimeout(saveDebounceTimer.current);
    }
    saveDebounceTimer.current = setTimeout(() => {
      debugEventsState.saveEvents(project.id, events).catch(error => {
        logger.error('Failed to persist debug events:', error);
      });
    }, 500); // Save after 500ms of inactivity
  }, [project.id]);

  const addDebugEvent = useCallback(async (event: string, data: any) => {
    setDebugEvents(prev => {
      const shouldCoalesce = event === 'assistant_delta' || event === 'tool_param_delta' || event === 'reasoning_delta';

      let newEvents: DebugEvent[];

      // Check if we can coalesce with a recent event of the same type.
      // Search backward through the last few events to handle interleaved
      // streaming (e.g. tool_param_delta / toolCalls / tool_param_delta).
      if (shouldCoalesce && prev.length > 0) {
        const searchLimit = Math.max(0, prev.length - 4);
        for (let i = prev.length - 1; i >= searchLimit; i--) {
          if (prev[i].event === event) {
            const target = prev[i];
            const updatedEvent = {
              ...target,
              timestamp: Date.now(),
              version: (target.version || 1) + 1,
              count: (target.count || 1) + 1,
              data: {
                all: target.data.all
                  ? [...target.data.all, data]
                  : [target.data, data]
              }
            };

            newEvents = [...prev.slice(0, i), updatedEvent, ...prev.slice(i + 1)];
            debouncedSaveEvents(newEvents);
            return newEvents;
          }
        }
      }

      // Different event type or first event - add new
      const debugEvent = {
        id: `${Date.now()}-${debugIdCounter.current++}`,
        timestamp: Date.now(),
        event,
        data,
        count: 1,
        version: 1
      };

      newEvents = [...prev, debugEvent];

      // Prune old events if exceeding limit to prevent memory growth
      if (newEvents.length > MAX_DEBUG_EVENTS) {
        newEvents = newEvents.slice(-MAX_DEBUG_EVENTS);
      }

      debouncedSaveEvents(newEvents);
      return newEvents;
    });
  }, [project.id, debouncedSaveEvents, MAX_DEBUG_EVENTS]);

  const clearDebugEvents = useCallback(async () => {
    setDebugEvents([]);
    await debugEventsState.clearEvents(project.id);
    // Clear auto-checkpoints when conversation is cleared (keep manual saves)
    await checkpointManager.clearAutoCheckpoints(project.id);
    // Clear orchestrator to reset conversation history
    setPersistedOrchestrator(null);
  }, [project.id]);
  
  const visiblePanelCount = [showChat, showFiles, showEditor, showConsole, showPreview, showCheckpoints, showDebugPanel, showSkillsPanel].filter(Boolean).length;
  const baseSize = visiblePanelCount > 0 ? Math.floor(100 / visiblePanelCount) : 100;
  // Last panel absorbs remainder so sizes sum to exactly 100 (avoids layout normalization warnings)
  const lastPanelSize = visiblePanelCount > 0 ? 100 - baseSize * (visiblePanelCount - 1) : 100;

  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Select Model';
    const parts = modelId.split('/');
    const modelName = parts[parts.length - 1];
    return modelName
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const truncateHtmlSnippet = useCallback((html: string, maxLength: number = 1200) => {
    if (!html) {
      return '';
    }
    if (html.length <= maxLength) {
      return html;
    }
    const headLength = Math.max(0, Math.floor(maxLength * 0.6));
    const tailLength = Math.max(0, Math.floor(maxLength * 0.3));
    const head = html.slice(0, headLength);
    const tail = tailLength > 0 ? html.slice(-tailLength) : '';
    return `${head}\n  (...truncated...)\n${tail}`;
  }, []);

  const describeFocusTarget = useCallback((target: FocusTarget) => {
    const attributeEntries = Object.entries(target.attributes || {}).slice(0, 6);
    if (attributeEntries.length === 0) {
      return `<${target.tagName}>`;
    }
    const summary = attributeEntries
      .map(([key, value]) => {
        const trimmed = value.length > 40 ? `${value.slice(0, 37)}…` : value;
        return `${key}="${trimmed}"`;
      })
      .join(' ');
    return `<${target.tagName} ${summary}>`;
  }, []);

  const formatFocusContextBlock = useCallback((target: FocusTarget) => {
    const descriptor = describeFocusTarget(target);
    const snippet = truncateHtmlSnippet(target.outerHTML, 1200);
    const domPath = target.domPath || '(unknown path)';
    return [
      'Focus context:',
      `- Target: ${descriptor}`,
      `- DOM path: ${domPath}`,
      '- HTML snippet:',
      '```html',
      snippet,
      '```'
    ].join('\n');
  }, [describeFocusTarget, truncateHtmlSnippet]);

  const formatPlacedBlocksContext = useCallback((blocks: PlacedBlock[]) => {
    if (blocks.length === 0) return '';
    const lines = [
      'Semantic blocks to implement:',
      'The user has placed the following semantic blocks at specific positions in the preview. Implement each block at the position marked by the <!-- ??? INSERT ... HERE ??? --> comment in the HTML context below. The user chose this position intentionally — find a creative way to make the block work naturally at that exact location, adapting its layout and content to fit the surrounding context. Match the existing project\'s styling, colors, fonts, and conventions. Use placeholder/sample content where needed.',
      '',
    ];
    blocks.forEach((placed, index) => {
      const block = getBlockById(placed.blockId);
      if (!block) return;
      lines.push(`[${index + 1}] ${block.name} (page: ${placed.page})`);
      lines.push(`    Description: ${block.description}`);
      if (placed.htmlContext) {
        const snippet = truncateHtmlSnippet(placed.htmlContext, 1200);
        lines.push(`    Insert position in context:`);
        lines.push('    ```html');
        lines.push(`    ${snippet}`);
        lines.push('    ```');
      } else {
        lines.push(`    Position: insert ${placed.position} ${placed.domPath}`);
      }
      lines.push('');
    });
    return lines.join('\n');
  }, []);

  const handleFocusSelection = useCallback((selection: FocusContextPayload | null) => {
    if (!selection) {
      setFocusContext(null);
      lastFocusSignatureRef.current = null;
      return;
    }
    const signature = `${selection.domPath || ''}::${selection.tagName || ''}::${selection.outerHTML ? selection.outerHTML.length : 0}`;
    const now = Date.now();
    if (lastFocusSignatureRef.current && lastFocusSignatureRef.current.signature === signature && (now - lastFocusSignatureRef.current.timestamp) < 400) {
      return;
    }
    const nextTarget: FocusTarget = {
      ...selection,
      timestamp: now
    };
    setFocusContext(nextTarget);
    toast.info('Focus context set', {
      description: describeFocusTarget(nextTarget)
    });
    lastFocusSignatureRef.current = { signature, timestamp: now };
  }, [describeFocusTarget]);

  const handlePlacementToggle = useCallback(() => {
    setPaletteOpen(prev => !prev);
  }, []);

  const handlePlacementComplete = useCallback((payload: PlacementResult) => {
    const currentPage = previewRef.current?.getActivePath?.() || '/';
    setPlacedBlocks(prev => [...prev, {
      blockId: payload.blockId,
      placementId: payload.placementId,
      domPath: payload.domPath,
      position: payload.position,
      page: currentPage,
      htmlContext: payload.htmlContext,
    }]);
  }, []);

  const handleRemovePlacedBlock = useCallback((placementId: string) => {
    setPlacedBlocks(prev => prev.filter(b => b.placementId !== placementId));
    previewRef.current?.removePlaceholder(placementId);
  }, []);

  const handleClearPlacedBlocks = useCallback(() => {
    placedBlocks.forEach(b => previewRef.current?.removePlaceholder(b.placementId));
    setPlacedBlocks([]);
  }, [placedBlocks]);

  const handleClosePreview = useCallback(() => {
    setShowPreview(false);
  }, []);

  const handleEnterFullscreen = useCallback(() => {
    setFullscreenPreview(true);
  }, []);

  const handleExitFullscreen = useCallback(() => {
    setFullscreenPreview(false);
  }, []);

  // Listen for showPreview event (dispatched by AI preview command)
  useEffect(() => {
    const handler = () => togglePanel('preview');
    window.addEventListener('showPreview', handler);
    return () => window.removeEventListener('showPreview', handler);
  }, []);

  const handleSetEntryPoint = useCallback(async (path: string) => {
    try {
      const proj = await vfs.getProject(project.id);
      proj.settings = { ...proj.settings, previewEntryPoint: path };
      await vfs.updateProject(proj);
      setEntryPoint(path);
      setRefreshTrigger(prev => prev + 1);
      toast.success(`Entry point set to ${path}`);
    } catch (err) {
      logger.error('Failed to set entry point:', err);
      toast.error('Failed to set entry point');
    }
  }, [project.id]);

  const handleAddPromptFile = useCallback(async () => {
    try {
      const { getDomainPrompt } = await import('@/lib/llm/prompts');
      const runtime = project.settings?.runtime || 'handlebars';
      await vfs.createFile(project.id, '/.PROMPT.md', getDomainPrompt(runtime));
      window.dispatchEvent(new CustomEvent('filesChanged', { detail: { projectId: project.id } }));
      toast.success('.PROMPT.md added to project');
    } catch (err) {
      logger.error('Failed to add .PROMPT.md:', err);
      toast.error('Failed to add .PROMPT.md');
    }
  }, [project.id, project.settings?.runtime]);

  const focusPreviewSnippet = focusContext ? truncateHtmlSnippet(focusContext.outerHTML, 240) : '';

  useEffect(() => {
    setIsDirty(saveManager.isDirty(project.id));
    const unsubscribe = saveManager.subscribe(({ projectId, dirty }) => {
      if (projectId === project.id) {
        setIsDirty(dirty);
      }
    });
    return () => unsubscribe();
  }, [project.id]);

  // Persist chat mode to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('osw-studio-chat-mode', String(chatMode));
    }
  }, [chatMode]);

  useEffect(() => {
    let isMounted = true;

    const initializeWorkspace = async () => {
      try {
        await saveManager.syncProjectSaveState(project.id);
        let savedCheckpointId = saveManager.getSavedCheckpointId(project.id);

        if (savedCheckpointId) {
          const restored = await saveManager.restoreLastSaved(project.id);
          if (!restored) {
            logger.warn('[Workspace] Saved checkpoint missing or failed to restore, creating new baseline');
            savedCheckpointId = null;
          }
        }

        // Create a "Starting point" system checkpoint (dedup handled inside createCheckpoint)
        if (!savedCheckpointId) {
          const checkpoint = await checkpointManager.createCheckpoint(project.id, 'Starting point', { kind: 'system' });
          savedCheckpointId = checkpoint.id;
        }

        if (!isMounted) return;

        if (savedCheckpointId) {
          setInitialCheckpointId(savedCheckpointId);
        }

        const latestProject = await vfs.getProject(project.id);
        if (!isMounted) return;
        setLastSavedAt(latestProject.lastSavedAt ?? null);
        setIsDirty(saveManager.isDirty(project.id));

        logger.debug(`[Workspace] Initializing workspace for project: ${project.id}`);

        // Load debug events from IndexedDB
        try {
          const savedEvents = await debugEventsState.loadEvents(project.id);
          if (!isMounted) return;
          if (savedEvents.length > 0) {
            setDebugEvents(savedEvents);
            logger.debug(`[Workspace] Restored ${savedEvents.length} debug events`);
          } else {
            logger.debug(`[Workspace] No saved debug events found`);
          }
        } catch (error) {
          if (!isMounted) return;
          logger.error('Failed to load debug events:', error);
        }
      } catch (error) {
        if (!isMounted) return;
        logger.error('Failed to initialize workspace:', error);
      }
    };

    initializeWorkspace();

    const updateProjectCost = async () => {
      try {
        const currentProject = await vfs.getProject(project.id);
        if (!isMounted) return;
        if (currentProject?.costTracking?.totalCost) {
          setProjectCost(currentProject.costTracking.totalCost);
        } else {
          setProjectCost(0);
        }
      } catch (error) {
        if (!isMounted) return;
        setProjectCost(0);
      }
    };

    updateProjectCost();
    const interval = setInterval(updateProjectCost, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [project.id]);

  useEffect(() => {
    if (!tourRunning) return;

    if (tourStep === 'provider-settings') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tour-open-provider-settings'));
      }
    }
  }, [tourRunning, tourStep]);

  useEffect(() => {
    if (!tourRunning) {
      setWorkspaceHandler(null);
      setGenerating(false);
      return;
    }

    // Set generating state based on tour busy state
    setGenerating(tourStep === 'workspace-edit' && tourState.isBusy);

    const handler = async (event: GuidedTourTranscriptEvent) => {
      // Convert tour events to debug events for ChatPanel display
      if (event.role === 'clear' && event.action === 'conversation') {
        await clearDebugEvents();
        return;
      }

      if (event.role === 'user') {
        // User message → conversation_message event
        await addDebugEvent('conversation_message', {
          message: {
            role: 'user',
            content: event.content
          }
        });
      } else if (event.role === 'assistant') {
        // Assistant message → conversation_message event
        const message: any = {
          role: 'assistant',
          content: event.content
        };

        // Store checkpoint ID in UI metadata if present
        if (event.checkpointId) {
          message.ui_metadata = {
            checkpointId: event.checkpointId
          };
        }

        await addDebugEvent('conversation_message', { message });

        // Emit checkpoint_created event if checkpoint ID is present
        if (event.checkpointId) {
          await addDebugEvent('checkpoint_created', {
            checkpointId: event.checkpointId,
            description: `Tour checkpoint: ${event.content.substring(0, 60)}`
          });
        }
      } else if (event.role === 'tool') {
        // Tool call → simulate tool execution sequence
        // 1. Tool call initiated
        const toolCall = {
          id: `tour-tool-${Date.now()}`,
          function: {
            name: event.name,
            arguments: JSON.stringify({ command: event.command })
          }
        };

        await addDebugEvent('toolCalls', {
          toolCalls: [toolCall]
        });

        // 2. Tool status (executing)
        await addDebugEvent('tool_status', {
          toolId: toolCall.id,
          name: event.name,
          status: 'executing'
        });

        // 3. Tool result
        await addDebugEvent('tool_result', {
          toolId: toolCall.id,
          name: event.name,
          result: event.output,
          status: 'completed'
        });

        // 4. Tool message in conversation
        await addDebugEvent('conversation_message', {
          message: {
            role: 'tool',
            content: event.output,
            tool_call_id: toolCall.id
          }
        });
      }
    };

    setWorkspaceHandler(handler);

    return () => {
      setWorkspaceHandler(null);
    };
  }, [tourRunning, tourStep, tourState.isBusy, setWorkspaceHandler, clearDebugEvents, addDebugEvent]);

  // Clear orchestrator when project or chat mode changes
  useEffect(() => {
    setPersistedOrchestrator(null);
  }, [project.id, chatMode]);

  // Auto-mount/unmount project backend context based on enabled toggle
  useEffect(() => {
    let cancelled = false;
    if (process.env.NEXT_PUBLIC_SERVER_MODE === 'true' && backendEnabled) {
      vfs.mountProjectBackendContext(project.id).then(() => {
        if (!cancelled) {
          setRefreshTrigger(prev => prev + 1);
        }
      });
    } else {
      vfs.unmountBackendContext();
      setRefreshTrigger(prev => prev + 1);
    }
    return () => { cancelled = true; };
  }, [project.id, backendEnabled]);

  // MEMORY CLEANUP: Unload project data from singletons when leaving the workspace
  // This prevents memory accumulation across project switches
  useEffect(() => {
    const projectId = project.id;

    return () => {
      // Unload checkpoint data from memory (they stay in IndexedDB)
      checkpointManager.unloadProject(projectId);

      // Clear debug events cache
      debugEventsState.unloadProject(projectId);

      // Clear any pending debounce timer for debug events
      if (saveDebounceTimer.current) {
        clearTimeout(saveDebounceTimer.current);
        saveDebounceTimer.current = null;
      }

      // Flush any pending sync for this project before leaving
      vfs.flushSyncTimeout(projectId);

      // Unmount backend context when leaving workspace
      vfs.unmountBackendContext();

      logger.debug(`[Workspace] Cleaned up memory for project ${projectId}`);
    };
  }, [project.id]);

  // Handle deployment selection change - mount/unmount backend context
  const handleDeploymentChange = useCallback(async (deploymentId: string | null, deploymentName: string | null) => {
    setSelectedDeploymentId(deploymentId);

    // Reset orchestrator so it picks up new backend context on next message
    setPersistedOrchestrator(null);

    if (deploymentId && deploymentName) {
      await vfs.mountDeploymentRuntimeContext(deploymentId);
      logger.info(`[Workspace] Connected deployment runtime: ${deploymentName}`);
    } else {
      vfs.unmountDeploymentRuntimeContext();
      logger.info('[Workspace] Disconnected deployment runtime');
    }

    // Refresh file tree
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Handle backend toggle
  const handleBackendToggle = useCallback((enabled: boolean) => {
    setBackendEnabled(enabled);
    localStorage.setItem(`osw-backend-${project.id}`, String(enabled));
  }, [project.id]);

  // Handle project settings updates (runtime, entry point)
  const handleProjectSettingsUpdate = useCallback((updated: Project) => {
    // If entry point changed, update local state and refresh preview
    const newEntryPoint = updated.settings?.previewEntryPoint;
    if (newEntryPoint !== entryPoint) {
      setEntryPoint(newEntryPoint);
      setRefreshTrigger(prev => prev + 1);
    }
    // If runtime changed, refresh preview
    if (updated.settings?.runtime !== project.settings?.runtime) {
      setRefreshTrigger(prev => prev + 1);
    }
  }, [entryPoint, project.settings?.runtime]);

  const handleFileSelect = useCallback((file: VirtualFile) => {
    // Check if we're on mobile (matches Tailwind's md breakpoint)
    const isMobile = window.innerWidth < 768;
    
    if (isMobile) {
      // On mobile, switch to editor panel and open file
      setActiveMobilePanel('editor');
      setTimeout(() => {
        openFileInEditor(file);
      }, 0);
    } else {
      // Desktop behavior remains the same
      if (!showEditor) {
        togglePanel('editor');
        setTimeout(() => {
          openFileInEditor(file);
        }, 0);
      } else {
        openFileInEditor(file);
      }
    }
  }, [showEditor]);

  const handleFilesChange = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
    window.dispatchEvent(new CustomEvent('filesChanged'));
  }, []);

  const handleSave = useCallback(async () => {
    if (saveInProgress) {
      return;
    }

    setSaveInProgress(true);
    try {
      const checkpoint = await saveManager.save(project.id);
      const latestProject = await vfs.getProject(project.id);

      setLastSavedAt(latestProject.lastSavedAt ?? new Date(checkpoint.timestamp));
      setCheckpointRefreshKey(prev => prev + 1);
      toast.success('Project saved');
    } catch (error) {
      logger.error('Failed to save project', error);
      toast.error('Failed to save project');
    } finally {
      setSaveInProgress(false);
    }

  }, [project.id, saveInProgress]);

  const handleCaptureScreenshot = useCallback(async (screenshot: string) => {
    try {
      const proj = await vfs.getProject(project.id);
      proj.previewImage = screenshot;
      proj.previewUpdatedAt = new Date();
      await vfs.updateProject(proj);
      toast.success('Thumbnail updated');
    } catch (err) {
      logger.error('Failed to save screenshot:', err);
      toast.error('Failed to save thumbnail');
    }
  }, [project.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform?.toLowerCase().includes('mac');
      const modifierPressed = isMac ? event.metaKey : event.ctrlKey;
      if (!modifierPressed) return;

      if (event.key.toLowerCase() === 's') {
        // Check if Monaco editor has focus - if so, let Monaco handle the save
        const activeElement = document.activeElement;
        const isMonacoFocused = activeElement?.closest('.monaco-editor') !== null;

        if (isMonacoFocused) {
          // Monaco editor will handle file save
          return;
        }

        // Otherwise, save the project
        event.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const handleRestoreCheckpoint = useCallback(async (checkpointId: string, description?: string) => {
    try {
      // First check if checkpoint exists
      const exists = await checkpointManager.checkpointExists(checkpointId);
      if (!exists) {
        toast.error('Checkpoint no longer exists - it may have been cleaned up');
        logger.warn(`[Workspace] Checkpoint ${checkpointId} no longer exists`);
        return;
      }

      const success = await saveManager.runWithSuppressedDirty(project.id, () =>
        checkpointManager.restoreCheckpoint(checkpointId)
      );
      if (success) {
        toast.success(`Restored to: ${description || 'checkpoint'}`);
        handleFilesChange();

        const savedId = saveManager.getSavedCheckpointId(project.id);
        if (savedId && savedId === checkpointId) {
          saveManager.markClean(project.id);
          const latestProject = await vfs.getProject(project.id);
          setLastSavedAt(latestProject.lastSavedAt ?? null);
        } else {
          saveManager.markDirty(project.id);
        }
      } else {
        toast.error('Failed to restore checkpoint');
      }
    } catch (error) {
      logger.error('Error restoring checkpoint:', error);
      toast.error('Failed to restore checkpoint');
    }
  }, [handleFilesChange, project.id]);

  const handleScrollToCheckpoint = useCallback((checkpointId: string) => {
    if (!showChat) setShowChat(true);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-checkpoint-id="${checkpointId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-primary/50');
        setTimeout(() => el.classList.remove('ring-2', 'ring-primary/50'), 2000);
      }
    });
  }, [showChat]);

  const handleRetry = useCallback(async (checkpointId: string) => {
    try {
      // First check if checkpoint exists
      const exists = await checkpointManager.checkpointExists(checkpointId);
      if (!exists) {
        toast.error('Checkpoint no longer exists - cannot retry');
        logger.warn(`[Workspace] Checkpoint ${checkpointId} no longer exists`);
        return;
      }

      // Find the user message associated with this checkpoint
      // Search backwards from the checkpoint to find the most recent user message
      let userMessageContent = null;
      const checkpointEventIndex = debugEvents.findIndex(
        e => e.event === 'checkpoint_created' && e.data?.checkpointId === checkpointId
      );

      if (checkpointEventIndex >= 0) {
        // Search backwards from checkpoint event to find user message (in conversation_message events)
        for (let i = checkpointEventIndex - 1; i >= 0; i--) {
          if (debugEvents[i].event === 'conversation_message' &&
              debugEvents[i].data?.message?.role === 'user') {
            userMessageContent = debugEvents[i].data.message.content;
            break;
          }
        }
      }

      if (!userMessageContent) {
        toast.error('Cannot find original user message to retry');
        logger.warn('[Workspace] No user message found before checkpoint');
        return;
      }

      // Find the user message event index to truncate debug events
      let userMessageIndex = -1;
      for (let i = checkpointEventIndex - 1; i >= 0; i--) {
        if (debugEvents[i].event === 'conversation_message' &&
            debugEvents[i].data?.message?.role === 'user' &&
            debugEvents[i].data.message.content === userMessageContent) {
          userMessageIndex = i;
          break;
        }
      }

      if (userMessageIndex === -1) {
        toast.error('Cannot find user message event to truncate');
        logger.warn('[Workspace] User message event not found in debug events');
        return;
      }

      // Restore the checkpoint
      const success = await saveManager.runWithSuppressedDirty(project.id, () =>
        checkpointManager.restoreCheckpoint(checkpointId)
      );
      if (!success) {
        toast.error('Failed to restore checkpoint');
        return;
      }

      const savedId = saveManager.getSavedCheckpointId(project.id);
      if (savedId && savedId === checkpointId) {
        saveManager.markClean(project.id);
        const latestProject = await vfs.getProject(project.id);
        setLastSavedAt(latestProject.lastSavedAt ?? null);
      } else {
        saveManager.markDirty(project.id);
      }

      // Truncate debug events to remove the user message and all subsequent events
      // The user message will be re-added by the orchestrator when generation runs
      const truncatedEvents = debugEvents.slice(0, userMessageIndex);
      setDebugEvents(truncatedEvents);
      await debugEventsState.truncateEvents(project.id, truncatedEvents);

      // Clear the persisted orchestrator to force fresh conversation rebuild
      setPersistedOrchestrator(null);

      toast.success('Restored checkpoint and retrying...');
      handleFilesChange();

      // Set the prompt to the original user message
      setPrompt(userMessageContent);

      // Set the retry trigger ref to initiate generation
      // This will be picked up by the useEffect watching the prompt
      retryTriggerRef.current = true;

    } catch (error) {
      logger.error('Error during retry:', error);
      toast.error('Failed to retry');
    }
  }, [handleFilesChange, project.id, debugEvents, setPrompt]);

  const handleGenerate = async (images?: PendingImage[], overridePrompt?: string) => {
    if (isTourLockingInput) {
      return;
    }

    // Clear any pending runtime errors when starting a new generation
    drainRuntimeErrors();
    setRuntimeErrors([]);

    const trimmedPrompt = (overridePrompt ?? prompt).trim();

    if (!trimmedPrompt && (!images || images.length === 0)) {
      toast.error('Please enter a prompt');
      return;
    }

    const currentProvider = configManager.getSelectedProvider();
    const providerConfig = getProvider(currentProvider);
    const apiKey = configManager.getApiKey();

    // Only require API key for providers that need it
    if (providerConfig.apiKeyRequired && !apiKey) {
      toast.error(`Please set your ${providerConfig.name} API key in settings`);
      return;
    }

    // For local providers, check if they have models available
    if (providerConfig.isLocal) {
      const localModel = configManager.getProviderModel(currentProvider);
      if (!localModel) {
        toast.error(`No model selected for ${providerConfig.name}. Please select a model in settings.`);
        return;
      }
    }

    // Determine which model to use based on chat mode
    let modelToUse = configManager.getProviderModel(currentProvider) || configManager.getDefaultModel();
    if (typeof window !== 'undefined') {
      const useSeparateChatModel = localStorage.getItem(`osw-studio-use-separate-chat-model-${currentProvider}`) === 'true';
      if (useSeparateChatModel) {
        if (chatMode) {
          const chatModel = localStorage.getItem(`osw-studio-chat-model-${currentProvider}`);
          if (chatModel) modelToUse = chatModel;
        } else {
          const codeModel = localStorage.getItem(`osw-studio-code-model-${currentProvider}`);
          if (codeModel) modelToUse = codeModel;
        }
      }
    }

    // Validate that we have a model selected
    if (!modelToUse) {
      toast.error(`No model selected for ${chatMode ? 'chat' : 'code'} mode. Please select a model in settings.`);
      return;
    }

    setGenerating(true);
    window.dispatchEvent(new CustomEvent('generationStateChanged', { detail: { generating: true } }));
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    track('task_started', { provider: currentProvider, model: modelToUse, task_id: taskId });
    const taskStartTime = Date.now();
    let messageContent = trimmedPrompt;
    const contextParts: string[] = [];
    if (focusContext) {
      contextParts.push(formatFocusContextBlock(focusContext));
    }
    if (placedBlocks.length > 0) {
      contextParts.push(formatPlacedBlocksContext(placedBlocks));
    }
    if (contextParts.length > 0) {
      messageContent = contextParts.join('\n\n') + '\n\n' + messageContent;
    }

    // Note: User message will be added by orchestrator via conversation_message event
    // No need to manually add user_message event here to avoid duplication

    try {
      // Reuse existing orchestrator or create new one
      let orchestrator = persistedOrchestrator;

      if (!orchestrator) {
        orchestrator = new MultiAgentOrchestrator(
          project.id,
          'orchestrator',
          addDebugEvent,
          { chatMode, model: modelToUse }
        );

        // Extract and restore conversation history from debug events
        const conversationMessages = debugEvents
          .filter(event => event.event === 'conversation_message')
          .map(event => event.data.message);

        if (conversationMessages.length > 0) {
          orchestrator.importConversation(conversationMessages);
          logger.debug(`[Workspace] Restored ${conversationMessages.length} conversation messages from debug events`);
        }

        setPersistedOrchestrator(orchestrator);
      }

      // Store orchestrator reference for stop functionality
      setCurrentOrchestrator(orchestrator);

      // Build images array for orchestrator
      const imageData = images?.map(img => ({
        data: img.data,
        mediaType: img.mediaType
      }));

      // Build context metadata for UI display (collapsed cards in user message)
      const executeOptions: Parameters<typeof orchestrator.execute>[1] = {};
      // Pass clean prompt for display (without prepended focus/semantic context)
      if (focusContext || placedBlocks.length > 0) {
        executeOptions.displayPrompt = trimmedPrompt;
      }
      if (imageData?.length) {
        executeOptions.images = imageData;
      }
      if (focusContext) {
        executeOptions.focusContext = {
          domPath: focusContext.domPath,
          snippet: truncateHtmlSnippet(focusContext.outerHTML, 240),
        };
      }
      if (placedBlocks.length > 0) {
        executeOptions.semanticBlocks = placedBlocks.map(pb => {
          const block = getBlockById(pb.blockId);
          return {
            name: block?.name || pb.blockId,
            domPath: pb.domPath,
            position: pb.position,
            description: block?.description || '',
          };
        });
      }

      // Execute - orchestrator handles conversation history internally
      const result = await orchestrator.execute(messageContent, Object.keys(executeOptions).length > 0 ? executeOptions : undefined);

      logger.debug('[Workspace] Orchestrator result:', {
        success: result.success,
        summary: result.summary,
        totalCost: result.totalCost
      });

      if (result.success) {
        handleFilesChange();

        // Re-fetch backend context to ensure file explorer shows latest state
        if (vfs.hasServerContext()) {
          await vfs.refreshServerContext();
        }

        track('task_complete', {
          provider: currentProvider,
          model: modelToUse,
          duration_ms: Date.now() - taskStartTime,
          task_id: taskId,
          tool_count: result.toolCount ?? 0,
          turn_count: result.turnCount ?? 0,
          api_error_count: result.apiErrorCount ?? 0,
        });
        toast.success('Task completed');
      } else {
        track('task_fail', {
          provider: currentProvider,
          model: modelToUse,
          reason: 'api_error',
          duration_ms: Date.now() - taskStartTime,
          task_id: taskId,
          tool_count: result.toolCount ?? 0,
          turn_count: result.turnCount ?? 0,
          api_error_count: result.apiErrorCount ?? 0,
        });
        toast.error(result.summary || 'Generation failed', {
          duration: 5000,
          position: 'bottom-center'
        });
      }

      setPrompt('');
      if (focusContext) {
        setFocusContext(null);
      }
      if (placedBlocks.length > 0) {
        setPlacedBlocks([]);
      }
    } catch (error) {
      logger.error('Generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate';

      track('task_fail', {
        provider: currentProvider,
        model: modelToUse,
        reason: 'api_error',
        duration_ms: Date.now() - taskStartTime,
        task_id: taskId,
      });

      // Emit error event to clear thinking indicator in chat panel
      addDebugEvent('error', { message: errorMessage });

      toast.error(errorMessage, {
        duration: 5000,
        position: 'bottom-center'
      });
    } finally {
      setGenerating(false);
      window.dispatchEvent(new CustomEvent('generationStateChanged', { detail: { generating: false } }));
      // Don't clear currentOrchestrator - only used for stop functionality
      // The persisted orchestrator maintains conversation history
      setCurrentOrchestrator(null);
    }
  };

  const handleStop = useCallback(() => {
    if (currentOrchestrator) {
      currentOrchestrator.stop();
      track('task_fail', {
        provider: configManager.getSelectedProvider(),
        model: configManager.getDefaultModel(),
        reason: 'stopped',
      });
      toast.info('Generation stopped');
    }
  }, [currentOrchestrator]);

  const handleContinue = useCallback(() => {
    if (currentOrchestrator) {
      currentOrchestrator.continue();
      toast.info('Resuming task...');
    }
  }, [currentOrchestrator]);

  const handleSendRuntimeErrors = useCallback(() => {
    const errors = drainRuntimeErrors();
    if (errors.length === 0) return;
    setRuntimeErrors([]);
    handleGenerate(undefined, formatRuntimeErrors(errors));
  }, [handleGenerate]);

  const handleClearRuntimeErrors = useCallback(() => {
    drainRuntimeErrors();
    setRuntimeErrors([]);
  }, []);

  // Watch for retry trigger and execute generation
  useEffect(() => {
    if (retryTriggerRef.current && prompt.trim()) {
      // Use setTimeout to ensure the prompt state has fully updated
      setTimeout(() => {
        handleGenerate();
        // Reset the retry flag after generation starts
        retryTriggerRef.current = false;
      }, 50);
    }
  }, [prompt]);

  const headerActions: HeaderAction[] = [
    {
      id: 'back',
      label: 'Back to projects',
      icon: ArrowLeft,
      onClick: onBack,
      variant: 'outline'
    }
  ];

  headerActions.push({
    id: 'save',
    label: saveInProgress ? 'Saving…' : isDirty ? 'Save' : 'Saved',
    icon: Save,
    onClick: handleSave,
    variant: isDirty ? 'default' : 'outline',
    disabled: !isDirty || saveInProgress
  });

  if (initialCheckpointId) {
    headerActions.push({
      id: 'discard',
      label: 'Discard Changes',
      icon: RotateCcw,
      onClick: () => handleRestoreCheckpoint(initialCheckpointId, 'Last saved state'),
      variant: 'outline',
      disabled: saveInProgress || !isDirty,
      dataTourId: 'discard-changes-button'
    });
  }

  // Desktop header content: Deployment selector + Settings
  const desktopHeaderContent = (
    <div className="flex items-center gap-3">
      {/* Deployment selector for backend context */}
      <DeploymentSelector
        projectId={project.id}
        selectedDeploymentId={selectedDeploymentId}
        onDeploymentChange={handleDeploymentChange}
        workspaceId={workspaceId}
      />

      {/* Project settings button */}
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-3 flex items-center gap-2"
        onClick={() => setShowProjectSettingsModal(true)}
        title="Project Settings"
      >
        <Settings2 className="h-4 w-4" />
        <span className="text-sm hidden lg:inline">Project</span>
      </Button>

      {/* Settings popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 flex items-center gap-2"
            title="Project cost and settings"
          >
            {shouldShowCosts && (
              <span className="text-sm font-medium">
                ${projectCost.toFixed(3)}
              </span>
            )}
            <Settings className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[460px] max-h-[min(720px,calc(100vh-5rem))] overflow-hidden flex flex-col" align="end">
          <SettingsPanel />
        </PopoverContent>
      </Popover>
    </div>
  );

  const mobileMenuContent = (
    <div className="space-y-2">
      {shouldShowCosts && (
        <div className="pb-2 border-b border-border/50">
          <span className="text-sm font-medium">
            Project cost: ${projectCost.toFixed(projectCost >= 10 ? 2 : 3)}
          </span>
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start"
        onClick={() => setShowProjectSettingsModal(true)}
      >
        <Settings2 className="h-4 w-4 mr-2" />
        Project Settings
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[460px] max-w-[calc(100vw-2rem)] max-h-[min(720px,calc(100vh-5rem))] overflow-hidden flex flex-col" align="start">
          <SettingsPanel />
        </PopoverContent>
      </Popover>
    </div>
  );

  if (fullscreenPreview) {
    return (
      <div className="h-[100dvh] flex flex-col bg-background">
        <MultipagePreview
          ref={previewRef}
          projectId={project.id}
          refreshTrigger={refreshTrigger}
          onFocusSelection={handleFocusSelection}
          hasFocusTarget={Boolean(focusContext)}
          onClose={handleExitFullscreen}
          deploymentId={selectedDeploymentId}
          onCaptureScreenshot={handleCaptureScreenshot}
          entryPoint={entryPoint}
          runtime={project.settings?.runtime}
          placementActive={paletteOpen}
          onPlacementToggle={handlePlacementToggle}
          onPlacementComplete={handlePlacementComplete}
          isFullscreen
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="h-[100dvh] flex flex-col">
        {/* Header */}
        <AppHeader
          leftText={project.name}
          onLogoClick={onBack}
          actions={headerActions}
          mobileMenuContent={mobileMenuContent}
          desktopOnlyContent={desktopHeaderContent}
          mobileVisibleActions={isDirty ? ['save'] : []}
        />

        {/* Desktop Workspace */}
        <div className="hidden md:flex flex-1 overflow-hidden bg-background">
          {/* Left sidebar for panel toggles */}
          <div className="w-10 bg-muted/70 border-r border-border flex flex-col items-center py-3 gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`h-5 w-5 px-1 rounded-sm flex items-center justify-center transition-all ${
                    showChat
                      ? 'shadow-sm'
                      : 'bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                  style={{
                    backgroundColor: showChat ? 'var(--button-assistant-active)' : undefined,
                    color: showChat ? 'white' : undefined
                  }}
                  onClick={() => togglePanel('chat')}
                  onMouseEnter={() => handleSidebarHover('chat')}
                  onMouseLeave={() => handleSidebarHover(null)}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="border-0"
                style={{
                  backgroundColor: 'var(--button-assistant-active)',
                  color: 'white'
                }}
                arrowStyle={{
                  backgroundColor: 'var(--button-assistant-active)',
                  fill: 'var(--button-assistant-active)'
                }}
              >
                <p>Chat</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`h-5 w-5 px-1 rounded-sm flex items-center justify-center transition-all ${
                    showFiles
                      ? 'shadow-sm'
                      : 'bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                  style={{
                    backgroundColor: showFiles ? 'var(--button-files-active)' : undefined,
                    color: showFiles ? 'white' : undefined
                  }}
                  onClick={() => togglePanel('files')}
                  onMouseEnter={() => handleSidebarHover('files')}
                  onMouseLeave={() => handleSidebarHover(null)}
                >
                  <FolderTree className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="border-0"
                style={{
                  backgroundColor: 'var(--button-files-active)',
                  color: 'white'
                }}
                arrowStyle={{
                  backgroundColor: 'var(--button-files-active)',
                  fill: 'var(--button-files-active)'
                }}
              >
                <p>File Explorer</p>
              </TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`h-5 w-5 px-1 rounded-sm flex items-center justify-center transition-all ${
                    showEditor 
                      ? 'shadow-sm' 
                      : 'bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                  style={{
                    backgroundColor: showEditor ? 'var(--button-editor-active)' : undefined,
                    color: showEditor ? 'white' : undefined
                  }}
                  onClick={() => togglePanel('editor')}
                  onMouseEnter={() => handleSidebarHover('editor')}
                  onMouseLeave={() => handleSidebarHover(null)}
                >
                  <Code2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent 
                side="right" 
                className="border-0"
                style={{ 
                  backgroundColor: 'var(--button-editor-active)', 
                  color: 'white'
                }}
                arrowStyle={{
                  backgroundColor: 'var(--button-editor-active)',
                  fill: 'var(--button-editor-active)'
                }}
              >
                <p>Code Editor</p>
              </TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`h-5 w-5 mx-1 rounded-sm flex items-center justify-center transition-all ${
                    showPreview
                      ? 'shadow-sm'
                      : 'bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                  style={{
                    backgroundColor: showPreview ? 'var(--button-preview-active)' : undefined,
                    color: showPreview ? 'white' : undefined
                  }}
                  onClick={() => togglePanel('preview')}
                  onMouseEnter={() => handleSidebarHover('preview')}
                  onMouseLeave={() => handleSidebarHover(null)}
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="border-0"
                style={{
                  backgroundColor: 'var(--button-preview-active)',
                  color: 'white'
                }}
                arrowStyle={{
                  backgroundColor: 'var(--button-preview-active)',
                  fill: 'var(--button-preview-active)'
                }}
              >
                <p>Preview</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`h-5 w-5 px-1 rounded-sm flex items-center justify-center transition-all ${
                    showSkillsPanel
                      ? 'shadow-sm'
                      : 'bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                  style={{
                    backgroundColor: showSkillsPanel ? 'var(--button-skills-active, #a855f7)' : undefined,
                    color: showSkillsPanel ? 'white' : undefined
                  }}
                  onClick={() => togglePanel('skills')}
                  onMouseEnter={() => handleSidebarHover('skills')}
                  onMouseLeave={() => handleSidebarHover(null)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="border-0"
                style={{
                  backgroundColor: 'var(--button-skills-active, #a855f7)',
                  color: 'white'
                }}
                arrowStyle={{
                  backgroundColor: 'var(--button-skills-active, #a855f7)',
                  fill: 'var(--button-skills-active, #a855f7)'
                }}
              >
                <p>Skills</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`relative h-5 w-5 px-1 rounded-sm flex items-center justify-center transition-all ${
                    showConsole
                      ? 'shadow-sm'
                      : 'bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                  style={{
                    backgroundColor: showConsole ? 'var(--button-terminal-active, #22c55e)' : undefined,
                    color: showConsole ? 'white' : undefined
                  }}
                  onClick={() => togglePanel('console')}
                  onMouseEnter={() => handleSidebarHover('console')}
                  onMouseLeave={() => handleSidebarHover(null)}
                >
                  <TerminalIcon className="h-3.5 w-3.5" />
                  {hasUnreadConsole && !showConsole && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--button-terminal-active,#22c55e)]" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="border-0"
                style={{
                  backgroundColor: 'var(--button-terminal-active, #22c55e)',
                  color: 'white'
                }}
                arrowStyle={{
                  backgroundColor: 'var(--button-terminal-active, #22c55e)',
                  fill: 'var(--button-terminal-active, #22c55e)'
                }}
              >
                <p>Console</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`h-5 w-5 px-1 rounded-sm flex items-center justify-center transition-all ${
                    showCheckpoints
                      ? 'shadow-sm'
                      : 'bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                  style={{
                    backgroundColor: showCheckpoints ? 'var(--button-checkpoint-active)' : undefined,
                    color: showCheckpoints ? 'white' : undefined
                  }}
                  onClick={() => togglePanel('checkpoints')}
                  onMouseEnter={() => handleSidebarHover('checkpoints')}
                  onMouseLeave={() => handleSidebarHover(null)}
                >
                  <History className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="border-0"
                style={{
                  backgroundColor: 'var(--button-checkpoint-active)',
                  color: 'white'
                }}
                arrowStyle={{
                  backgroundColor: 'var(--button-checkpoint-active)',
                  fill: 'var(--button-checkpoint-active)'
                }}
              >
                <p>Checkpoints</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`h-5 w-5 px-1 rounded-sm flex items-center justify-center transition-all ${
                    showDebugPanel
                      ? 'bg-foreground shadow-sm'
                      : 'bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                  style={{
                    color: showDebugPanel ? 'var(--background)' : undefined
                  }}
                  onClick={() => togglePanel('debug')}
                  onMouseEnter={() => handleSidebarHover('debug')}
                  onMouseLeave={() => handleSidebarHover(null)}
                >
                  <Bug className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="border-0 bg-foreground text-background"
                arrowStyle={{
                  backgroundColor: 'var(--foreground)',
                  fill: 'var(--foreground)'
                }}
              >
                <p>Debug Events</p>
              </TooltipContent>
            </Tooltip>

          </div>
          
          {/* Main content area — slot-based layout (max 3 panels) */}
          <div
            ref={panelContainerRef}
            className="flex-1 p-2 overflow-hidden"
            data-tour-id="workspace-panels"
            onMouseMove={draggingPanel ? handleDragMouseMove : undefined}
            onMouseUp={draggingPanel ? handlePanelDragEnd : undefined}
          >
          <PanelDragProvider value={{ onDragStart: handlePanelDragStart, draggingPanel }}>
          <ResizablePanelGroup ref={panelGroupRef} direction="horizontal" autoSaveId="workspace-slots">
            {(() => {
              // Build ordered list of visible panels using panelOrder
              const panelMap: Record<string, { minSize: number; content: React.ReactNode }> = {};

              if (showChat) panelMap['chat'] = { minSize: 15, content: (
                <ChatPanel
                  events={debugEvents}
                  onRestore={handleRestoreCheckpoint}
                  onRetry={handleRetry}
                  prompt={prompt}
                  setPrompt={setPrompt}
                  generating={generating}
                  onGenerate={handleGenerate}
                  onStop={handleStop}
                  onContinue={handleContinue}
                  focusContext={focusContext}
                  setFocusContext={setFocusContext}
                  focusPreviewSnippet={focusPreviewSnippet}
                  chatMode={chatMode}
                  setChatMode={setChatMode}
                  currentModel={currentModel}
                  setCurrentModel={setCurrentModel}
                  getModelDisplayName={getModelDisplayName}
                  isTourLockingInput={isTourLockingInput}
                  onClearChat={clearDebugEvents}
                  onClose={() => setShowChat(false)}
                  supportsVision={supportsVision}
                  providerReady={providerReady}
                  runtimeErrors={runtimeErrors}
                  onSendRuntimeErrors={handleSendRuntimeErrors}
                  onClearRuntimeErrors={handleClearRuntimeErrors}
                  placedBlocks={placedBlocks}
                  onRemovePlacedBlock={handleRemovePlacedBlock}
                  onClearPlacedBlocks={handleClearPlacedBlocks}
                />
              )};

              if (showFiles) panelMap['files'] = { minSize: 14, content: (
                <div className="h-full border border-border rounded-lg shadow-sm overflow-hidden relative" style={{ background: `linear-gradient(0deg, rgba(var(--panel-files-rgb), 0.01), rgba(var(--panel-files-rgb), 0.01)), var(--card)`, minWidth: '240px' }}>
                  <FileExplorer
                    projectId={project.id}
                    onFileSelect={handleFileSelect}
                    onClose={() => setShowFiles(false)}
                    entryPoint={entryPoint}
                    onSetEntryPoint={handleSetEntryPoint}
                    onAddPromptFile={handleAddPromptFile}
                  />
                </div>
              )};

              if (showEditor) panelMap['editor'] = { minSize: 20, content: (
                <div className="h-full border border-border rounded-lg shadow-sm overflow-hidden relative" style={{ background: `linear-gradient(0deg, rgba(var(--panel-editor-rgb), 0.01), rgba(var(--panel-editor-rgb), 0.01)), var(--card)`, minWidth: '240px' }}>
                  <MultiTabEditor
                    projectId={project.id}
                    runtime={project.settings?.runtime}
                    onClose={() => setShowEditor(false)}
                  />
                </div>
              )};

              if (showConsole) panelMap['console'] = { minSize: 15, content: (
                <div className="h-full border border-border rounded-lg shadow-sm overflow-hidden relative" style={{ minWidth: '240px' }}>
                  <ConsolePanel
                    projectId={project.id}
                    runtime={project.settings?.runtime || 'handlebars'}
                    bufferedMessages={consoleBufferRef.current}
                    onBufferConsumed={() => { consoleBufferRef.current = []; }}
                    onClose={() => setShowConsole(false)}
                  />
                </div>
              )};

              if (showPreview) panelMap['preview'] = { minSize: 20, content: (
                <div className="h-full border border-border rounded-lg shadow-sm overflow-hidden relative" style={{ background: `linear-gradient(0deg, rgba(var(--panel-preview-rgb), 0.01), rgba(var(--panel-preview-rgb), 0.01)), var(--card)`, minWidth: '240px' }}>
                  <MultipagePreview
                    ref={previewRef}
                    projectId={project.id}
                    refreshTrigger={refreshTrigger}
                    onFocusSelection={handleFocusSelection}
                    hasFocusTarget={Boolean(focusContext)}
                    onClose={handleClosePreview}
                    deploymentId={selectedDeploymentId}
                    onCaptureScreenshot={handleCaptureScreenshot}
                    entryPoint={entryPoint}
                    runtime={project.settings?.runtime}
                    placementActive={paletteOpen}
                    onPlacementToggle={handlePlacementToggle}
                    onPlacementComplete={handlePlacementComplete}
                    onFullscreen={handleEnterFullscreen}
                  />
                </div>
              )};

              if (showCheckpoints) panelMap['checkpoints'] = { minSize: 12, content: (
                <CheckpointPanel
                  projectId={project.id}
                  events={debugEvents}
                  currentCheckpointId={checkpointManager.getCurrentCheckpoint()?.id}
                  onRestore={handleRestoreCheckpoint}
                  onScrollToTurn={handleScrollToCheckpoint}
                  onClose={() => setShowCheckpoints(false)}
                  refreshKey={checkpointRefreshKey}
                />
              )};

              if (showDebugPanel) panelMap['debug'] = { minSize: 15, content: (
                <DebugPanel events={debugEvents} onClear={clearDebugEvents} onClose={() => setShowDebugPanel(false)} projectId={project.id} />
              )};

              if (showSkillsPanel) panelMap['skills'] = { minSize: 10, content: (
                <SkillsPanel onClose={() => setShowSkillsPanel(false)} />
              )};

              // Order visible panels by panelOrder
              const visiblePanels = panelOrder
                .filter(key => key in panelMap)
                .map(key => ({ key, ...panelMap[key] }));

              // Render panels with either resize handles (normal) or drop zones (during drag)
              const elements: React.ReactNode[] = [];
              const isDragging = !!draggingPanel;

              // Helper: render a drop zone that matches resize handle dimensions (w-2 mx-1)
              const dropZone = (position: number) => (
                <div
                  key={`drop-${position}`}
                  ref={(el) => registerDropZone(position, el)}
                  className={`shrink-0 rounded-[3px] border border-dashed animate-expand-indicator ${
                    dropTarget === position
                      ? 'bg-primary/40 border-primary/60'
                      : 'bg-muted/50 border-muted-foreground'
                  }`}
                />
              );

              const dragIdx = isDragging ? visiblePanels.findIndex(p => p.key === draggingPanel) : -1;

              // Insert-position indicator (shown when hovering sidebar to add a panel when there's room)
              const insertIndicator = (position: number) => (
                <div
                  key={`insert-${position}`}
                  className="shrink-0 rounded-[3px] bg-primary/40 border border-dashed border-primary/60 animate-expand-indicator"
                />
              );

              visiblePanels.forEach((panel, idx) => {
                // Left edge drop zone (before first panel)
                if (isDragging && idx === 0 && dragIdx !== 0) {
                  elements.push(dropZone(0));
                }
                if (idx > 0) {
                  if (isDragging) {
                    const isDroppable = !(idx === dragIdx || idx === dragIdx + 1);
                    // Hide resize handle inside a collapsing wrapper (animates out as drop zone animates in)
                    elements.push(
                      <div key={`handle-wrap-${idx}`} className="animate-collapse-indicator shrink-0 overflow-hidden">
                        <ResizableHandle key={`handle-${idx}`} withHandle className="pointer-events-none opacity-0" />
                      </div>
                    );
                    if (isDroppable) {
                      elements.push(dropZone(idx));
                    } else {
                      elements.push(<div key={`spacer-${idx}`} className="w-2 mx-1 shrink-0" />);
                    }
                  } else {
                    elements.push(<ResizableHandle key={`handle-${idx}`} withHandle />);
                  }
                }

                elements.push(
                  <ResizablePanel
                    key={panel.key}
                    id={`panel-${panel.key}`}
                    order={idx + 1}
                    defaultSize={baseSize}
                    minSize={panel.minSize}
                  >
                    <div
                      className="h-full rounded-lg relative"
                      data-panel-id={panel.key}
                    >
                      {/* Replace-preview / drag highlight overlay — renders on top of panel border */}
                      {((isDragging && panel.key === draggingPanel) || panelReplacePreview === panel.key) && (
                        <div
                          className="absolute inset-0 rounded-lg pointer-events-none z-50"
                          style={{
                            border: `1px dashed ${
                              (isDragging && panel.key === draggingPanel && dropTarget !== null)
                                ? 'var(--color-muted-foreground)'
                                : 'var(--color-primary)'
                            }`,
                          }}
                        />
                      )}
                      {panel.content}
                    </div>
                  </ResizablePanel>
                );

                // Insert preview after last panel
                if (!isDragging && panelInsertPreview === idx + 1 && idx === visiblePanels.length - 1) {
                  elements.push(insertIndicator(idx + 1));
                }
              });

              // Right edge drop zone
              if (isDragging && dragIdx !== visiblePanels.length - 1) {
                elements.push(dropZone(visiblePanels.length));
              }

              return elements;
            })()}

          </ResizablePanelGroup>
          </PanelDragProvider>
          </div>
        </div>

        {/* Mobile Workspace */}
        <div className="flex md:hidden flex-1 overflow-hidden bg-background flex-col">
          {/* Single active panel */}
          <div className="flex-1 p-2 pb-16 overflow-hidden">
            {activeMobilePanel === 'chat' && (
              <ChatPanel
                events={debugEvents}
                onRestore={handleRestoreCheckpoint}
                onRetry={handleRetry}
                prompt={prompt}
                setPrompt={setPrompt}
                generating={generating}
                onGenerate={handleGenerate}
                onStop={handleStop}
                onContinue={handleContinue}
                focusContext={focusContext}
                setFocusContext={setFocusContext}
                focusPreviewSnippet={focusPreviewSnippet}
                chatMode={chatMode}
                setChatMode={setChatMode}
                currentModel={currentModel}
                setCurrentModel={setCurrentModel}
                getModelDisplayName={getModelDisplayName}
                isTourLockingInput={isTourLockingInput}
                onClearChat={clearDebugEvents}
                supportsVision={supportsVision}
                providerReady={providerReady}
                runtimeErrors={runtimeErrors}
                onSendRuntimeErrors={handleSendRuntimeErrors}
                onClearRuntimeErrors={handleClearRuntimeErrors}
                placedBlocks={placedBlocks}
                onRemovePlacedBlock={handleRemovePlacedBlock}
                onClearPlacedBlocks={handleClearPlacedBlocks}
              />
            )}

            {activeMobilePanel === 'files' && (
              <div className="h-full border border-border rounded-lg shadow-sm overflow-hidden relative" style={{ background: `linear-gradient(0deg, rgba(var(--panel-files-rgb), 0.01), rgba(var(--panel-files-rgb), 0.01)), var(--card)` }}>
                <FileExplorer
                  projectId={project.id}
                  onFileSelect={handleFileSelect}
                  onClose={() => setShowFiles(false)}
                  entryPoint={entryPoint}
                  onSetEntryPoint={handleSetEntryPoint}
                  onAddPromptFile={handleAddPromptFile}
                />
              </div>
            )}

            {activeMobilePanel === 'editor' && (
              <div className="h-full border border-border rounded-lg shadow-sm overflow-hidden relative" style={{ background: `linear-gradient(0deg, rgba(var(--panel-editor-rgb), 0.01), rgba(var(--panel-editor-rgb), 0.01)), var(--card)` }}>
                <MultiTabEditor
                  projectId={project.id}
                  runtime={project.settings?.runtime}
                  onClose={() => setShowEditor(false)}
                />
              </div>
            )}

            {activeMobilePanel === 'preview' && (
              <div className="h-full border border-border rounded-lg shadow-sm overflow-hidden relative" style={{ background: `linear-gradient(0deg, rgba(var(--panel-preview-rgb), 0.01), rgba(var(--panel-preview-rgb), 0.01)), var(--card)` }}>
                <MultipagePreview
                  ref={previewRef}
                  projectId={project.id}
                  refreshTrigger={refreshTrigger}
                  onFocusSelection={handleFocusSelection}
                  hasFocusTarget={Boolean(focusContext)}
                  onClose={handleClosePreview}
                  deploymentId={selectedDeploymentId}
                  onCaptureScreenshot={handleCaptureScreenshot}
                  entryPoint={entryPoint}
                  runtime={project.settings?.runtime}
                  placementActive={paletteOpen}
                  onPlacementToggle={handlePlacementToggle}
                  onPlacementComplete={handlePlacementComplete}
                />
              </div>
            )}

            {activeMobilePanel === 'console' && (
              <div className="h-full border border-border rounded-lg shadow-sm overflow-hidden relative">
                <ConsolePanel
                  projectId={project.id}
                  runtime={project.settings?.runtime || 'handlebars'}
                  bufferedMessages={consoleBufferRef.current}
                  onBufferConsumed={() => { consoleBufferRef.current = []; }}
                />
              </div>
            )}
          </div>

          {/* Bottom Navigation Bar */}
          <div className="fixed bottom-0 left-0 right-0 z-20 bg-card border-t border-border">
            <div className="flex justify-center items-center p-2 gap-2">
              <button
                className={`flex items-center justify-center py-2 px-2 rounded-lg transition-all shadow-sm ${
                  activeMobilePanel === 'chat'
                    ? 'text-white'
                    : 'bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                }`}
                style={{
                  backgroundColor: activeMobilePanel === 'chat' ? 'var(--button-assistant-active)' : undefined,
                }}
                onClick={() => setActiveMobilePanel('chat')}
              >
                <MessageSquare className="h-4 w-4" />
              </button>
              
              <button
                className={`flex items-center justify-center py-2 px-2 rounded-lg transition-all shadow-sm ${
                  activeMobilePanel === 'files'
                    ? 'text-white'
                    : 'bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                }`}
                style={{
                  backgroundColor: activeMobilePanel === 'files' ? 'var(--button-files-active)' : undefined,
                }}
                onClick={() => setActiveMobilePanel('files')}
              >
                <FolderTree className="h-4 w-4" />
              </button>
              
              <button
                className={`flex items-center justify-center py-2 px-2 rounded-lg transition-all shadow-sm ${
                  activeMobilePanel === 'editor'
                    ? 'text-white'
                    : 'bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                }`}
                style={{
                  backgroundColor: activeMobilePanel === 'editor' ? 'var(--button-editor-active)' : undefined,
                }}
                onClick={() => setActiveMobilePanel('editor')}
              >
                <Code2 className="h-4 w-4" />
              </button>
              
              <button
                className={`flex items-center justify-center py-2 px-2 rounded-lg transition-all shadow-sm ${
                  activeMobilePanel === 'preview'
                    ? 'text-white'
                    : 'bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                }`}
                style={{
                  backgroundColor: activeMobilePanel === 'preview' ? 'var(--button-preview-active)' : undefined,
                }}
                onClick={() => setActiveMobilePanel('preview')}
              >
                <Eye className="h-4 w-4" />
              </button>

              <button
                className={`relative flex items-center justify-center py-2 px-2 rounded-lg transition-all shadow-sm ${
                  activeMobilePanel === 'console'
                    ? 'text-white'
                    : 'bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                }`}
                style={{
                  backgroundColor: activeMobilePanel === 'console' ? 'var(--button-terminal-active, #22c55e)' : undefined,
                }}
                onClick={() => setActiveMobilePanel('console')}
              >
                <TerminalIcon className="h-4 w-4" />
                {hasUnreadConsole && activeMobilePanel !== 'console' && (
                  <span className="absolute top-1 right-0.5 h-2 w-2 rounded-full bg-[var(--button-terminal-active,#22c55e)]" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <GuidedTourOverlay location="workspace" />
      <GuidedTourOverlay location="settings" />

      <ProjectSettingsModal
        project={project}
        isOpen={showProjectSettingsModal}
        onClose={() => setShowProjectSettingsModal(false)}
        onProjectUpdate={handleProjectSettingsUpdate}
        enabled={backendEnabled}
        onToggleEnabled={handleBackendToggle}
        workspaceId={workspaceId}
      />

    </TooltipProvider>
  );
}
