import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Adapters are cached per workspace, so a workspace that goes away has to be evicted.
 *
 * Deleting a workspace removes its directory. A cached adapter left behind holds an open handle on
 * a database file that no longer exists, and hands the next caller asking for that id a connection
 * to it rather than building a fresh one.
 */

vi.mock('server-only', () => ({}));

const WS = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-cache-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  fs.mkdirSync(path.join(dir, 'data', 'workspaces', WS), { recursive: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the workspace adapter cache', () => {
  it('hands back the same adapter for the same workspace', async () => {
    const { getWorkspaceAdapter } = await import('../server');

    expect(getWorkspaceAdapter(WS)).toBe(getWorkspaceAdapter(WS));
  });

  it('builds a new one after the workspace is closed', async () => {
    const { getWorkspaceAdapter, closeWorkspaceAdapter } = await import('../server');
    const first = getWorkspaceAdapter(WS);
    await first.init();

    closeWorkspaceAdapter(WS);

    // A different instance, so nothing is still reading through the evicted one.
    expect(getWorkspaceAdapter(WS)).not.toBe(first);
  });

  it('closes the database handle it was holding', async () => {
    const { getWorkspaceAdapter, closeWorkspaceAdapter } = await import('../server');
    const adapter = getWorkspaceAdapter(WS);
    await adapter.init();
    await adapter.createProject({
      id: 'p1', name: 'P', createdAt: new Date(), updatedAt: new Date(), settings: {},
    } as never);

    const close = vi.spyOn(adapter, 'close');
    closeWorkspaceAdapter(WS);

    expect(close).toHaveBeenCalled();
  });

  it('survives closing a workspace it never cached', async () => {
    const { closeWorkspaceAdapter } = await import('../server');

    // The delete route calls this whether or not anything touched the workspace this process.
    expect(() => closeWorkspaceAdapter(WS)).not.toThrow();
  });

  it('still evicts when closing the handle throws', async () => {
    const { getWorkspaceAdapter, closeWorkspaceAdapter } = await import('../server');
    const first = getWorkspaceAdapter(WS);
    await first.init();
    vi.spyOn(first, 'close').mockImplementation(() => {
      throw new Error('already closed');
    });

    closeWorkspaceAdapter(WS);

    // Dropping it from the cache is the part that matters; a handle that refuses to close must not
    // leave the dead adapter serving later requests.
    expect(getWorkspaceAdapter(WS)).not.toBe(first);
  });
});
