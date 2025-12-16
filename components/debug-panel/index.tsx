'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Bug, X, Trash2, Terminal } from 'lucide-react';
import { vfsShell } from '@/lib/vfs/cli-shell';
import { MemoryMonitor } from './memory-monitor';

export interface DebugEvent {
  id: string;
  timestamp: number;
  event: string;
  data: any;
  count?: number; // For compressed events
  version?: number; // Increments when event is updated (for coalesced streaming)
}

interface DebugPanelProps {
  events: DebugEvent[];
  onClear?: () => void;
  onClose?: () => void;
  projectId?: string;
}

export function DebugPanel({ events, onClear, onClose, projectId }: DebugPanelProps) {
  const [filter, setFilter] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState(true);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Mini terminal state
  const [command, setCommand] = useState('');
  const [shellOutput, setShellOutput] = useState<{cmd: string, output: string, isError?: boolean}[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const shellOutputRef = useRef<HTMLDivElement>(null);

  // Compress consecutive assistant_delta, tool_param_delta, and reasoning_delta events
  // Only store count, not individual events - prevents O(N²) memory growth
  const compressedEvents = useMemo(() => {
    const result: DebugEvent[] = [];
    let currentDeltaGroup: DebugEvent | null = null;

    const COMPRESSIBLE_EVENTS = new Set(['assistant_delta', 'tool_param_delta', 'reasoning_delta']);

    for (const event of events) {
      const shouldCompress = COMPRESSIBLE_EVENTS.has(event.event);

      if (shouldCompress) {
        // If we're already in a group of the same type, just increment count
        if (currentDeltaGroup && currentDeltaGroup.event === event.event) {
          currentDeltaGroup.count = (currentDeltaGroup.count || 1) + 1;
          // Don't accumulate data.all - that causes O(N²) memory usage
          // The count is sufficient for debugging purposes
        } else {
          // Start a new group
          if (currentDeltaGroup) {
            result.push(currentDeltaGroup);
          }
          currentDeltaGroup = { ...event, count: 1 };
        }
      } else {
        // Non-compressible event, flush any current group and add this event
        if (currentDeltaGroup) {
          result.push(currentDeltaGroup);
          currentDeltaGroup = null;
        }
        result.push(event);
      }
    }

    // Flush any remaining group
    if (currentDeltaGroup) {
      result.push(currentDeltaGroup);
    }

    return result;
  }, [events]);

  // Scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [compressedEvents, autoScroll]);

  // Clear all events
  const handleClear = () => {
    onClear?.();
  };

  // Export events as JSON
  const handleExport = () => {
    const json = JSON.stringify(events, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-events-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Run shell command
  const handleRunCommand = async () => {
    if (!command.trim() || !projectId || isRunning) return;

    const cmd = command.trim();
    setCommand('');
    setIsRunning(true);

    try {
      // Parse command string into argv array
      const argv = cmd.split(/\s+/);
      const result = await vfsShell.execute(projectId, argv);

      const output = result.success
        ? result.stdout || '(no output)'
        : result.stderr || 'Command failed';

      setShellOutput(prev => [...prev, { cmd, output, isError: !result.success }]);
    } catch (err) {
      setShellOutput(prev => [...prev, {
        cmd,
        output: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        isError: true
      }]);
    } finally {
      setIsRunning(false);
      // Scroll to bottom of shell output
      setTimeout(() => {
        shellOutputRef.current?.scrollTo({ top: shellOutputRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);
    }
  };

  // Filter events
  const filteredEvents = filter
    ? compressedEvents.filter(e => e.event.toLowerCase().includes(filter.toLowerCase()))
    : compressedEvents;

  // Group events by type (use original events for accurate counts)
  const eventCounts = events.reduce((acc, e) => {
    acc[e.event] = (acc[e.event] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="h-full flex flex-col bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 md:hidden" />
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Hide debug panel"
              className="relative hidden h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-destructive md:flex group"
            >
              <Bug
                className="h-4 w-4 transition-opacity group-hover:opacity-0"
              />
              <X className="absolute h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ) : (
            <Bug className="hidden h-4 w-4 md:inline-flex" />
          )}
          <span className="font-semibold text-sm">Debug Events</span>
          <span className="text-xs text-muted-foreground">
            ({filteredEvents.length}/{events.length})
          </span>
          <MemoryMonitor />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-7 px-2 hover:bg-muted"
            title="Clear all events"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExport}
            className="h-7 px-2 text-xs hover:bg-muted"
            title="Export to JSON"
          >
            Export
          </Button>
        </div>
      </div>

      {/* Event Counts */}
      <div className="p-2 border-b border-border bg-muted/20 text-xs">
        <div className="flex flex-wrap gap-2">
          {Object.entries(eventCounts).map(([event, count]) => (
            <button
              key={event}
              onClick={() => setFilter(filter === event ? '' : event)}
              className={`px-2 py-1 rounded ${
                filter === event
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {event} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Filter Input */}
      <div className="p-2 border-b border-border">
        <input
          type="text"
          placeholder="Filter events..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-2 py-1 text-xs rounded bg-background border border-border"
        />
      </div>

      {/* Auto-scroll toggle */}
      <div className="p-2 border-b border-border flex items-center gap-2">
        <label className="text-xs flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded"
          />
          Auto-scroll
        </label>
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredEvents.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center p-4">
            No events yet. Events will appear here as they occur.
          </div>
        ) : (
          filteredEvents.map((event) => (
            <EventItem key={event.id} event={event} />
          ))
        )}
        <div ref={eventsEndRef} />
      </div>

      {/* Mini Terminal */}
      {projectId && (
        <div className="border-t border-border shrink-0">
          {/* Terminal Header */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b border-border">
            <Terminal className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium">VFS Shell</span>
            {shellOutput.length > 0 && (
              <button
                onClick={() => setShellOutput([])}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {/* Output history */}
          {shellOutput.length > 0 && (
            <div
              ref={shellOutputRef}
              className="max-h-32 overflow-y-auto p-2 bg-zinc-950 font-mono text-xs"
            >
              {shellOutput.map((entry, i) => (
                <div key={i} className="mb-2">
                  <div className="text-emerald-400">$ {entry.cmd}</div>
                  <pre className={`whitespace-pre-wrap ${entry.isError ? 'text-red-400' : 'text-zinc-300'}`}>
                    {entry.output}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {/* Command input */}
          <div className="flex items-center gap-2 p-2 bg-zinc-950">
            <span className="text-emerald-400 font-mono text-xs">$</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRunCommand()}
              placeholder="ls -la /.skills/"
              disabled={isRunning}
              className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-zinc-100 placeholder:text-zinc-600"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRunCommand}
              disabled={isRunning || !command.trim()}
              className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            >
              {isRunning ? '...' : 'Run'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EventItem({ event }: { event: DebugEvent }) {
  const [isOpen, setIsOpen] = useState(false);
  const time = new Date(event.timestamp).toLocaleTimeString();

  // Color code by event type
  const getEventColor = (eventType: string) => {
    if (eventType.includes('error') || eventType.includes('failed')) return 'text-red-500';
    if (eventType.includes('retry')) return 'text-yellow-500';
    if (eventType.includes('completed') || eventType.includes('success')) return 'text-green-500';
    if (eventType.includes('tool')) return 'text-blue-500';
    if (eventType.includes('agent')) return 'text-purple-500';
    if (eventType.includes('plan')) return 'text-orange-500';
    return 'text-foreground';
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full text-left">
        <div className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 text-xs">
          {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          <span className="text-muted-foreground font-mono">{time}</span>
          <span className={`font-semibold ${getEventColor(event.event)}`}>
            {event.event}
          </span>
          {event.count && event.count > 1 && (
            <span className="text-muted-foreground font-mono">
              ({event.count})
            </span>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-6 p-2 bg-muted/30 rounded text-xs font-mono overflow-x-auto">
          <pre>{JSON.stringify(event.data, null, 2)}</pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
