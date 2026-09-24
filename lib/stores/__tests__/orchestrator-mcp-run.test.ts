import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestStore, setupOrchestratorMocks } from './test-helpers';

setupOrchestratorMocks();

/**
 * A run asked for over MCP reaches every tab the account has open on its SSE channel.
 *
 * Without a claim, each of them called `startServerGeneration` on the same project: two agents
 * editing one set of files, two bills, and every answer but the first thrown away. A live run with
 * two tabs open produced exactly that, two POSTs to /api/server-generate for one `agent_run`.
 */
describe('orchestrator slice — an MCP run request arriving at a tab', () => {
  let store: ReturnType<typeof createTestStore>;
  let startServerGeneration: ReturnType<typeof vi.fn>;
  let clearChat: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  /** Answers the claim POST with `granted`, and everything else with an empty 200. */
  function claimReturns(granted: boolean) {
    fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes('agent-claim') ? { granted } : {}),
    }));
    vi.stubGlobal('fetch', fetchMock);
  }

  /** The handler lives inside the SSE client's onEvent, so drive it the way the server does. */
  async function deliver(data: Record<string, unknown>) {
    store.getState().connectSSE();
    // Imported here, not at the top: the module mocks are registered by test-helpers, and a
    // top-level import of this module would be resolved before that happens.
    const { SSEClient } = await import('@/lib/server-generate/sse-client');
    const ctor = SSEClient as unknown as { mock: { calls: [{ onEvent: (e: string, d: unknown) => void }][] } };
    const { onEvent } = ctor.mock.calls[ctor.mock.calls.length - 1][0];
    onEvent('mcp_run_requested', { sourceProjectId: 'p1', requestId: 'r1', projectId: 'p1', prompt: 'go', chatMode: false, ...data });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(() => {
    store = createTestStore();
    vi.clearAllMocks();
    startServerGeneration = vi.fn().mockResolvedValue(true);
    clearChat = vi.fn().mockResolvedValue(undefined);
    store.setState({ startServerGeneration, clearChat });
    vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'true');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('starts the task when this tab is the one that took the request', async () => {
    claimReturns(true);

    await deliver({});

    await vi.waitFor(() => expect(startServerGeneration).toHaveBeenCalledWith('p1', 'go', false));
  });

  it('does nothing when another tab took it first', async () => {
    claimReturns(false);

    await deliver({});

    expect(startServerGeneration).not.toHaveBeenCalled();
    // And it does not report a result either: the tab that won the claim answers.
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).not.toContain('/api/mcp/agent-result');
  });

  it('never clears the conversation, whatever the client asks', async () => {
    // `clearChat` calls `clearEvents`, which overwrites the stored conversation with an empty
    // list. An outside client asking for a task must not be able to destroy the person's own
    // chat, so the run continues whatever is there and the old `freshChat` flag is ignored.
    claimReturns(true);

    await deliver({ freshChat: true });

    await vi.waitFor(() => expect(startServerGeneration).toHaveBeenCalled());
    expect(clearChat).not.toHaveBeenCalled();
  });

  it('registers the project for persistence, so a reload still has the conversation', async () => {
    claimReturns(true);
    const initPersistence = vi.fn();
    store.setState({ initPersistence });

    await deliver({});

    // Without this the events live in an in-memory buffer only, and a reload loses the whole run.
    await vi.waitFor(() => expect(initPersistence).toHaveBeenCalledWith('p1'));
  });

  it('says on screen that a connected client is running a task, until the task ends', async () => {
    claimReturns(true);
    const { getMcpActivity } = await import('@/lib/api/mcp-activity');

    await deliver({ clientLabel: 'Claude' });

    await vi.waitFor(() => expect(getMcpActivity()).toMatchObject({ kind: 'run', projectId: 'p1', clientLabel: 'Claude' }));

    const { SSEClient } = await import('@/lib/server-generate/sse-client');
    const ctor = SSEClient as unknown as { mock: { calls: [{ onEvent: (e: string, d: unknown) => void }][] } };
    ctor.mock.calls[ctor.mock.calls.length - 1][0].onEvent('task_complete', { sourceProjectId: 'p1', result: 'success' });

    expect(getMcpActivity()).toBeNull();
  });

  it('says nothing when the task never started', async () => {
    claimReturns(true);
    startServerGeneration.mockResolvedValue(false);
    const { getMcpActivity } = await import('@/lib/api/mcp-activity');

    await deliver({ clientLabel: 'Claude' });

    await vi.waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('agent-result'))).toBe(true));
    expect(getMcpActivity()).toBeNull();
  });
});
