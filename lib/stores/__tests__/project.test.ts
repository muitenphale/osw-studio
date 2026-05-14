import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestStore, setupOrchestratorMocks } from './test-helpers';

vi.mock('@/lib/llm/multi-agent-orchestrator', () => ({ MultiAgentOrchestrator: vi.fn() }));
setupOrchestratorMocks();

describe('project slice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  it('initProject populates fields', () => {
    store.getState().initProject({
      id: 'proj-1',
      name: 'Test Project',
      settings: { runtime: 'react', previewEntryPoint: 'index.html' },
    });
    expect(store.getState().projectId).toBe('proj-1');
    expect(store.getState().projectName).toBe('Test Project');
    expect(store.getState().projectRuntime).toBe('react');
    expect(store.getState().entryPoint).toBe('index.html');
  });

  it('markDirty / markClean toggles isDirty', () => {
    expect(store.getState().isDirty).toBe(false);
    store.getState().markDirty();
    expect(store.getState().isDirty).toBe(true);
    store.getState().markClean();
    expect(store.getState().isDirty).toBe(false);
  });

  it('bumpRefreshTrigger increments', () => {
    const before = store.getState().refreshTrigger;
    store.getState().bumpRefreshTrigger();
    expect(store.getState().refreshTrigger).toBe(before + 1);
  });

  it('updateProjectSettings updates runtime and bumps refresh', () => {
    store.getState().initProject({ id: 'p', name: 'P', settings: { runtime: 'static' } });
    const before = store.getState().refreshTrigger;
    store.getState().updateProjectSettings({ runtime: 'handlebars', previewEntryPoint: 'main.html' });
    expect(store.getState().projectRuntime).toBe('handlebars');
    expect(store.getState().entryPoint).toBe('main.html');
    expect(store.getState().refreshTrigger).toBe(before + 1);
  });

  it('setChatMode defers reset when generating', () => {
    store.setState({ generating: true });
    store.getState().initProject({ id: 'p', name: 'P' });
    store.setState({ persistedInstance: { fake: true } as any });
    store.getState().setChatMode(true);
    expect(store.getState().persistedInstance).not.toBeNull();
    expect(store.getState().chatMode).toBe(true);
  });

  it('setChatMode resets orchestrator when not generating', () => {
    store.getState().initProject({ id: 'p', name: 'P' });
    store.setState({ persistedInstance: { fake: true } as any });
    store.getState().setChatMode(true);
    expect(store.getState().persistedInstance).toBeNull();
  });

  it('resetProject clears all project state', () => {
    store.getState().initProject({ id: 'p', name: 'P', settings: { runtime: 'react' } });
    store.getState().markDirty();
    store.getState().resetProject();
    expect(store.getState().projectId).toBe('');
    expect(store.getState().isDirty).toBe(false);
    expect(store.getState().projectRuntime).toBeUndefined();
  });

  it('resetProject is a no-op when generating', () => {
    store.getState().initProject({ id: 'p', name: 'P' });
    store.setState({ generating: true });
    store.getState().resetProject();
    expect(store.getState().projectId).toBe('p');
  });
});
