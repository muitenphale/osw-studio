import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkCommandPermission } from '../tool-registry';
import { configManager } from '@/lib/config/storage';

function stubBrowserStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {} as unknown as Window);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  });
}
beforeEach(stubBrowserStorage);
afterEach(() => vi.unstubAllGlobals());

describe('checkCommandPermission', () => {
  it('allows non-gated commands without calling the callback', async () => {
    const cb = vi.fn();
    const r = await checkCommandPermission(['cat', '/f'], { onApprovalNeeded: cb });
    expect(r).toEqual({ allowed: true });
    expect(cb).not.toHaveBeenCalled();
  });

  it('in ask mode, prompts for external curl and denies on deny', async () => {
    configManager.setPermissionMode('ask');
    const cb = vi.fn().mockResolvedValue('deny');
    const r = await checkCommandPermission(['curl', 'https://x.com'], { onApprovalNeeded: cb });
    expect(cb).toHaveBeenCalledOnce();
    expect(r.allowed).toBe(false);
  });

  it('persists always-allow so the next call does not prompt', async () => {
    configManager.setPermissionMode('ask');
    const cb = vi.fn().mockResolvedValue('always');
    await checkCommandPermission(['search', 'foo'], { onApprovalNeeded: cb });
    expect(configManager.getPermissionOverrides().search).toBe('allow');
    const cb2 = vi.fn();
    const r = await checkCommandPermission(['search', 'bar'], { onApprovalNeeded: cb2 });
    expect(cb2).not.toHaveBeenCalled();
    expect(r.allowed).toBe(true);
  });

  it('allows when no callback is available (headless)', async () => {
    configManager.setPermissionMode('ask');
    const r = await checkCommandPermission(['curl', 'https://x.com'], {});
    expect(r.allowed).toBe(true);
  });

  it('uses context-provided mode over configManager (server run: auto allows)', async () => {
    configManager.setPermissionMode('ask'); // server default would gate, but context says auto
    const cb = vi.fn();
    const r = await checkCommandPermission(['search', 'x'], { permissionMode: 'auto', onApprovalNeeded: cb });
    expect(cb).not.toHaveBeenCalled();
    expect(r.allowed).toBe(true);
  });

  it('server run with ask + deny callback declines a gated command', async () => {
    const r = await checkCommandPermission(
      ['curl', 'https://x.com'],
      { permissionMode: 'ask', permissionOverrides: {}, onApprovalNeeded: async () => 'deny' },
    );
    expect(r.allowed).toBe(false);
  });

  it('context overrides allow-list is honored', async () => {
    const r = await checkCommandPermission(
      ['search', 'x'],
      { permissionMode: 'ask', permissionOverrides: { search: 'allow' }, onApprovalNeeded: async () => 'deny' },
    );
    expect(r.allowed).toBe(true);
  });

  it('pauseForApproval: gated command emits approval_required and declines (server pause path)', async () => {
    const onProgress = vi.fn();
    const cb = vi.fn();
    const r = await checkCommandPermission(
      ['search', 'muse glimmer 30b'],
      { permissionMode: 'ask', permissionOverrides: {}, pauseForApproval: true, onProgress, onApprovalNeeded: cb },
    );
    expect(r.allowed).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/awaiting your approval/i);
    // Emits the pause signal and never reaches the (would-deny) live callback.
    expect(onProgress).toHaveBeenCalledWith('approval_required', expect.objectContaining({ gateKey: 'search' }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('pauseForApproval: a standing allow skips the pause entirely', async () => {
    const onProgress = vi.fn();
    const r = await checkCommandPermission(
      ['search', 'x'],
      { permissionMode: 'ask', permissionOverrides: { search: 'allow' }, pauseForApproval: true, onProgress },
    );
    expect(r.allowed).toBe(true);
    expect(onProgress).not.toHaveBeenCalled();
  });
});
