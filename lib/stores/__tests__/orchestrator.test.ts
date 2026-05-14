import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestStore, setupOrchestratorMocks } from './test-helpers';
import { debugEventsState } from '@/lib/llm/debug-events-state';

vi.mock('@/lib/llm/multi-agent-orchestrator', () => ({ MultiAgentOrchestrator: vi.fn() }));
setupOrchestratorMocks();

describe('orchestrator slice — initial state', () => {
  it('starts with generating=false and no orchestrator instance', () => {
    const store = createTestStore();
    const state = store.getState();
    expect(state.generating).toBe(false);
    expect(state.orchestratorInstance).toBeNull();
    expect(state.persistedInstance).toBeNull();
    expect(state.debugEvents).toEqual([]);
    expect(state.currentModel).toBe('');
    expect(state.projectCost).toBe(0);
  });
});

describe('orchestrator slice — addDebugEvent', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  it('appends a new event with id, timestamp, count=1, version=1', () => {
    store.getState().addDebugEvent('test_event', { foo: 'bar' });
    const events = store.getState().debugEvents;
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('test_event');
    expect(events[0].data).toEqual({ foo: 'bar' });
    expect(events[0].count).toBe(1);
    expect(events[0].version).toBe(1);
    expect(events[0].id).toBeDefined();
    expect(events[0].timestamp).toBeDefined();
  });

  it('coalesces consecutive assistant_delta events', () => {
    store.getState().addDebugEvent('assistant_delta', { text: 'Hello' });
    store.getState().addDebugEvent('assistant_delta', { text: ' world' });
    const events = store.getState().debugEvents;
    expect(events).toHaveLength(1);
    expect(events[0].version).toBe(2);
    expect(events[0].count).toBe(2);
    expect(events[0].data.all).toEqual([{ text: 'Hello' }, { text: ' world' }]);
  });

  it('accumulates data.all across 3+ coalesces', () => {
    store.getState().addDebugEvent('assistant_delta', { text: 'a' });
    store.getState().addDebugEvent('assistant_delta', { text: 'b' });
    store.getState().addDebugEvent('assistant_delta', { text: 'c' });
    const events = store.getState().debugEvents;
    expect(events).toHaveLength(1);
    expect(events[0].count).toBe(3);
    expect(events[0].version).toBe(3);
    expect(events[0].data.all).toEqual([{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
  });

  it('coalesces tool_param_delta events', () => {
    store.getState().addDebugEvent('tool_param_delta', { chunk: 'a' });
    store.getState().addDebugEvent('tool_param_delta', { chunk: 'b' });
    const events = store.getState().debugEvents;
    expect(events).toHaveLength(1);
    expect(events[0].count).toBe(2);
  });

  it('coalesces reasoning_delta events', () => {
    store.getState().addDebugEvent('reasoning_delta', { text: 'r1' });
    store.getState().addDebugEvent('reasoning_delta', { text: 'r2' });
    expect(store.getState().debugEvents).toHaveLength(1);
  });

  it('does NOT coalesce different event types', () => {
    store.getState().addDebugEvent('assistant_delta', { text: 'Hello' });
    store.getState().addDebugEvent('tool_status', { status: 'running' });
    store.getState().addDebugEvent('assistant_delta', { text: ' world' });
    const events = store.getState().debugEvents;
    expect(events).toHaveLength(2);
    const statusEvent = events.find(e => e.event === 'tool_status')!;
    expect(statusEvent).toBeDefined();
    const deltaEvent = events.find(e => e.event === 'assistant_delta')!;
    expect(deltaEvent.count).toBe(2);
  });

  it('coalesces with interleaved non-delta events within search window', () => {
    store.getState().addDebugEvent('assistant_delta', { text: 'a' });
    store.getState().addDebugEvent('toolCalls', { calls: [] });
    store.getState().addDebugEvent('assistant_delta', { text: 'b' });
    const events = store.getState().debugEvents;
    expect(events).toHaveLength(2);
    const deltaEvent = events.find(e => e.event === 'assistant_delta')!;
    expect(deltaEvent.count).toBe(2);
  });

  it('prunes events exceeding MAX_DEBUG_EVENTS', () => {
    for (let i = 0; i < 2010; i++) {
      store.getState().addDebugEvent('conversation_message', { i });
    }
    const len = store.getState().debugEvents.length;
    expect(len).toBeLessThanOrEqual(2000);
    expect(len).toBe(2000);
  });

  it('clearDebugEvents resets to empty array', () => {
    store.getState().addDebugEvent('test', { x: 1 });
    store.getState().clearDebugEvents();
    expect(store.getState().debugEvents).toEqual([]);
  });
});

describe('orchestrator slice — IndexedDB persistence', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounce-persists events to IndexedDB after 500ms', async () => {
    store.getState().initPersistence('test-project-1');
    store.getState().addDebugEvent('test', { x: 1 });

    expect(debugEventsState.saveEvents).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(debugEventsState.saveEvents).toHaveBeenCalledWith(
      'test-project-1',
      expect.any(Array),
    );
  });

  it('resets debounce timer on rapid events', () => {
    store.getState().initPersistence('test-project-1');
    store.getState().addDebugEvent('test', { x: 1 });
    vi.advanceTimersByTime(300);
    store.getState().addDebugEvent('test', { x: 2 });
    vi.advanceTimersByTime(300);
    expect(debugEventsState.saveEvents).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(debugEventsState.saveEvents).toHaveBeenCalledTimes(1);
  });
});
