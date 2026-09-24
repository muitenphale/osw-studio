import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestStore, setupOrchestratorMocks } from './test-helpers';

setupOrchestratorMocks();

/**
 * The server-to-tab channel has to be open whenever the tab is, not only while a task runs.
 *
 * The server uses it to ask this tab for things it cannot do itself: start an agent task with the
 * provider key that lives in the browser, or pull a project an MCP client just changed. It used to
 * connect only when `reattachServerTasks` found a task to reattach, and disconnect five seconds
 * later when none were running, so on a quiet workspace those requests reached nobody: the
 * connector reported "no tab is open" with the workspace plainly open in front of the person.
 */
describe('orchestrator slice — the server-to-tab channel', () => {
  let store: ReturnType<typeof createTestStore>;
  let connectSSE: ReturnType<typeof vi.fn>;
  let disconnectSSE: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = createTestStore();
    vi.clearAllMocks();
    vi.useFakeTimers();
    connectSSE = vi.fn();
    disconnectSSE = vi.fn();
    store.setState({ connectSSE, disconnectSSE });
    vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'true');
    vi.stubGlobal('window', { location: { pathname: '/w/ws1/projects' } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function statusReturns(tasks: unknown[]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tasks }) }));
  }

  it('connects on a workspace with no server tasks at all', async () => {
    statusReturns([]);

    await store.getState().reattachServerTasks();

    expect(connectSSE).toHaveBeenCalled();
  });

  it('stays connected once the tasks it reattached have finished', async () => {
    statusReturns([
      { taskId: 't1', projectId: 'p1', status: 'completed', prompt: 'x', projectName: 'P' },
    ]);

    await store.getState().reattachServerTasks();
    // The old code disconnected here, five seconds after replay, when nothing was running.
    await vi.advanceTimersByTimeAsync(10_000);

    expect(connectSSE).toHaveBeenCalled();
    expect(disconnectSSE).not.toHaveBeenCalled();
  });

  it('does nothing in browser mode, which has no server to listen to', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'false');
    statusReturns([]);

    await store.getState().reattachServerTasks();

    expect(connectSSE).not.toHaveBeenCalled();
  });
});
