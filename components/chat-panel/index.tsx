'use client';

import { useState, useEffect, useRef, useMemo, useCallback, DragEvent, ClipboardEvent } from 'react';
import { MessageSquare, Loader2, CheckCircle, XCircle, ChevronRight, FileCode, ClipboardList, Bot, RotateCcw, RefreshCw, Send, ChevronUp, ChevronDown, Code, Trash2, X, Brain, Image as ImageIcon } from 'lucide-react';
import { DebugEvent } from '@/components/debug-panel';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { PanelContainer, PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ModelSettingsPanel } from '@/components/settings/model-settings';
import { FocusContextPayload } from '@/lib/preview/types';
import { PendingImage } from '@/lib/llm/multi-agent-orchestrator';
import { ContentBlock } from '@/lib/llm/types';
import type { PlacedBlock } from '@/lib/semantic-blocks/types';
import { MessageContext } from '@/components/message-context';

type FocusTarget = FocusContextPayload & { timestamp: number };

// Helper to render user message content (string or ContentBlock[])
function UserMessageContent({ content, hideImages }: { content: string | ContentBlock[]; hideImages?: boolean }) {
  if (typeof content === 'string') {
    return <div className="whitespace-pre-wrap">{content}</div>;
  }

  // Separate text and image blocks
  const textBlocks = content.filter(b => b.type === 'text');
  const imageBlocks = hideImages ? [] : content.filter(b => b.type === 'image_url');

  return (
    <div className="space-y-2">
      {/* Render text blocks */}
      {textBlocks.map((block, index) => (
        <div key={`text-${index}`} className="whitespace-pre-wrap">
          {block.type === 'text' && block.text}
        </div>
      ))}

      {/* Render images in a flex container (when not handled by MessageContext) */}
      {imageBlocks.length > 0 && (
        <div className="flex flex-wrap gap-2 p-1 rounded-md bg-muted/50">
          {imageBlocks.map((block, index) => (
            block.type === 'image_url' && (
              <img
                key={`img-${index}`}
                src={block.image_url.url}
                alt="Attached image"
                className="h-[60px] w-auto rounded border border-border object-cover"
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}

interface ChatPanelProps {
  events: DebugEvent[];
  onRestore?: (checkpointId: string) => void;
  onRetry?: (checkpointId: string) => void;
  // Input functionality
  prompt: string;
  setPrompt: (value: string) => void;
  generating: boolean;
  onGenerate: (images?: PendingImage[]) => void;
  onStop: () => void;
  onContinue?: () => void;
  // Focus context
  focusContext: FocusTarget | null;
  setFocusContext: (context: FocusTarget | null) => void;
  focusPreviewSnippet?: string;
  // Settings
  chatMode: boolean;
  setChatMode: (mode: boolean) => void;
  currentModel: string;
  setCurrentModel: (model: string) => void;
  getModelDisplayName: (modelId: string) => string;
  // Tour/lock state
  isTourLockingInput?: boolean;
  // Clear chat
  onClearChat?: () => void;
  // Close panel
  onClose?: () => void;
  // Vision support
  supportsVision?: boolean;
  // Provider has credentials configured
  providerReady?: boolean;
  // Runtime errors
  runtimeErrors?: string[];
  onSendRuntimeErrors?: () => void;
  onClearRuntimeErrors?: () => void;
  // Semantic blocks
  placedBlocks?: PlacedBlock[];
  onRemovePlacedBlock?: (placementId: string) => void;
  onClearPlacedBlocks?: () => void;
}

interface ToolCall {
  id: string;
  name: string;
  parameters?: any;
  status?: 'pending' | 'executing' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

interface TurnItem {
  id: string;
  type: 'waiting' | 'reasoning' | 'plan' | 'agent' | 'progress' | 'tool' | 'text' | 'error' | 'error_paused' | 'user' | 'synthetic_error' | 'project_context' | 'compaction';
  timestamp: number;
  data: any;
  eventId?: string;  // Links item to its source debug event (for coalesced updates)
  complete?: boolean; // For reasoning items: true when reasoning is finished
  focusContext?: { domPath: string; snippet: string };
  semanticBlocks?: Array<{ name: string; domPath: string; position: string; description: string }>;
}

interface Turn {
  id: string;
  items: TurnItem[];
  usage?: any;
  iteration?: number;
  checkpointId?: string;
  taskStartTime?: number;
}

function classifyShellCommand(cmd: string | string[] | undefined): 'shell' | 'write' | 'status' | 'delegate' {
  if (!cmd) return 'shell';
  const s = (Array.isArray(cmd) ? cmd.join(' ') : String(cmd)).trimStart();

  if (/^delegate\b/.test(s)) return 'delegate';
  if (/^status\b/.test(s)) return 'status';
  if (/^build\b/.test(s)) return 'status';

  if (/^cat\s.*>/.test(s)) return 'write';
  if (/^cat\s*>/.test(s)) return 'write';
  if (/<<-?\s*['"]?\w+/.test(s)) return 'write';
  if (/^sed\s+-i\b/.test(s)) return 'write';
  if (/^ss\b/.test(s)) return 'write';
  if (/^(mkdir|touch|rm|mv|cp)\b/.test(s)) return 'write';
  if (/^echo\b.*>>?\s*\//.test(s)) return 'write';

  return 'shell';
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

const toolIcons: Record<string, React.ReactNode> = {
  shell: <ChevronRight className="h-3 w-3 text-blue-500" />,
  write: <FileCode className="h-3 w-3 text-orange-500" />,
  status: <CheckCircle className="h-3 w-3 text-orange-500" />,
  delegate: <Bot className="h-3 w-3 text-purple-500" />,
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Loader2 className="h-3 w-3 animate-spin text-gray-400" />,
  executing: <Loader2 className="h-3 w-3 animate-spin text-blue-500" />,
  completed: <CheckCircle className="h-3 w-3 text-green-500" />,
  failed: <XCircle className="h-3 w-3 text-red-500" />,
};

export function ChatPanel({
  events,
  onRestore,
  onRetry,
  prompt,
  setPrompt,
  generating,
  onGenerate,
  onStop,
  onContinue,
  focusContext,
  setFocusContext,
  focusPreviewSnippet,
  chatMode,
  setChatMode,
  currentModel,
  setCurrentModel,
  getModelDisplayName,
  isTourLockingInput = false,
  onClearChat,
  onClose,
  supportsVision = false,
  providerReady = true,
  runtimeErrors = [],
  onSendRuntimeErrors,
  onClearRuntimeErrors,
  placedBlocks,
  onRemovePlacedBlock,
  onClearPlacedBlocks,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const isScrollingProgrammatically = useRef(false);

  // Image handling state
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Handle image drop
  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.types.includes('application/semantic-block')) return;
    if (!supportsVision) return;

    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('image/')
    );

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const [header, data] = dataUrl.split(',');
        const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/png';

        setPendingImages(prev => [...prev, {
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          data,
          mediaType,
          preview: dataUrl
        }]);
      };
      reader.readAsDataURL(file);
    }
  }, [supportsVision]);

  // Handle drag over
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('application/semantic-block')) return;
    if (supportsVision) {
      setIsDragging(true);
    }
  }, [supportsVision]);

  // Handle drag leave
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Handle paste
  const handlePaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!supportsVision) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const [header, data] = dataUrl.split(',');
            const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/png';

            setPendingImages(prev => [...prev, {
              id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              data,
              mediaType,
              preview: dataUrl
            }]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  }, [supportsVision]);

  // Remove a pending image
  const removeImage = useCallback((imageId: string) => {
    setPendingImages(prev => prev.filter(img => img.id !== imageId));
  }, []);

  // Handle send with images
  const handleSend = useCallback(() => {
    if (pendingImages.length > 0) {
      onGenerate(pendingImages);
      setPendingImages([]);
    } else {
      onGenerate();
    }
  }, [onGenerate, pendingImages]);

  // Listen for tour event to open provider settings
  useEffect(() => {
    const handleTourOpenSettings = () => {
      setShowMobileSettings(true);
    };

    window.addEventListener('tour-open-provider-settings', handleTourOpenSettings);
    return () => {
      window.removeEventListener('tour-open-provider-settings', handleTourOpenSettings);
    };
  }, []);

  // Track state for incremental processing
  // Use event ID instead of array index to survive front-pruning when MAX_DEBUG_EVENTS is exceeded.
  const lastProcessedEventIdRef = useRef<string | null>(null);
  const lastEventVersionsRef = useRef<Map<string, number>>(new Map());
  const turnsStateRef = useRef<{
    result: Turn[];
    currentTurn: Turn;
    currentIterationTools: ToolCall[];
    itemIdCounter: number;
    taskStartTime: number;
    prevTaskCumulativeTokens: number;
    prevTaskCumulativeCost: number;
  }>({
    result: [],
    currentTurn: { id: `turn-${Date.now()}`, items: [] },
    currentIterationTools: [],
    itemIdCounter: 0,
    taskStartTime: 0,
    prevTaskCumulativeTokens: 0,
    prevTaskCumulativeCost: 0,
  });

  // Transform events into turns with chronologically ordered items (incremental)
  const turns = useMemo(() => {
    let state = turnsStateRef.current;

    // If events array was cleared/reset (new conversation), reset state
    if (events.length === 0) {
      lastProcessedEventIdRef.current = null;
      lastEventVersionsRef.current = new Map();
      state = {
        result: [],
        currentTurn: { id: `turn-${Date.now()}`, items: [] },
        currentIterationTools: [],
        itemIdCounter: 0,
        taskStartTime: 0,
        prevTaskCumulativeTokens: 0,
        prevTaskCumulativeCost: 0,
      };
      turnsStateRef.current = state;
      return [];
    }

    // Find start index (pruning-safe — handles front-pruned events)
    let startIndex = 0;
    if (lastProcessedEventIdRef.current) {
      const idx = events.findIndex(e => e.id === lastProcessedEventIdRef.current);
      if (idx !== -1) {
        startIndex = idx + 1; // Process events after the last processed one
      } else {
        // Last processed event was pruned — reset and reprocess all events
        lastEventVersionsRef.current = new Map();
        state = {
          result: [],
          currentTurn: { id: `turn-${Date.now()}`, items: [] },
          currentIterationTools: [],
          itemIdCounter: 0,
          taskStartTime: 0,
          prevTaskCumulativeTokens: 0,
          prevTaskCumulativeCost: 0,
        };
        turnsStateRef.current = state;
        // startIndex stays 0 — process everything
      }
    }

    const newEventsCount = events.length - startIndex;

    // Re-process coalesced events in lookback window (up to 4 back)
    const coalescedEvents: typeof events = [];
    const lookbackStart = Math.max(0, startIndex - 4);
    for (let i = lookbackStart; i < startIndex; i++) {
      const evt = events[i];
      if (evt.event === 'assistant_delta' || evt.event === 'tool_param_delta' || evt.event === 'reasoning_delta') {
        const storedVersion = lastEventVersionsRef.current.get(evt.id);
        if (evt.version && storedVersion !== evt.version) {
          coalescedEvents.push(evt);
          lastEventVersionsRef.current.set(evt.id, evt.version);
        }
      }
    }

    // Skip processing if no new events AND no coalesced events were updated
    if (newEventsCount === 0 && coalescedEvents.length === 0) {
      return [...state.result, ...(state.currentTurn.items.length > 0 ? [state.currentTurn] : [])];
    }

    // Determine which events to process: coalesced updates first, then new events
    const eventsToProcess = [
      ...coalescedEvents,
      ...events.slice(startIndex),
    ];

    for (const event of eventsToProcess) {
      switch (event.event) {
        case 'waiting':
          // Waiting for first token from LLM
          state.currentTurn.items.push({
            id: `item-${state.itemIdCounter++}`,
            type: 'waiting',
            timestamp: event.timestamp,
            data: null
          });
          break;

        case 'reasoning_start':
          // Reasoning/thinking has started - remove waiting indicator
          state.currentTurn.items = state.currentTurn.items.filter(item => item.type !== 'waiting');
          break;

        case 'reasoning_delta':
          // Handle reasoning tokens (from Anthropic extended thinking, DeepSeek, Gemini, etc.)
          // When coalesced, data.all contains array of {text} objects (snapshots removed for memory efficiency)
          // The coalesced event contains ALL text accumulated so far, so we REPLACE (not append)
          const reasoningDeltaItems = event.data?.all || [event.data];

          const allReasoningText = reasoningDeltaItems.map((d: any) => d?.text || '').join('');

          // Skip whitespace-only reasoning (often happens between tool calls)
          const trimmedReasoningText = allReasoningText.trim();
          if (!trimmedReasoningText) {
            // Remove waiting indicator even for whitespace-only reasoning
            state.currentTurn.items = state.currentTurn.items.filter(item => item.type !== 'waiting');
            break;
          }

          // Find reasoning item for this event (multiple sessions get separate items)
          let matchingReasoningItem = state.currentTurn.items.find(
            item => item.type === 'reasoning' && item.eventId === event.id
          ) as TurnItem | undefined;

          if (matchingReasoningItem) {
            // Update the existing reasoning item for this event
            matchingReasoningItem.data = allReasoningText;
          } else {
            // Create new reasoning item and link it to this event's ID
            const newReasoningItem: TurnItem = {
              id: `item-${state.itemIdCounter++}`,
              type: 'reasoning',
              timestamp: event.timestamp,
              data: allReasoningText,
              eventId: event.id  // Track which event this item belongs to
            };
            state.currentTurn.items.push(newReasoningItem);
          }

          // Remove waiting indicator when reasoning arrives
          state.currentTurn.items = state.currentTurn.items.filter(item => item.type !== 'waiting');
          break;

        case 'reasoning_complete':
          // Mark all reasoning items in the current turn as complete
          state.currentTurn.items.forEach(item => {
            if (item.type === 'reasoning') item.complete = true;
          });
          state.currentTurn.items = state.currentTurn.items.filter(item => item.type !== 'waiting');
          break;

        case 'toolCalls':
          // Tool calls arriving means reasoning is done (some providers skip reasoning_complete)
          state.currentTurn.items.forEach(item => {
            if (item.type === 'reasoning') item.complete = true;
          });

          // New tool calls - push onto flat per-iteration array
          const calls = event.data?.toolCalls || [];

          for (let toolIndex = 0; toolIndex < calls.length; toolIndex++) {
            const call = calls[toolIndex];
            let parameters = {};
            try {
              parameters = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
            } catch {
              // If JSON parsing fails (streaming/partial), use raw string
              parameters = { _raw: call.function?.arguments || '' };
            }

            const tool: ToolCall = {
              id: call.id || `tool-${state.currentIterationTools.length}`,
              name: call.function?.name || 'unknown',
              parameters,
              status: 'pending',
            };

            const toolItem: TurnItem = {
              id: `item-${state.itemIdCounter++}`,
              type: 'tool',
              timestamp: event.timestamp,
              data: tool
            };

            state.currentTurn.items.push(toolItem);
            state.currentIterationTools.push(tool);
          }

          // Remove waiting indicator when tools arrive
          state.currentTurn.items = state.currentTurn.items.filter(item => item.type !== 'waiting');
          break;

        case 'tool_status':
          // Update tool status (mutate the tool object in the item)
          // toolIndex is the position in the flat per-iteration array
          const { toolIndex, status, result: toolStatusResult, error } = event.data || {};
          const tool = state.currentIterationTools[toolIndex];
          if (tool) {
            tool.status = status;
            if (toolStatusResult) tool.result = toolStatusResult;
            if (error) tool.error = error;
            // Re-parse _raw when streaming is complete (tool starts executing)
            if (status === 'executing' && tool.parameters?._raw && typeof tool.parameters._raw === 'string') {
              try {
                tool.parameters = JSON.parse(tool.parameters._raw);
              } catch { /* leave _raw if still invalid */ }
            }
          }
          break;

        case 'tool_healed':
          // Bare delegate call was rewritten to shell — update the UI badge
          const healedTool = state.currentIterationTools[event.data?.toolIndex];
          if (healedTool) {
            healedTool.name = event.data.name || 'shell';
            if (event.data.parameters) healedTool.parameters = event.data.parameters;
          }
          break;

        case 'tool_result':
          // Update tool result
          const toolResult = state.currentIterationTools[event.data?.toolIndex];
          if (toolResult && event.data?.result) {
            toolResult.result = event.data.result;
          }
          break;

        case 'tool_param_delta':
          // Handle both coalesced (data.all) and individual delta formats for tool parameters
          const paramDeltaItems = event.data?.all || [event.data];

          // Process all parameter deltas in the event
          for (const paramDelta of paramDeltaItems) {
            const { toolId, partialArguments } = paramDelta || {};
            if (!toolId) continue;

            // Find the tool item with this ID
            const toolItem = state.currentTurn.items.find(
              item => item.type === 'tool' && (item.data as ToolCall)?.id === toolId
            );

            if (toolItem) {
              const tool = toolItem.data as ToolCall;
              // Try to parse as JSON, otherwise show as _raw
              try {
                tool.parameters = JSON.parse(partialArguments);
              } catch {
                tool.parameters = { _raw: partialArguments };
              }
            }
          }
          break;

        case 'assistant_delta':
          // Text arriving means reasoning is done
          state.currentTurn.items.forEach(item => {
            if (item.type === 'reasoning') item.complete = true;
          });

          // Handle both coalesced (data.all) and individual delta formats
          // When coalesced, data.all contains array of {text} objects (snapshots removed for memory efficiency)
          const deltaItems = event.data?.all || [event.data];

          // Find text item for this event (multiple blocks get separate items)
          let matchingTextItem = state.currentTurn.items.find(
            item => item.type === 'text' && item.eventId === event.id
          ) as TurnItem | undefined;

          const allText = deltaItems.map((d: any) => d?.text || '').join('');

          if (allText) {
            if (matchingTextItem) {
              // Update the existing text item for this event
              matchingTextItem.data = allText;
            } else {
              // Create new text item and link it to this event's ID
              const newTextItem: TurnItem = {
                id: `item-${state.itemIdCounter++}`,
                type: 'text',
                timestamp: event.timestamp,
                data: allText,
                eventId: event.id  // Track which event this item belongs to
              };
              state.currentTurn.items.push(newTextItem);
            }
          }

          // Remove thinking indicator when text arrives
          state.currentTurn.items = state.currentTurn.items.filter(item => item.type !== 'waiting');
          break;

        case 'plan_message':
          state.currentTurn.items.push({
            id: `item-${state.itemIdCounter++}`,
            type: 'plan',
            timestamp: event.timestamp,
            data: event.data?.content || ''
          });
          break;

        case 'agent_message':
          state.currentTurn.items.push({
            id: `item-${state.itemIdCounter++}`,
            type: 'agent',
            timestamp: event.timestamp,
            data: event.data?.content || ''
          });
          break;

        case 'task_progress':
          state.currentTurn.items.push({
            id: `item-${state.itemIdCounter++}`,
            type: 'progress',
            timestamp: event.timestamp,
            data: event.data?.content || ''
          });
          break;

        case 'conversation_message':
          // Handle conversation messages (user and system)
          const message = event.data?.message;
          if (message?.role === 'user') {
            // Skip internal status nudge prompts (orchestration internals)
            if (message.content?.includes('Before finishing, run the status command')) {
              break;
            }

            // Check if this is a synthetic error message (auto-injected by orchestrator)
            const isSyntheticError = message.ui_metadata?.isSyntheticError === true;

            // Genuine user messages start a new turn (separates from previous task's checkpoint)
            if (!isSyntheticError && state.currentTurn.items.length > 0) {
              state.result.push(state.currentTurn);
              state.currentTurn = {
                id: `turn-${Date.now()}-${state.result.length}`,
                items: [],
              };
            }

            // Snapshot cumulative usage baseline for per-task deltas
            if (!isSyntheticError) {
              state.taskStartTime = event.timestamp;
              const lastUsageTurn = [...state.result].reverse().find(t => t.usage);
              if (lastUsageTurn?.usage) {
                state.prevTaskCumulativeTokens = lastUsageTurn.usage.totalUsage?.totalTokens || lastUsageTurn.usage.usage?.totalTokens || 0;
                state.prevTaskCumulativeCost = lastUsageTurn.usage.totalCost ?? 0;
              }
            }

            // Add project context as a separate collapsible item (collapsed by default)
            const projectContext = message.ui_metadata?.projectContext;
            if (projectContext && !isSyntheticError) {
              state.currentTurn.items.push({
                id: `item-${state.itemIdCounter++}`,
                type: 'project_context',
                timestamp: event.timestamp,
                data: projectContext
              });
            }

            // Use clean display content (without injected context/hints) if available
            const displayContent = message.ui_metadata?.displayContent || message.content || '';

            state.currentTurn.items.push({
              id: `item-${state.itemIdCounter++}`,
              type: isSyntheticError ? 'synthetic_error' : 'user',
              timestamp: event.timestamp,
              data: displayContent,
              focusContext: message.ui_metadata?.focusContext,
              semanticBlocks: message.ui_metadata?.semanticBlocks,
            });
          }
          // Skip system messages (don't display in chat UI)
          break;

        case 'user_message':
          // Backward compatibility with old user_message event
          state.currentTurn.items.push({
            id: `item-${state.itemIdCounter++}`,
            type: 'user',
            timestamp: event.timestamp,
            data: event.data?.content || ''
          });
          break;

        case 'error':
          state.currentTurn.items.push({
            id: `item-${state.itemIdCounter++}`,
            type: 'error',
            timestamp: event.timestamp,
            data: event.data
          });
          // Remove thinking indicator when error arrives
          state.currentTurn.items = state.currentTurn.items.filter(item => item.type !== 'waiting');
          break;

        case 'error_paused':
          state.currentTurn.items.push({
            id: `item-${state.itemIdCounter++}`,
            type: 'error_paused',
            timestamp: event.timestamp,
            data: event.data
          });
          // Remove thinking indicator when error pause arrives
          state.currentTurn.items = state.currentTurn.items.filter(item => item.type !== 'waiting');
          break;

        case 'usage':
          state.currentTurn.usage = {
            ...event.data,
            timestamp: event.timestamp,
            taskTokenOffset: state.prevTaskCumulativeTokens,
            taskCostOffset: state.prevTaskCumulativeCost,
          };
          state.currentTurn.taskStartTime = state.taskStartTime;
          // Remove thinking indicator when usage arrives (marks end of LLM response)
          state.currentTurn.items = state.currentTurn.items.filter(item => item.type !== 'waiting');
          break;

        case 'checkpoint_created':
          // Store checkpoint ID in current turn
          state.currentTurn.checkpointId = event.data?.checkpointId;
          break;

        case 'iteration':
          state.currentTurn.iteration = event.data?.iteration;
          // Start a new turn for next iteration
          if (state.currentTurn.items.length > 0) {
            state.result.push(state.currentTurn);
            state.currentTurn = {
              id: `turn-${Date.now()}-${state.result.length}`,
              items: [],
            };
          }
          // Reset tool tracking for the new iteration
          state.currentIterationTools = [];
          break;

        case 'compaction': {
          state.currentTurn.items.push({
            id: `compaction-${event.id}`,
            type: 'compaction',
            timestamp: event.timestamp,
            data: event.data,
          });
          break;
        }

        case 'delegate_progress': {
          // Sub-agent events — update the parent delegate tool's result in real-time
          const { event: innerEvent, data: innerData, agentIndex, parentToolIndex: pti } = event.data || {};
          const label = `subagent ${agentIndex || 1}`;

          // Find the delegate tool badge — match by parentToolIndex if available, else first executing delegate
          let delegateTool: typeof state.currentIterationTools[0] | undefined;
          if (typeof pti === 'number') {
            delegateTool = state.currentIterationTools[pti];
          }
          if (!delegateTool || classifyShellCommand(delegateTool.parameters?.cmd) !== 'delegate') {
            delegateTool = state.currentIterationTools.find(
              t => t.status === 'executing' && classifyShellCommand(t.parameters?.cmd) === 'delegate'
            );
          }
          if (!delegateTool) break;

          if (innerEvent === 'agent_start') {
            delegateTool.result = `[${label}] starting...`;
          } else if (innerEvent === 'agent_done') {
            const elapsed = innerData?.elapsed || '?';
            delegateTool.result = `[${label}] done (${elapsed}s)`;
          } else if (innerEvent === 'tool_status' && innerData?.status === 'executing') {
            let cmd = '';
            try {
              const args = JSON.parse(innerData.args || '{}');
              cmd = args?.cmd || '';
            } catch {
              cmd = innerData.args || '';
            }
            const cmdPreview = cmd.length > 100 ? cmd.slice(0, 100) + '...' : cmd;
            delegateTool.result = `[${label}] ${cmdPreview}`;
          }
          break;
        }

        case 'stopped':
          // Remove thinking indicator when generation is stopped
          state.currentTurn.items = state.currentTurn.items.filter(item => item.type !== 'waiting');
          break;
      }
    }

    // Update last processed event ID (only when there are new events, not for coalesced-only updates)
    if (newEventsCount > 0) {
      lastProcessedEventIdRef.current = events[events.length - 1].id;
    }

    // Return combined result (completed turns + current turn if it has items)
    return [...state.result, ...(state.currentTurn.items.length > 0 ? [state.currentTurn] : [])];
  }, [events]);

  // Auto-scroll when turns change (throttled with requestAnimationFrame)
  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;

    // Use requestAnimationFrame to batch scroll updates and avoid layout thrashing
    const rafId = requestAnimationFrame(() => {
      if (scrollRef.current) {
        isScrollingProgrammatically.current = true;
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        // Reset flag after scroll completes
        setTimeout(() => {
          isScrollingProgrammatically.current = false;
        }, 50);
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [turns, autoScroll]);

  // Enable auto-scroll when new turns arrive (user sent a message)
  useEffect(() => {
    if (turns.length > 0) {
      setAutoScroll(true);
    }
  }, [turns.length]);

  // Scroll position detection
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const handleScroll = () => {
      // Ignore programmatic scrolls
      if (isScrollingProgrammatically.current) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;
      setAutoScroll(isAtBottom);
    };

    scrollEl.addEventListener('scroll', handleScroll);
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, []);

  // Toggle expanded state for an item
  const toggleExpanded = (itemId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Focus context snippet for unified context component
  const trimmedSnippet = focusPreviewSnippet?.trim() ?? '';
  const focusContextData = focusContext ? { domPath: focusContext.domPath, snippet: trimmedSnippet } : null;

  // Runtime error card
  const runtimeErrorHint = !generating && runtimeErrors.length > 0 ? (
    <div
      className="rounded-md border border-dashed border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-foreground">
        <div className="flex items-center gap-2">
          <span className="font-medium text-xs uppercase tracking-wide text-destructive">runtime errors</span>
          <span className="inline-flex items-center justify-center rounded-full bg-destructive/15 text-destructive text-[10px] font-medium px-1.5 min-w-[18px] h-[18px]">
            {runtimeErrors.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onClearRuntimeErrors && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={onClearRuntimeErrors}
              title="Dismiss runtime errors"
            >
              Clear
            </Button>
          )}
          {onSendRuntimeErrors && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-destructive"
              onClick={onSendRuntimeErrors}
              title="Send errors to AI for correction"
            >
              Send
            </Button>
          )}
        </div>
      </div>
      <pre className="mt-2 max-h-24 overflow-auto rounded border border-border/50 bg-background/90 px-2 py-1 text-[11px] text-foreground leading-relaxed">
        <code>{runtimeErrors.map(e => `• ${e}`).join('\n')}</code>
      </pre>
    </div>
  ) : null;

  return (
    <PanelContainer dataTourId="assistant-panel">
      <PanelHeader
        icon={MessageSquare}
        title="Chat"
        color="var(--button-assistant-active)"
        onClose={onClose}
        panelKey="chat"
        actions={onClearChat && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClearChat}
            className="h-5 w-5"
            title="Clear chat"
            data-tour-id="clear-chat-button"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {turns.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center p-4">
            No messages yet. Start a conversation to see it here.
          </div>
        ) : (
          (() => {
            // Per-task usage collation: show accumulated usage on the last turn of each task.
            // Task boundaries: turns containing a non-synthetic user message.
            const isTaskStart = (t: Turn) => t.items.some(i => i.type === 'user');

            // Build a map: turnIndex → collated usage data for display.
            // For each task group, the last turn before the next task (or end) gets the usage.
            const usageMap = new Map<number, { usage: Turn['usage']; startTime?: number }>();
            let taskLastUsage: Turn['usage'] = undefined;
            let taskStartTime: number | undefined;

            for (let i = 0; i < turns.length; i++) {
              if (i > 0 && isTaskStart(turns[i])) {
                // Task boundary — assign accumulated usage to the last turn of the previous task
                if (taskLastUsage) {
                  usageMap.set(i - 1, { usage: taskLastUsage, startTime: taskStartTime });
                }
                taskLastUsage = undefined;
                taskStartTime = undefined;
              }
              if (turns[i].usage) {
                taskLastUsage = turns[i].usage;
                taskStartTime = turns[i].taskStartTime;
              }
            }
            // Final task group — assign to last turn
            if (taskLastUsage) {
              usageMap.set(turns.length - 1, { usage: taskLastUsage, startTime: taskStartTime });
            }

            return turns.map((turn, idx) => {
              const collated = usageMap.get(idx);
              return (
                <TurnDisplay
                  key={turn.id}
                  turn={turn}
                  collatedUsage={collated?.usage}
                  collatedTaskStartTime={collated?.startTime}
                  onRestore={onRestore}
                  onRetry={onRetry}
                  onContinue={onContinue}
                  onCancel={onStop}
                  generating={generating}
                  expandedItems={expandedItems}
                  onToggleExpanded={toggleExpanded}
                />
              );
            });
          })()
        )}
      </div>

      {/* Input */}
      <div className="p-3 space-y-2">
        {runtimeErrorHint}
        {/* Unified context component — focus, blocks, images */}
        <MessageContext
          focusContext={focusContextData}
          semanticBlocks={placedBlocks}
          images={pendingImages}
          onClearFocus={() => setFocusContext(null)}
          onRemoveBlock={onRemovePlacedBlock}
          onClearBlocks={onClearPlacedBlocks}
          onRemoveImage={removeImage}
          onClearImages={() => setPendingImages([])}
        />
        <div
          className={`bg-card border rounded-lg shadow-sm overflow-hidden transition-all ${
            isDragging ? 'border-primary border-2 bg-primary/5' : 'border-border'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >

          {/* Drop overlay */}
          {isDragging && supportsVision && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/10 z-10 pointer-events-none">
              <div className="text-primary font-medium flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Drop image here
              </div>
            </div>
          )}

          <div className="relative flex bg-card rounded-lg transition-all">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (isTourLockingInput) {
                  return;
                }
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onPaste={handlePaste}
              placeholder={!providerReady ? "Select a provider to start..." : supportsVision ? "Describe what you want to build... (paste or drop images)" : "Describe what you want to build..."}
              className="flex-1 px-3 py-2 bg-transparent border-0 resize-none focus:outline-none text-sm placeholder:text-muted-foreground text-foreground"
              rows={3}
              disabled={generating || isTourLockingInput || !providerReady}
            />
            <div className="flex flex-col p-2 gap-2">
              <Button
                onClick={generating ? onStop : handleSend}
                disabled={isTourLockingInput ? !generating : (!generating && (!prompt.trim() && pendingImages.length === 0 || !providerReady))}
                size="sm"
                className="flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Stop
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border bg-muted/50 px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <Popover open={showMobileSettings} onOpenChange={setShowMobileSettings}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-7 text-xs ${!providerReady ? 'ring-2 ring-primary/70 animate-ring-opacity border-primary' : ''}`}
                    data-tour-id="provider-settings-trigger"
                  >
                    <span>{providerReady ? getModelDisplayName(currentModel) : 'Select provider'}</span>
                    {showMobileSettings ? (
                      <ChevronDown className="h-3 w-3 ml-1" />
                    ) : (
                      <ChevronUp className="h-3 w-3 ml-1" />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[460px] max-w-[calc(100vw-2rem)] max-h-[min(680px,calc(100vh-5rem))] overflow-hidden flex flex-col" align="start" data-tour-id="provider-settings-popup">
                  <ModelSettingsPanel
                    onClose={() => setShowMobileSettings(false)}
                    onModelChange={(modelId) => setCurrentModel(modelId)}
                  />
                </PopoverContent>
              </Popover>

              <ToggleGroup
                type="single"
                value={chatMode ? 'chat' : 'code'}
                onValueChange={(value) => {
                  if (value) setChatMode(value === 'chat');
                }}
                className="gap-1"
              >
                <ToggleGroupItem value="chat" className="h-7 text-xs px-2">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Chat
                </ToggleGroupItem>
                <ToggleGroupItem value="code" className="h-7 text-xs px-2">
                  <Code className="h-3 w-3 mr-1" />
                  Code
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </div>
      </div>
    </PanelContainer>
  );
}

interface TurnDisplayProps {
  turn: Turn;
  collatedUsage?: Turn['usage'];
  collatedTaskStartTime?: number;
  onRestore?: (checkpointId: string) => void;
  onRetry?: (checkpointId: string) => void;
  onContinue?: () => void;
  onCancel?: () => void;
  generating?: boolean;
  expandedItems: Set<string>;
  onToggleExpanded: (itemId: string) => void;
}

function TurnDisplay({ turn, collatedUsage, collatedTaskStartTime, onRestore, onRetry, onContinue, onCancel, generating, expandedItems, onToggleExpanded }: TurnDisplayProps) {
  return (
    <div className="space-y-2" {...(turn.checkpointId ? { 'data-checkpoint-id': turn.checkpointId } : {})}>
      {/* Render items in chronological order */}
      {turn.items.map((item) => {
        switch (item.type) {
          case 'waiting':
            return (
              <div key={item.id} className="bg-muted/30 rounded-md p-2 opacity-70">
                <div className="flex items-center gap-2 px-1">
                  <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                  <span className="text-xs text-muted-foreground">Waiting for response...</span>
                </div>
              </div>
            );

          case 'reasoning':
            return (
              <ReasoningDisplay
                key={item.id}
                itemId={item.id}
                content={item.data}
                isComplete={item.complete === true}
                isExpanded={expandedItems.has(item.id)}
                onToggle={() => onToggleExpanded(item.id)}
              />
            );

          case 'plan':
            return (
              <PlanDisplay
                key={item.id}
                itemId={item.id}
                content={item.data}
                isExpanded={expandedItems.has(item.id)}
                onToggle={() => onToggleExpanded(item.id)}
              />
            );

          case 'agent':
            return (
              <AgentDisplay
                key={item.id}
                itemId={item.id}
                content={item.data}
                isExpanded={expandedItems.has(item.id)}
                onToggle={() => onToggleExpanded(item.id)}
              />
            );

          case 'progress':
            return (
              <ProgressDisplay
                key={item.id}
                itemId={item.id}
                content={item.data}
                isExpanded={expandedItems.has(item.id)}
                onToggle={() => onToggleExpanded(item.id)}
              />
            );

          case 'tool':
            return (
              <ToolDisplay
                key={item.id}
                itemId={item.id}
                tool={item.data as ToolCall}
                isExpanded={expandedItems.has(item.id)}
                onToggle={() => onToggleExpanded(item.id)}
              />
            );

          case 'text':
            return (
              <div key={item.id} className="text-sm text-foreground/90 bg-muted/20 px-3 py-2 rounded">
                <MarkdownRenderer content={item.data} />
              </div>
            );

          case 'project_context':
            return (
              <div key={item.id} className={`rounded-md transition-all ${expandedItems.has(item.id) ? 'bg-muted/30 p-2' : 'p-1.5'}`}>
                <button
                  onClick={() => onToggleExpanded(item.id)}
                  className="flex items-center gap-2 w-full text-left hover:bg-muted/30 rounded px-1"
                >
                  <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${expandedItems.has(item.id) ? 'rotate-90' : ''}`} />
                  <FileCode className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Project context</span>
                </button>
                {expandedItems.has(item.id) && (
                  <div className="mt-2 px-2">
                    <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto whitespace-pre-wrap text-muted-foreground">
                      {item.data}
                    </pre>
                  </div>
                )}
              </div>
            );

          case 'compaction':
            return (
              <div key={item.id} className="flex items-center gap-2 py-2 my-1">
                <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  Context compacted — {formatTokenCount(item.data?.preCompactTokens ?? 0)} → ~{formatTokenCount(item.data?.postCompactEstimate ?? 0)} tokens
                </span>
                <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
              </div>
            );

          case 'user': {
            // Extract image blocks from content if present (to show in unified context)
            const contentData = item.data;
            const userImageBlocks = Array.isArray(contentData)
              ? contentData.filter((b: ContentBlock) => b.type === 'image_url')
              : [];
            const hasAnyContext = !!(item.focusContext || item.semanticBlocks || userImageBlocks.length > 0);
            return (
              <div key={item.id} className="text-sm text-foreground bg-primary/10 px-3 py-2 rounded border border-primary/20">
                <div className="font-semibold text-primary mb-1 text-xs">User</div>
                <UserMessageContent content={contentData} hideImages={hasAnyContext} />
                {hasAnyContext && (
                  <MessageContext
                    focusContext={item.focusContext}
                    semanticBlocks={item.semanticBlocks}
                    imageBlocks={userImageBlocks.length > 0 ? userImageBlocks : undefined}
                    readOnly
                  />
                )}
              </div>
            );
          }

          case 'synthetic_error':
            // Auto-injected error message (e.g., malformed tool call correction)
            // Style it like a collapsible tool call
            return (
              <SyntheticErrorDisplay
                key={item.id}
                itemId={item.id}
                content={item.data}
                isExpanded={expandedItems.has(item.id)}
                onToggle={() => onToggleExpanded(item.id)}
              />
            );

          case 'error':
            return (
              <div key={item.id} className="text-sm bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold text-destructive mb-1">Error</div>
                    <div className="text-destructive/90 whitespace-pre-wrap font-mono text-xs">
                      {item.data?.message || JSON.stringify(item.data, null, 2)}
                    </div>
                    {item.data?.stack && (
                      <details className="mt-2">
                        <summary className="text-xs text-destructive/70 cursor-pointer hover:text-destructive">
                          Stack trace
                        </summary>
                        <pre className="text-[10px] text-destructive/60 mt-1 overflow-x-auto">
                          {item.data.stack}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            );

          case 'error_paused':
            return (
              <div key={item.id} className="text-sm bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold text-destructive mb-1">{generating ? 'Task paused' : 'Error'}</div>
                    <div className="text-destructive/90 whitespace-pre-wrap font-mono text-xs">
                      {item.data?.message || 'An API error occurred.'}
                    </div>
                    {generating && (
                      <div className="mt-2 flex gap-3">
                        {onContinue && (
                          <button onClick={onContinue} className="text-xs underline text-primary hover:text-primary/80">
                            Continue
                          </button>
                        )}
                        <button onClick={onCancel} className="text-xs underline text-muted-foreground hover:text-foreground/80">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );

          default:
            return null;
        }
      })}

      {/* Usage info and checkpoint actions — shown on last turn only */}
      {(collatedUsage || turn.checkpointId) && (
        <div className="flex items-center justify-between gap-2">
          {/* Collated usage info (per-task) */}
          {collatedUsage && (() => {
            const cumulativeTokens = (collatedUsage.totalUsage?.totalTokens || collatedUsage.usage?.totalTokens || collatedUsage.totalTokens) || 0;
            const cumulativeCost = collatedUsage.totalCost ?? collatedUsage.cost ?? 0;
            const taskTokens = cumulativeTokens - (collatedUsage.taskTokenOffset || 0);
            const taskCost = cumulativeCost - (collatedUsage.taskCostOffset || 0);
            const startTime = collatedTaskStartTime || turn.taskStartTime;
            const durationMs = startTime && collatedUsage.timestamp
              ? collatedUsage.timestamp - startTime
              : 0;
            const durationSec = durationMs > 0 ? Math.round(durationMs / 1000) : 0;
            return (
              <div className="text-xs text-muted-foreground">
                Tokens: {taskTokens.toLocaleString()}
                {taskCost > 0 && ` • Cost: $${taskCost.toFixed(4)}`}
                {durationSec > 0 && ` • ${durationSec < 60 ? `${durationSec}s` : `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`}`}
              </div>
            );
          })()}

          {/* Checkpoint actions */}
          {turn.checkpointId && (
            <div className="flex items-center gap-1">
              {onRestore && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRestore(turn.checkpointId!)}
                  className="h-6 px-2 text-xs"
                  title="Restore to this checkpoint"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Restore
                </Button>
              )}
              {onRetry && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRetry(turn.checkpointId!)}
                  className="h-6 px-2 text-xs"
                  title="Restore files and retry from this checkpoint"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ToolDisplayProps {
  itemId: string;
  tool: ToolCall;
  isExpanded: boolean;
  onToggle: () => void;
}

function ToolDisplay({ itemId, tool, isExpanded, onToggle }: ToolDisplayProps) {
  const category = tool.name === 'shell' ? classifyShellCommand(tool.parameters?.cmd) : tool.name;
  return (
    <div
      className={`bg-muted/30 rounded-md transition-all ${
        tool.status === 'executing' ? 'ring-2 ring-blue-500/20 animate-pulse' : ''
      } p-1.5`}
    >
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded px-1 overflow-hidden"
      >
        <div className="flex items-center gap-1.5 shrink-0">
          {toolIcons[category] || <ChevronRight className="h-3 w-3" />}
          <span className="text-xs font-mono">{category}</span>
        </div>

        {/* Tool-specific preview */}
        {tool.name === 'shell' && tool.parameters?.cmd && (
          <code className="text-xs text-muted-foreground truncate min-w-0">
            {Array.isArray(tool.parameters.cmd)
              ? tool.parameters.cmd.slice(1).join(' ')
              : String(tool.parameters.cmd)}
          </code>
        )}
        {(tool.parameters?.path || tool.parameters?.file_path) && (
          <code className="text-xs text-muted-foreground truncate min-w-0">
            {tool.parameters.path || tool.parameters.file_path}
          </code>
        )}

        <div className="ml-auto shrink-0">
          {statusIcons[tool.status || 'completed']}
        </div>
      </button>

      {/* Expanded view */}
      {isExpanded && (
        <div className="mt-2 space-y-2">
          {/* Parameters */}
          {tool.parameters && Object.keys(tool.parameters).length > 0 && (
            <div className="px-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Parameters
              </div>
              <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto">
                {JSON.stringify(tool.parameters, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {tool.result && (
            <div className="px-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Result
              </div>
              <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-40 overflow-y-auto">
                {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Error */}
          {tool.error && (
            <div className="px-2">
              <div className="text-[10px] uppercase tracking-wider text-destructive mb-1">
                Error
              </div>
              <pre className="text-xs bg-destructive/10 text-destructive p-2 rounded overflow-x-auto">
                {tool.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SyntheticErrorDisplayProps {
  itemId: string;
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function SyntheticErrorDisplay({ itemId, content, isExpanded, onToggle }: SyntheticErrorDisplayProps) {
  return (
    <div className={`bg-amber-500/10 rounded-md transition-all ${isExpanded ? 'p-2' : 'p-1.5'}`}>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left hover:bg-amber-500/20 rounded px-1"
      >
        <div className="flex items-center gap-1.5">
          <RefreshCw className="h-3 w-3 text-amber-600" />
          <span className="text-xs font-mono">Auto-correction</span>
        </div>
        <div className="ml-auto">
          <CheckCircle className="h-3 w-3 text-amber-600" />
        </div>
      </button>

      {/* Expanded view */}
      {isExpanded && (
        <div className="mt-2 px-2">
          <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

interface ReasoningDisplayProps {
  itemId: string;
  content: string;
  isComplete: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

function ReasoningDisplay({ itemId, content, isComplete, isExpanded, onToggle }: ReasoningDisplayProps) {
  // Extract first line for preview, clean up common prefixes
  const lines = (content || '').split('\n').filter(l => l.trim());
  const preview = lines[0]?.substring(0, 60) || 'Reasoning...';
  const isStreaming = !isComplete;

  return (
    <div className="bg-violet-500/10 rounded-md transition-all p-1.5">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left hover:bg-violet-500/20 rounded px-1"
      >
        <div className="flex items-center gap-1.5">
          {isStreaming ? (
            <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
          ) : (
            <Brain className="h-3 w-3 text-violet-500" />
          )}
          <span className="text-xs font-mono">reasoning</span>
        </div>
        <code className="text-xs text-muted-foreground truncate flex-1">
          {isStreaming ? 'Thinking...' : preview}
        </code>
        <div className="ml-auto">
          <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {isExpanded && (
        <div className="mt-2 px-2">
          <div className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-64 overflow-y-auto">
            <MarkdownRenderer content={content || 'Thinking...'} />
          </div>
        </div>
      )}
    </div>
  );
}

interface PlanDisplayProps {
  itemId: string;
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function PlanDisplay({ itemId, content, isExpanded, onToggle }: PlanDisplayProps) {
  // Extract first line for preview
  const lines = content.split('\n');
  const preview = lines[0]?.replace(/^\*\*|\*\*$/g, '').substring(0, 50) || 'Plan';

  return (
    <div className="bg-muted/30 rounded-md transition-all p-1.5">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded px-1"
      >
        <div className="flex items-center gap-1.5">
          <ClipboardList className="h-3 w-3 text-orange-500" />
          <span className="text-xs font-mono">plan</span>
        </div>
        <code className="text-xs text-muted-foreground truncate flex-1">
          {preview}
        </code>
        <div className="ml-auto">
          <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {isExpanded && (
        <div className="mt-2 px-2">
          <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

interface AgentDisplayProps {
  itemId: string;
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function AgentDisplay({ itemId, content, isExpanded, onToggle }: AgentDisplayProps) {
  // Extract first line for preview
  const lines = content.split('\n');
  const preview = lines[0]?.replace(/^\*\*|\*\*$/g, '').replace(/^🤖\s*/, '').substring(0, 50) || 'Agent';

  return (
    <div className="bg-muted/30 rounded-md transition-all p-1.5">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded px-1"
      >
        <div className="flex items-center gap-1.5">
          <Bot className="h-3 w-3 text-purple-500" />
          <span className="text-xs font-mono">agent</span>
        </div>
        <code className="text-xs text-muted-foreground truncate flex-1">
          {preview}
        </code>
        <div className="ml-auto">
          <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {isExpanded && (
        <div className="mt-2 px-2">
          <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

interface ProgressDisplayProps {
  itemId: string;
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function ProgressDisplay({ itemId, content, isExpanded, onToggle }: ProgressDisplayProps) {
  // Detect if this is a completion (✅) or in progress (🔄)
  const isCompleted = content.includes('✅');
  const preview = content.replace(/^[✅🔄]\s*/, '').substring(0, 50);

  return (
    <div className="bg-muted/30 rounded-md transition-all p-1.5">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded px-1"
      >
        <div className="flex items-center gap-1.5">
          {isCompleted ? (
            <CheckCircle className="h-3 w-3 text-green-500" />
          ) : (
            <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
          )}
          <span className="text-xs font-mono">progress</span>
        </div>
        <code className="text-xs text-muted-foreground truncate flex-1">
          {preview}
        </code>
        <div className="ml-auto">
          <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {isExpanded && (
        <div className="mt-2 px-2">
          <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
