import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestStore, setupOrchestratorMocks } from './test-helpers';
import type { GenerationTask } from '../types';
import { track } from '@/lib/telemetry';

vi.mock('@/lib/llm/multi-agent-orchestrator', () => ({ MultiAgentOrchestrator: vi.fn() }));
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

  it('initProject takes the prompt suggestions from the project', () => {
    store.getState().initProject({
      id: 'p',
      name: 'P',
      settings: { promptSuggestions: [{ id: 's1', label: 'Write a post', prompt: 'Add a post.' }] },
    });
    expect(store.getState().promptSuggestions).toEqual([
      { id: 's1', label: 'Write a post', prompt: 'Add a post.' },
    ]);
  });

  it('initProject gives a project saved without suggestions an empty list', () => {
    // Every project created before the field existed has no `promptSuggestions`, and the chat row
    // falls back to the generic starters only when this is empty rather than undefined.
    store.getState().initProject({ id: 'p', name: 'P', settings: { runtime: 'static' } });
    expect(store.getState().promptSuggestions).toEqual([]);
  });

  it('updateProjectSettings replaces the suggestions, including with none', () => {
    // Deleting the last suggestion has to reach the store, rather than being read as "no change"
    // and leaving the old list in place.
    store.getState().initProject({
      id: 'p',
      name: 'P',
      settings: { promptSuggestions: [{ id: 's1', label: 'One', prompt: 'Do one.' }] },
    });

    store.getState().updateProjectSettings({
      promptSuggestions: [{ id: 's2', label: 'Two', prompt: 'Do two.' }],
    });
    expect(store.getState().promptSuggestions).toEqual([
      { id: 's2', label: 'Two', prompt: 'Do two.' },
    ]);

    store.getState().updateProjectSettings({ promptSuggestions: [] });
    expect(store.getState().promptSuggestions).toEqual([]);
  });

  it('updateProjectSettings leaves the suggestions alone when it is not given any', () => {
    store.getState().initProject({
      id: 'p',
      name: 'P',
      settings: { promptSuggestions: [{ id: 's1', label: 'One', prompt: 'Do one.' }] },
    });
    store.getState().updateProjectSettings({ runtime: 'handlebars' });
    expect(store.getState().promptSuggestions).toEqual([
      { id: 's1', label: 'One', prompt: 'Do one.' },
    ]);
  });

  it('resetProject clears the suggestions so they cannot follow you to the next project', () => {
    store.getState().initProject({
      id: 'p',
      name: 'P',
      settings: { promptSuggestions: [{ id: 's1', label: 'One', prompt: 'Do one.' }] },
    });
    store.getState().resetProject();
    expect(store.getState().promptSuggestions).toEqual([]);
  });

  it('defaults to code mode', () => {
    expect(store.getState().mode).toBe('code');
  });

  it('setMode sets the workspace mode (including interview)', () => {
    store.getState().setMode('chat');
    expect(store.getState().mode).toBe('chat');
    store.getState().setMode('interview');
    expect(store.getState().mode).toBe('interview');
  });

  it('setMode tracks mode_switch only on an actual change', () => {
    vi.mocked(track).mockClear();
    store.getState().setMode('chat');
    store.getState().setMode('interview');
    expect(track).toHaveBeenCalledWith('mode_switch', { from: 'chat', to: 'interview' });

    vi.mocked(track).mockClear();
    store.getState().setMode('interview');
    expect(track).not.toHaveBeenCalled();
  });

  it('setMode defers reset when generating', () => {
    store.getState().initProject({ id: 'p', name: 'P' });
    // Create an active task for the viewed project to make generating=true
    setActiveTask(store, 'p', { persistedInstance: { fake: true } as any });
    store.getState().setMode('chat');
    // persistedInstance should not be cleared because generation is active
    const task = store.getState().generationTasks.get('p');
    expect(task?.persistedInstance).not.toBeNull();
    expect(store.getState().mode).toBe('chat');
  });

  it('setMode resets orchestrator when not generating', () => {
    store.getState().initProject({ id: 'p', name: 'P' });
    // Create a completed task with a fake persistedInstance
    setActiveTask(store, 'p', {
      result: 'completed',
      persistedInstance: { fake: true } as any,
    });
    store.setState({ generating: false });

    store.getState().setMode('chat');

    const task = store.getState().generationTasks.get('p');
    expect(task?.persistedInstance).toBeNull();
  });

  it('defaults to no active interview', () => {
    expect(store.getState().activeInterview).toBeNull();
  });

  it('setActiveInterview sets and clears the active interview', () => {
    store.getState().initProject({ id: 'p', name: 'P' });
    store.getState().setActiveInterview({ templateId: 'understand-company', title: 'Understand a company' });
    expect(store.getState().activeInterview).toEqual({ templateId: 'understand-company', title: 'Understand a company' });
    store.getState().setActiveInterview(null);
    expect(store.getState().activeInterview).toBeNull();
  });

  it('resetProject clears the active interview', () => {
    store.getState().initProject({ id: 'p', name: 'P' });
    store.getState().setActiveInterview({ templateId: 'plan-feature', title: 'Plan a feature' });
    store.getState().resetProject();
    expect(store.getState().activeInterview).toBeNull();
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
    // Create an active task to make generating=true
    setActiveTask(store, 'p');
    store.getState().resetProject();
    expect(store.getState().projectId).toBe('p');
  });
});
