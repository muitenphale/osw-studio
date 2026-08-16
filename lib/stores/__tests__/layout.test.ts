import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockLocalStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockLocalStorage[key] ?? null,
  setItem: (key: string, value: string) => { mockLocalStorage[key] = value; },
  removeItem: (key: string) => { delete mockLocalStorage[key]; },
});

import { createStore } from 'zustand/vanilla';
import { createLayoutSlice, LayoutSlice, PANEL_MAP, visiblePanelKeys } from '../slices/layout';

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

  it('initLayout reloads panel order from localStorage, appending panels stored orders predate', () => {
    // An existing user's stored order was written before the Elements panel existed. The stored
    // sequence must survive verbatim and the unknown-to-it panel must be appended, not dropped —
    // this is the whole migration story for panel registration.
    const customOrder = ['preview', 'chat', 'files', 'editor', 'skills', 'console', 'checkpoints', 'debug'];
    mockLocalStorage['osw-workspace-panel-order'] = JSON.stringify(customOrder);
    store.getState().initLayout();

    const order = store.getState().panelOrder;
    expect(order.slice(0, customOrder.length)).toEqual(customOrder);
    expect(order).toContain('elements');
    // No duplicates, and nothing registered is missing.
    expect(new Set(order).size).toBe(order.length);
    expect([...order].sort()).toEqual(Object.keys(PANEL_MAP).sort());
  });

  it('drops unknown keys from a stored order', () => {
    mockLocalStorage['osw-workspace-panel-order'] = JSON.stringify(['chat', 'ghost-panel', 'files']);
    store.getState().initLayout();
    expect(store.getState().panelOrder).not.toContain('ghost-panel');
    expect(store.getState().panelOrder.slice(0, 2)).toEqual(['chat', 'files']);
  });

  describe('elements panel registration', () => {
    it('is hidden by default and is a known panel', () => {
      expect(store.getState().showElements).toBe(false);
      expect(PANEL_MAP.elements).toBe('showElements');
      expect(store.getState().panelOrder).toContain('elements');
    });

    it('togglePanel flips it and persists it', () => {
      store.getState().togglePanel('elements');
      expect(store.getState().showElements).toBe(true);
      expect(JSON.parse(mockLocalStorage['osw-workspace-panels']).elements).toBe(true);

      store.getState().togglePanel('elements');
      expect(store.getState().showElements).toBe(false);
      expect(JSON.parse(mockLocalStorage['osw-workspace-panels']).elements).toBe(false);
    });

    it('restores a persisted open state on a fresh store', () => {
      store.getState().togglePanel('elements');
      const revived = createLayoutStore();
      expect(revived.getState().showElements).toBe(true);
    });

    it('opening it does not cost you the preview', () => {
      // Defaults are chat + files + preview, which is already the three-panel maximum, and preview
      // sits rightmost of the three in the default order — so the naive "close the rightmost open
      // panel" rule would unmount the very iframe the tree reads.
      expect(store.getState().showPreview).toBe(true);
      store.getState().togglePanel('elements');

      expect(store.getState().showElements).toBe(true);
      expect(store.getState().showPreview).toBe(true);
      expect(visiblePanelKeys(store.getState())).toContain('preview');
      // Still exactly three panels: something else made way.
      expect(visiblePanelKeys(store.getState())).toHaveLength(3);
    });

    it('evicts the preview only when it is the sole candidate', () => {
      // A layout of preview + elements alone cannot exercise the guard (two panels leaves room),
      // so drive it to the limit with the preview as the rightmost non-elements panel available.
      store.setState({
        showChat: false, showFiles: false, showEditor: true, showConsole: true,
        showPreview: true, showCheckpoints: false, showDebugPanel: false,
        showSkillsPanel: false, showElements: false,
      });
      store.getState().togglePanel('elements');
      // editor and console are evictable, so the preview survives.
      expect(store.getState().showPreview).toBe(true);
      expect(visiblePanelKeys(store.getState())).toHaveLength(3);
    });

    it('closing it is always allowed and never evicts anything', () => {
      store.getState().togglePanel('elements');
      const before = visiblePanelKeys(store.getState()).filter(k => k !== 'elements');
      store.getState().togglePanel('elements');
      expect(store.getState().showElements).toBe(false);
      expect(visiblePanelKeys(store.getState())).toEqual(before);
    });
  });

  describe('visiblePanelKeys', () => {
    it('lists open panels in panel order', () => {
      store.setState({ panelOrder: ['debug', 'preview', 'chat', 'files', 'elements'] });
      store.setState({ showChat: true, showFiles: false, showPreview: true, showElements: true });
      expect(visiblePanelKeys(store.getState())).toEqual(['preview', 'chat', 'elements']);
    });

    it('covers every registered panel, so the workspace cannot half-see one', () => {
      // The workspace sizes panels and computes drop indices from this list. A panel that is in
      // PANEL_MAP but invisible here would desynchronise both.
      const order = Object.keys(PANEL_MAP);
      const allOpen = { ...store.getState() } as unknown as Record<string, unknown>;
      for (const flag of Object.values(PANEL_MAP)) allOpen[flag] = true;
      expect(visiblePanelKeys(allOpen as unknown as LayoutSlice, order)).toEqual(order);
    });

    it('ignores keys that are not panels', () => {
      store.setState({ panelOrder: ['chat', 'ghost-panel'] });
      expect(visiblePanelKeys(store.getState())).toEqual(['chat']);
    });
  });
});
