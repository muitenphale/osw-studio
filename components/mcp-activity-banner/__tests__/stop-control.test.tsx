// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * A run started through the connector spends the account's own provider key and edits its files,
 * and this notice is the only place it surfaces. So it is also where the run has to be stoppable:
 * before this the only way to end one was to close the tab.
 */

const stopGeneration = vi.fn();
vi.mock('@/lib/stores/workspace', () => ({
  useWorkspaceStore: { getState: () => ({ stopGeneration }) },
}));
vi.mock('@/lib/api/backend-status', () => ({
  getBackendStatus: () => ({ backendDown: false, authExpired: false }),
  subscribeBackendStatus: () => () => {},
}));

import { markMcpActivity, clearMcpActivity } from '@/lib/api/mcp-activity';
import { McpActivityBanner } from '..';

let container: HTMLDivElement;
let root: Root;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(<McpActivityBanner />); });
}

function buttonLabelled(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    b => (b.textContent ?? '').toLowerCase().includes(label) ||
         (b.getAttribute('aria-label') ?? '').toLowerCase().includes(label)
  ) as HTMLButtonElement | undefined;
}

beforeEach(() => { stopGeneration.mockClear(); clearMcpActivity(); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('the MCP activity banner', () => {
  it('stops the run it is reporting', () => {
    markMcpActivity({ kind: 'run', projectId: 'p1', projectName: 'Site', clientLabel: 'Claude' });
    mount();

    expect(container.textContent).toContain('Claude');
    const stop = buttonLabelled('stop');
    expect(stop).toBeTruthy();
    act(() => { stop!.click(); });

    expect(stopGeneration).toHaveBeenCalledWith('p1');
  });

  it('offers no stop for an edit, which has already happened', () => {
    markMcpActivity({ kind: 'edit', projectId: 'p1', projectName: 'Site', clientLabel: 'Claude' });
    mount();

    expect(container.textContent).toContain('edited files');
    expect(buttonLabelled('stop')).toBeUndefined();
  });
});
