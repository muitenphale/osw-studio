import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockLocalStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockLocalStorage[key] ?? null,
  setItem: (key: string, value: string) => { mockLocalStorage[key] = value; },
  removeItem: (key: string) => { delete mockLocalStorage[key]; },
});

import { createStore } from 'zustand/vanilla';
import { createLayoutSlice, LayoutSlice } from '../slices/layout';

function createLayoutStore() {
  return createStore<LayoutSlice>()((...a) => ({
    ...createLayoutSlice(...a),
  }));
}

describe('layout slice', () => {
  let store: ReturnType<typeof createLayoutStore>;

  beforeEach(() => {
    for (const key of Object.keys(mockLocalStorage)) delete mockLocalStorage[key];
    store = createLayoutStore();
  });

  it('starts with default panel visibility', () => {
    const s = store.getState();
    expect(s.showChat).toBe(true);
    expect(s.showFiles).toBe(true);
    expect(s.showEditor).toBe(false);
    expect(s.showPreview).toBe(true);
  });

  it('togglePanel flips visibility', () => {
    store.getState().togglePanel('editor');
    expect(store.getState().showEditor).toBe(true);
    store.getState().togglePanel('editor');
    expect(store.getState().showEditor).toBe(false);
  });

  it('setPanelOrder updates order', () => {
    const newOrder = ['preview', 'chat', 'files', 'editor', 'console', 'checkpoints', 'debug', 'skills'];
    store.getState().setPanelOrder(newOrder);
    expect(store.getState().panelOrder).toEqual(newOrder);
  });

  it('setActiveMobilePanel sets panel and closes overflow', () => {
    store.setState({ mobileOverflowOpen: true });
    store.getState().setActiveMobilePanel('editor');
    expect(store.getState().activeMobilePanel).toBe('editor');
    expect(store.getState().mobileOverflowOpen).toBe(false);
  });

  it('startDrag / endDrag manage drag state', () => {
    store.getState().startDrag('chat');
    expect(store.getState().draggingPanel).toBe('chat');
    store.getState().endDrag();
    expect(store.getState().draggingPanel).toBeNull();
    expect(store.getState().dropTarget).toBeNull();
  });

  it('resetLayout clears transient state but keeps panel visibility', () => {
    store.getState().togglePanel('editor');
    store.setState({ draggingPanel: 'chat', mobileOverflowOpen: true });
    store.getState().resetLayout();
    expect(store.getState().draggingPanel).toBeNull();
    expect(store.getState().mobileOverflowOpen).toBe(false);
    expect(store.getState().showEditor).toBe(true); // preserved
  });

  it('initLayout reloads panel order from localStorage', () => {
    const customOrder = ['preview', 'chat', 'files', 'editor', 'skills', 'console', 'checkpoints', 'debug'];
    mockLocalStorage['osw-workspace-panel-order'] = JSON.stringify(customOrder);
    store.getState().initLayout();
    expect(store.getState().panelOrder).toEqual(customOrder);
  });
});
