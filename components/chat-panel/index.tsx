'use client';

import { useState, useEffect, useRef, useMemo, useCallback, DragEvent, ClipboardEvent } from 'react';
import { MessageSquare, Loader2, CheckCircle, XCircle, ChevronRight, FileCode, ClipboardList, Bot, RotateCcw, RefreshCw, Send, ChevronUp, ChevronDown, Code, Trash2, X, Brain, Image as ImageIcon } from 'lucide-react';
import { DebugEvent } from '@/components/debug-panel';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ModelSettingsPanel } from '@/components/settings/model-settings';
import { FocusContextPayload } from '@/lib/preview/types';
import { PendingImage } from '@/lib/llm/multi-agent-orchestrator';
import { ContentBlock } from '@/lib/llm/types';

type FocusTarget = FocusContextPayload & { timestamp: number };

// Helper to render user message content (string or ContentBlock[])
function UserMessageContent({ content }: { content: string | ContentBlock[] }) {
  if (typeof content === 'string') {
    return <div className="whitespace-pre-wrap">{content}</div>;
  }

  // Separate text and image blocks
  const textBlocks = content.filter(b => b.type === 'text');
  const imageBlocks = content.filter(b => b.type === 'image_url');

  return (
    <div className="space-y-2">
      {/* Render text blocks */}
      {textBlocks.map((block, index) => (
        <div key={`text-${index}`} className="whitespace-pre-wrap">
          {block.type === 'text' && block.text}
        </div>
      ))}

      {/* Render images in a flex container */}
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
  type: 'waiting' | 'reasoning' | 'plan' | 'agent' | 'progress' | 'tool' | 'text' | 'error' | 'user' | 'synthetic_error' | 'project_context';
  timestamp: number;
  data: any;
  eventId?: string;  // Links item to its source debug event (for coalesced updates)
}

interface Turn {
  id: string;
  items: TurnItem[];
  usage?: any;
  iteration?: number;
  checkpointId?: string;
}

const toolIcons: Record<string, React.ReactNode> = {
  shell: <ChevronRight className="h-3 w-3 text-blue-500" />,
  write: <FileCode className="h-3 w-3 text-orange-500" />,
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
  const lastProcessedIndexRef = useRef(0);
  const lastEventVersionsRef = useRef<Map<string, number>>(new Map());
  const turnsStateRef = useRef<{
    result: Turn[];
    currentTurn: Turn;
    currentIterationTools: ToolCall[];
    itemIdCounter: number;
  }>({
    result: [],
    currentTurn: { id: `turn-${Date.now()}`, items: [] },
    currentIterationTools: [],
    itemIdCounter: 0,
  });

  // Transform events into turns with chronologically ordered items (incremental)
  const turns = useMemo(() => {
    const state = turnsStateRef.current;
    const newEventsCount = events.length - lastProcessedIndexRef.current;

    // If events array was cleared/reset (new conversation), reset state
    if (events.length === 0 || lastProcessedIndexRef.current > events.length) {
      lastProcessedIndexRef.current = 0;
      lastEventVersionsRef.current = new Map();
      turnsStateRef.current = {
        result: [],
        currentTurn: { id: `turn-${Date.now()}`, items: [] },
        currentIterationTools: [],
        itemIdCounter: 0,
      };
      return [];
    }

    // Check if last event is a streaming event that was updated
    const lastEvent = events[events.length - 1];
    const isStreamingEvent = lastEvent && (lastEvent.event === 'assistant_delta' || lastEvent.event === 'tool_param_delta' || lastEvent.event === 'reasoning_delta');
    const lastEventVersion = lastEventVersionsRef.current.get(lastEvent?.id || '');
    const eventWasUpdated = isStreamingEvent && lastEvent.version && lastEventVersion !== lastEvent.version;

    // Skip processing if no new events AND last event wasn't updated
    if (newEventsCount === 0 && !eventWasUpdated) {
      return [...state.result, ...(state.currentTurn.items.length > 0 ? [state.currentTurn] : [])];
    }

    // Determine which events to process
    let eventsToProcess: typeof events;
    if (eventWasUpdated) {
      // Re-process the last event (it was updated/coalesced)
      eventsToProcess = [lastEvent];
      lastEventVersionsRef.current.set(lastEvent.id, lastEvent.version!);
    } else {
      // Process only new events
      eventsToProcess = events.slice(lastProcessedIndexRef.current);
    }

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

          // Concatenate all text fields from the coalesced deltas
          // This gives us the complete reasoning content from this coalesced event
          const allReasoningText = reasoningDeltaItems.map((d: any) => d?.text || '').join('');

          // Skip whitespace-only reasoning (often happens between tool calls)
          const trimmedReasoningText = allReasoningText.trim();
          if (!trimmedReasoningText) {
            // Remove waiting indicator even for whitespace-only reasoning
            state.currentTurn.items = state.currentTurn.items.filter(item => item.type !== 'waiting');
            break;
          }

          // Find the reasoning item that corresponds to THIS event (by matching eventId)
          // This ensures multiple reasoning sessions (separated by tool calls) each get their own item
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
          // Reasoning is complete - nothing special to do, just ensure waiting is removed
          state.currentTurn.items = state.currentTurn.items.filter(item => item.type !== 'waiting');
          break;

        case 'toolCalls':
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
          // Handle both coalesced (data.all) and individual delta formats
          // When coalesced, data.all contains array of {text} objects (snapshots removed for memory efficiency)
          const deltaItems = event.data?.all || [event.data];

          // Find the text item that corresponds to THIS event (by matching eventId)
          // This ensures multiple text blocks (separated by tool calls) each get their own item
          let matchingTextItem = state.currentTurn.items.find(
            item => item.type === 'text' && item.eventId === event.id
          ) as TurnItem | undefined;

          // Concatenate all text fields from the coalesced deltas
          // This gives us the complete content from this coalesced event
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
            // Skip internal evaluation prompts (orchestration internals)
            if (message.content?.includes('Before finishing, you must call the evaluation tool')) {
              break;
            }

            // Check if this is a synthetic error message (auto-injected by orchestrator)
            const isSyntheticError = message.ui_metadata?.isSyntheticError === true;

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
              data: displayContent
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

        case 'usage':
          state.currentTurn.usage = event.data;
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

        case 'stopped':
          // Remove thinking indicator when generation is stopped
          state.currentTurn.items = state.currentTurn.items.filter(item => item.type !== 'waiting');
          break;
      }
    }

    // Update last processed index (only when processing new events, not re-processing updated ones)
    if (!eventWasUpdated) {
      lastProcessedIndexRef.current = events.length;
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

  // Focus context hint
  const trimmedSnippet = focusPreviewSnippet?.trim() ?? '';
  const focusContextHint = focusContext ? (
    <div
      id="focus-context-hint"
      className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs text-muted-foreground shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-foreground">
        <div className="flex items-center gap-2">
          <span className="font-medium text-xs uppercase tracking-wide text-primary">context</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">included in next message</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => setFocusContext(null)}
          title="Clear focus context"
        >
          Clear
        </Button>
      </div>
      <div className="mt-2 space-y-2">
        {focusContext.domPath && (
          <div className="text-[11px] font-mono text-muted-foreground/80 break-all leading-snug">
            {focusContext.domPath}
          </div>
        )}
        {trimmedSnippet && (
          <pre className="max-h-24 overflow-auto rounded border border-border/50 bg-background/90 px-2 py-1 text-[11px] text-foreground leading-relaxed">
            <code>{trimmedSnippet}</code>
          </pre>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="h-full flex flex-col bg-card border border-border rounded-lg overflow-hidden" data-tour-id="assistant-panel">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 md:hidden" style={{ color: 'var(--button-assistant-active)' }} />
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Hide chat panel"
              className="relative hidden h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-destructive md:flex group"
            >
              <MessageSquare
                className="h-4 w-4 transition-opacity group-hover:opacity-0"
                style={{ color: 'var(--button-assistant-active)' }}
              />
              <X className="absolute h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ) : (
            <MessageSquare
              className="hidden h-4 w-4 md:inline-flex"
              style={{ color: 'var(--button-assistant-active)' }}
            />
          )}
          <span className="font-semibold text-sm">Chat</span>
        </div>
        <div className="flex items-center gap-1">
          {onClearChat && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearChat}
              className="h-7 px-2 hover:bg-muted"
              title="Clear chat"
              data-tour-id="clear-chat-button"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {turns.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center p-4">
            No messages yet. Start a conversation to see it here.
          </div>
        ) : (
          turns.map((turn) => (
            <TurnDisplay
              key={turn.id}
              turn={turn}
              onRestore={onRestore}
              onRetry={onRetry}
              expandedItems={expandedItems}
              onToggleExpanded={toggleExpanded}
            />
          ))
        )}
      </div>

      {/* Input */}
      <div className="p-3 space-y-2">
        {focusContextHint}
        <div
          className={`bg-card border rounded-lg shadow-sm overflow-hidden transition-all ${
            isDragging ? 'border-primary border-2 bg-primary/5' : 'border-border'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {/* Image previews */}
          {pendingImages.length > 0 && (
            <div className="px-3 pt-2 flex flex-wrap gap-2">
              {pendingImages.map((img) => (
                <div
                  key={img.id}
                  className="relative group"
                >
                  <img
                    src={img.preview}
                    alt="Pending upload"
                    className="h-12 w-12 object-cover rounded border border-border"
                  />
                  <button
                    onClick={() => removeImage(img.id)}
                    className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <span className="text-xs text-muted-foreground self-end pb-1">
                {pendingImages.length} image{pendingImages.length !== 1 ? 's' : ''} attached
              </span>
            </div>
          )}

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
    </div>
  );
}

interface TurnDisplayProps {
  turn: Turn;
  onRestore?: (checkpointId: string) => void;
  onRetry?: (checkpointId: string) => void;
  expandedItems: Set<string>;
  onToggleExpanded: (itemId: string) => void;
}

function TurnDisplay({ turn, onRestore, onRetry, expandedItems, onToggleExpanded }: TurnDisplayProps) {
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

          case 'user':
            return (
              <div key={item.id} className="text-sm text-foreground bg-primary/10 px-3 py-2 rounded border border-primary/20">
                <div className="font-semibold text-primary mb-1 text-xs">User</div>
                <UserMessageContent content={item.data} />
              </div>
            );

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

          default:
            return null;
        }
      })}

      {/* Usage info and checkpoint actions */}
      {(turn.usage || turn.checkpointId) && (
        <div className="flex items-center justify-between gap-2">
          {/* Usage info */}
          {turn.usage && (
            <div className="text-xs text-muted-foreground">
              Tokens: {(turn.usage.usage?.totalTokens || turn.usage.totalTokens)?.toLocaleString() || 'N/A'}
              {(turn.usage.totalCost !== undefined || turn.usage.cost !== undefined) &&
                ` • Cost: $${((turn.usage.totalCost ?? turn.usage.cost) || 0).toFixed(4)}`}
            </div>
          )}

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
  return (
    <div
      className={`bg-muted/30 rounded-md transition-all ${
        tool.status === 'executing' ? 'ring-2 ring-blue-500/20 animate-pulse' : ''
      } ${isExpanded ? 'p-2' : 'p-1.5'}`}
    >
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded px-1"
      >
        <div className="flex items-center gap-1.5">
          {toolIcons[tool.name] || <ChevronRight className="h-3 w-3" />}
          <span className="text-xs font-mono">{tool.name}</span>
        </div>

        {/* Tool-specific preview */}
        {tool.name === 'shell' && tool.parameters?.cmd && (
          <code className="text-xs text-muted-foreground">
            {Array.isArray(tool.parameters.cmd)
              ? tool.parameters.cmd.slice(1).join(' ').substring(0, 50)
              : String(tool.parameters.cmd).substring(0, 50)}
          </code>
        )}
        {(tool.parameters?.path || tool.parameters?.file_path) && (
          <code className="text-xs text-muted-foreground">
            {tool.parameters.path || tool.parameters.file_path}
          </code>
        )}

        <div className="ml-auto">
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
  isExpanded: boolean;
  onToggle: () => void;
}

function ReasoningDisplay({ itemId, content, isExpanded, onToggle }: ReasoningDisplayProps) {
  // Extract first line for preview, clean up common prefixes
  const lines = (content || '').split('\n').filter(l => l.trim());
  const preview = lines[0]?.substring(0, 60) || 'Reasoning...';
  const isStreaming = !content || content.length < 20; // Short content might still be streaming

  return (
    <div className="bg-violet-500/10 rounded-md transition-all p-1.5 border border-violet-500/20">
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
