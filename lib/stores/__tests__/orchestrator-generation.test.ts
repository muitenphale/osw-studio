import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestStore, setupOrchestratorMocks } from './test-helpers';
import type { GenerationTask } from '../types';

const mockExecute = vi.fn().mockResolvedValue({
  success: true,
  summary: 'done',
  totalCost: 0.01,
  toolCount: 2,
  turnCount: 1,
  apiErrorCount: 0,
});
const mockStop = vi.fn();
const mockContinue = vi.fn();
const mockImportConversation = vi.fn();

vi.mock('@/lib/llm/multi-agent-orchestrator', () => ({
  MultiAgentOrchestrator: vi.fn().mockImplementation(() => ({
    execute: mockExecute,
    stop: mockStop,
    continue: mockContinue,
    importConversation: mockImportConversation,
  })),
}));

setupOrchestratorMocks();

function setActiveTask(
  store: ReturnType<typeof createTestStore>,
  projectId: string,
  overrides?: Partial<GenerationTask>,
) {
  const tasks = new Map(store.getState().generationTasks);
  tasks.set(projectId, {
    projectId,
    projectName: 'Test',
    prompt: 'test',
    model: 'gpt-4',
    startedAt: Date.now(),
    result: null,
    paused: false,
    pausedMessage: null,
    orchestratorInstance: null,
    persistedInstance: null,
    ...overrides,
  });
  store.setState({ generationTasks: tasks, generating: true });
}

describe('orchestrator slice — generation lifecycle', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.clearAllMocks();
  });

  it('startGeneration sets generating=true', async () => {
    const promise = store.getState().startGeneration('build a todo app');
    expect(store.getState().generating).toBe(true);
    await promise;
  });

  it('startGeneration sets generating=false on completion', async () => {
    await store.getState().startGeneration('build a todo app');
    expect(store.getState().generating).toBe(false);
  });

  it('startGeneration rejects if already generating', async () => {
    const first = store.getState().startGeneration('task 1');
    await store.getState().startGeneration('task 2');
    await first;
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('stopGeneration calls stop on orchestrator and sets generating=false', async () => {
    const promise = store.getState().startGeneration('task');
    store.getState().stopGeneration();
    expect(mockStop).toHaveBeenCalled();
    // After stop, the task transitions to result: 'failed', so generating becomes false
    expect(store.getState().generating).toBe(false);
    await promise;
  });

  it('continueGeneration calls continue on orchestrator', async () => {
    const promise = store.getState().startGeneration('task');
    store.getState().continueGeneration();
    expect(mockContinue).toHaveBeenCalled();
    await promise;
  });

  it('resetOrchestrator clears instances when not generating', () => {
    // Set up a completed task with a fake persistedInstance
    const projectId = store.getState().projectId || '';
    setActiveTask(store, projectId, {
      result: 'completed',
      persistedInstance: { fake: true } as any,
    });
    store.setState({ generating: false });

    store.getState().resetOrchestrator();

    const task = store.getState().generationTasks.get(projectId);
    expect(task?.persistedInstance).toBeNull();
    expect(task?.orchestratorInstance).toBeNull();
  });

  it('resetOrchestrator is a no-op when generating', () => {
    const projectId = store.getState().projectId || '';
    setActiveTask(store, projectId, {
      persistedInstance: { fake: true } as any,
    });

    store.getState().resetOrchestrator();

    const task = store.getState().generationTasks.get(projectId);
    expect(task?.persistedInstance).not.toBeNull();
  });

  it('dispatches generationStateChanged window events', async () => {
    const dispatched: CustomEvent[] = [];
    vi.stubGlobal('dispatchEvent', (e: Event) => { dispatched.push(e as CustomEvent); return true; });

    await store.getState().startGeneration('task');

    const generationEvents = dispatched
      .filter(e => e.type === 'generationStateChanged')
      .map(e => e.detail);

    // Should have both a true and a false event
    expect(generationEvents.some(d => d.generating === true)).toBe(true);
    expect(generationEvents.some(d => d.generating === false)).toBe(true);
    // Events include projectId
    expect(generationEvents.every(d => 'projectId' in d)).toBe(true);

    vi.unstubAllGlobals();
  });
});

describe('orchestrator slice — concurrent generation', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.clearAllMocks();
  });

  it('isProjectGenerating returns true only for active tasks', () => {
    setActiveTask(store, 'proj-a');
    setActiveTask(store, 'proj-b', { result: 'completed' });

    expect(store.getState().isProjectGenerating('proj-a')).toBe(true);
    expect(store.getState().isProjectGenerating('proj-b')).toBe(false);
    expect(store.getState().isProjectGenerating('proj-c')).toBe(false);
  });

  it('isAnyGenerating returns true when at least one task is active', () => {
    expect(store.getState().isAnyGenerating()).toBe(false);

    setActiveTask(store, 'proj-a');
    expect(store.getState().isAnyGenerating()).toBe(true);

    // Mark it as completed
    const tasks = new Map(store.getState().generationTasks);
    const task = tasks.get('proj-a')!;
    tasks.set('proj-a', { ...task, result: 'completed' });
    store.setState({ generationTasks: tasks });

    expect(store.getState().isAnyGenerating()).toBe(false);
  });

  it('stopGeneration(projectId) only stops that project', () => {
    const fakeOrch = { stop: vi.fn() } as any;
    setActiveTask(store, 'proj-a', { orchestratorInstance: fakeOrch });
    setActiveTask(store, 'proj-b');

    store.getState().stopGeneration('proj-a');

    expect(fakeOrch.stop).toHaveBeenCalled();
    const taskA = store.getState().generationTasks.get('proj-a');
    expect(taskA?.result).toBe('failed');
    // proj-b should still be active
    expect(store.getState().isProjectGenerating('proj-b')).toBe(true);
  });

  it('dismissGenerationResult removes only that project task', () => {
    setActiveTask(store, 'proj-a', { result: 'completed' });
    setActiveTask(store, 'proj-b', { result: 'failed' });

    store.getState().dismissGenerationResult('proj-a');

    expect(store.getState().generationTasks.has('proj-a')).toBe(false);
    expect(store.getState().generationTasks.has('proj-b')).toBe(true);
  });

  it('dismissGenerationResult is a no-op for active tasks', () => {
    setActiveTask(store, 'proj-a'); // result: null (active)

    store.getState().dismissGenerationResult('proj-a');

    expect(store.getState().generationTasks.has('proj-a')).toBe(true);
  });
});
