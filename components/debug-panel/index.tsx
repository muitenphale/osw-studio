'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Bug, Trash2 } from 'lucide-react';
import { PanelContainer, PanelHeader } from '@/components/ui/panel';
import { MemoryMonitor } from './memory-monitor';
import { configManager } from '@/lib/config/storage';

import type { DebugEvent } from '@/lib/stores/types';

interface DebugPanelProps {
  events: DebugEvent[];
  onClear?: () => void;
  onClose?: () => void;
}

export function DebugPanel({ events, onClear, onClose }: DebugPanelProps) {
  const [filter, setFilter] = useState<string>('');
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [streamDebug, setStreamDebug] = useState<boolean>(() => configManager.getDebugStreamEnabled());

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
    <PanelContainer>
      <PanelHeader
        icon={Bug}
        title="Debug Events"
        onClose={onClose}
        panelKey="debug"
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-6 rounded-full border border-border/60 bg-muted/50 px-2.5 gap-1.5 md:h-5 md:w-5 md:px-0 md:border-0 md:bg-transparent md:rounded-md"
              title="Clear all events"
            >
              <Trash2 className="h-2.5 w-2.5 md:h-3 md:w-3" />
              <span className="text-xs md:hidden">Clear</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="h-6 rounded-full border border-border/60 bg-muted/50 px-2.5 text-xs md:h-5 md:px-1.5 md:border-0 md:bg-transparent md:rounded-md"
              title="Export to JSON"
            >
              Export
            </Button>
          </>
        }
      >
        <span className="text-xs text-muted-foreground">
          ({filteredEvents.length}/{events.length})
        </span>
        <MemoryMonitor />
      </PanelHeader>

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

      {/* Toggles */}
      <div className="p-2 border-b border-border flex items-center gap-4">
        <label className="text-xs flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded"
          />
          Auto-scroll
        </label>
        <label
          className="text-xs flex items-center gap-1 cursor-pointer"
          title="Emit llm_request and stream_raw_chunk events. Ephemeral, not persisted."
        >
          <input
            type="checkbox"
            checked={streamDebug}
            onChange={(e) => {
              setStreamDebug(e.target.checked);
              configManager.setDebugStreamEnabled(e.target.checked);
            }}
            className="rounded"
          />
          Stream debug
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

    </PanelContainer>
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
