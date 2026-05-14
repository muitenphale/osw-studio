import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestStore, setupOrchestratorMocks } from './test-helpers';

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
    store.setState({ persistedInstance: { fake: true } as any });
    store.getState().resetOrchestrator();
    expect(store.getState().persistedInstance).toBeNull();
    expect(store.getState().orchestratorInstance).toBeNull();
  });

  it('resetOrchestrator is a no-op when generating', () => {
    store.setState({ generating: true, persistedInstance: { fake: true } as any });
    store.getState().resetOrchestrator();
    expect(store.getState().persistedInstance).not.toBeNull();
  });

  it('dispatches generationStateChanged window events', async () => {
    const dispatched: CustomEvent[] = [];
    vi.stubGlobal('dispatchEvent', (e: Event) => { dispatched.push(e as CustomEvent); return true; });

    await store.getState().startGeneration('task');

    const generationEvents = dispatched
      .filter(e => e.type === 'generationStateChanged')
      .map(e => e.detail.generating);

    expect(generationEvents).toContain(true);
    expect(generationEvents).toContain(false);

    vi.unstubAllGlobals();
  });
});
