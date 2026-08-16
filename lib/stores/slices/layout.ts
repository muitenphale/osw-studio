import { StateCreator } from 'zustand';

type MobilePanelType = 'chat' | 'files' | 'editor' | 'preview' | 'checkpoints' | 'console' | 'skills' | 'debug';

const DEFAULT_PANEL_ORDER = ['chat', 'files', 'editor', 'skills', 'console', 'preview', 'elements', 'checkpoints', 'debug'];

export interface LayoutSlice {
  showChat: boolean;
  showFiles: boolean;
  showEditor: boolean;
  showPreview: boolean;
  showCheckpoints: boolean;
  showConsole: boolean;
  showSkillsPanel: boolean;
  showDebugPanel: boolean;
  showElements: boolean;
  showProjectSettingsModal: boolean;
  fullscreenPreview: boolean;
  panelOrder: string[];
  draggingPanel: string | null;
  dropTarget: number | null;
  panelReplacePreview: string | null;
  panelInsertPreview: number | null;
  activeMobilePanel: MobilePanelType;
  mobileOverflowOpen: boolean;
  hasUnreadConsole: boolean;
  placedBlocks: any[];
  paletteOpen: boolean;

  togglePanel: (panel: string) => void;
  setPanelOrder: (order: string[]) => void;
  setActiveMobilePanel: (panel: MobilePanelType) => void;
  startDrag: (panel: string) => void;
  endDrag: () => void;
  setDropTarget: (target: number | null) => void;
  setFullscreenPreview: (v: boolean) => void;
  setShowProjectSettingsModal: (v: boolean) => void;
  setHasUnreadConsole: (v: boolean) => void;
  setPaletteOpen: (v: boolean) => void;
  setMobileOverflowOpen: (v: boolean) => void;
  setPanelReplacePreview: (panel: string | null) => void;
  setPanelInsertPreview: (idx: number | null) => void;
  initLayout: () => void;
  resetLayout: () => void;
}

function loadSavedPanels(): Record<string, boolean> | null {
  try {
    const stored = localStorage.getItem('osw-workspace-panels');
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

function loadPanelOrder(): string[] {
  try {
    const stored = localStorage.getItem('osw-workspace-panel-order');
    if (stored) {
      const parsed = JSON.parse(stored);
      const all = new Set(DEFAULT_PANEL_ORDER);
      const ordered = parsed.filter((k: string) => all.has(k));
      for (const k of DEFAULT_PANEL_ORDER) {
        if (!ordered.includes(k)) ordered.push(k);
      }
      return ordered;
    }
  } catch {}
  return [...DEFAULT_PANEL_ORDER];
}

function persistPanels(state: LayoutSlice) {
  try {
    localStorage.setItem('osw-workspace-panels', JSON.stringify({
      chat: state.showChat, files: state.showFiles, editor: state.showEditor,
      preview: state.showPreview, checkpoints: state.showCheckpoints,
      debug: state.showDebugPanel, skills: state.showSkillsPanel,
      console: state.showConsole, elements: state.showElements,
    }));
  } catch {}
}

function persistPanelOrder(order: string[]) {
  try {
    localStorage.setItem('osw-workspace-panel-order', JSON.stringify(order));
  } catch {}
}

export const PANEL_MAP: Record<string, keyof LayoutSlice> = {
  chat: 'showChat', files: 'showFiles', editor: 'showEditor', console: 'showConsole',
  preview: 'showPreview', elements: 'showElements', checkpoints: 'showCheckpoints',
  debug: 'showDebugPanel', skills: 'showSkillsPanel',
};

/**
 * Panels that cannot do their job unless a companion panel is also open.
 *
 * The Elements tree is serialized inside the preview iframe and posted to the host, so a layout
 * without the preview leaves the tree with nothing to query. Since the workspace shows at most
 * three panels and the preview is open by default, the eviction rule below would otherwise close
 * the preview to make room for Elements — opening the panel straight onto the empty state it
 * exists to avoid.
 */
const PANEL_COMPANION: Record<string, string> = { elements: 'preview' };

/**
 * The panel keys in `order` that are currently open, in order.
 *
 * PANEL_MAP is the single list of panels; deriving visibility from it keeps the workspace's
 * drag-reorder and panel-sizing paths in step with panel registration instead of repeating the
 * key→flag mapping as a hardcoded chain that a new panel can silently fall out of.
 */
export function visiblePanelKeys(state: LayoutSlice, order: string[] = state.panelOrder): string[] {
  return order.filter(k => {
    const flag = PANEL_MAP[k];
    return flag ? !!state[flag] : false;
  });
}

/**
 * Which open panel to close to make room for `opening`, walking from the right. Returns null when
 * there is nothing to evict. `opening`'s companion (see PANEL_COMPANION) is passed over unless it
 * is the only candidate left, in which case taking it beats refusing to open the panel at all.
 */
export function pickEvictionTarget(panels: { key: string; open: boolean }[], opening: string): string | null {
  const companion = PANEL_COMPANION[opening];
  for (let i = panels.length - 1; i >= 0; i--) {
    if (panels[i].open && panels[i].key !== opening && panels[i].key !== companion) return panels[i].key;
  }
  for (let i = panels.length - 1; i >= 0; i--) {
    if (panels[i].open && panels[i].key !== opening) return panels[i].key;
  }
  return null;
}

export const createLayoutSlice: StateCreator<LayoutSlice> = (set, get) => {
  const saved = loadSavedPanels();

  return {
    showChat: saved?.chat ?? true,
    showFiles: saved?.files ?? true,
    showEditor: saved?.editor ?? false,
    showPreview: saved?.preview ?? true,
    showCheckpoints: saved?.checkpoints ?? false,
    showConsole: saved?.console ?? false,
    showSkillsPanel: saved?.skills ?? false,
    showDebugPanel: saved?.debug ?? false,
    showElements: saved?.elements ?? false,
    showProjectSettingsModal: false,
    fullscreenPreview: false,
    panelOrder: loadPanelOrder(),
    draggingPanel: null,
    dropTarget: null,
    panelReplacePreview: null,
    panelInsertPreview: null,
    activeMobilePanel: 'preview',
    mobileOverflowOpen: false,
    hasUnreadConsole: false,
    placedBlocks: [],
    paletteOpen: false,

    togglePanel: (panel: string) => {
      const key = PANEL_MAP[panel];
      if (!key) return;
      const state = get();
      const isOpen = !!state[key];

      if (isOpen) {
        // Closing — always allowed
        const patch: Partial<LayoutSlice> = { [key]: false, panelReplacePreview: null, panelInsertPreview: null };
        set(patch as any);
        persistPanels({ ...state, ...patch } as LayoutSlice);
        return;
      }

      // Opening — check max 3 visible constraint
      const allPanels = state.panelOrder
        .filter(k => PANEL_MAP[k] !== undefined)
        .map(k => ({ key: k, open: !!state[PANEL_MAP[k] as keyof LayoutSlice] }));
      const visibleCount = allPanels.filter(p => p.open).length;

      const MAX_VISIBLE_PANELS = 3;
      let newOrder = state.panelOrder;
      const patch: Partial<LayoutSlice> = { [key]: true, panelReplacePreview: null, panelInsertPreview: null };

      if (visibleCount >= MAX_VISIBLE_PANELS) {
        // Close the rightmost evictable panel and insert new one at its position
        const closedKey = pickEvictionTarget(allPanels, panel);
        if (closedKey) {
          const closedPanelKey = PANEL_MAP[closedKey] as keyof LayoutSlice;
          (patch as any)[closedPanelKey] = false;
          // Move the new panel to the closed panel's position in order
          newOrder = newOrder.filter(k => k !== panel);
          const insertIdx = newOrder.indexOf(closedKey);
          if (insertIdx >= 0) {
            newOrder.splice(insertIdx, 0, panel);
          } else {
            newOrder.push(panel);
          }
        }
      } else {
        // Room available — open as the rightmost panel
        newOrder = newOrder.filter(k => k !== panel);
        newOrder.push(panel);
      }

      patch.panelOrder = newOrder;
      set(patch as any);
      persistPanels({ ...state, ...patch } as LayoutSlice);
      persistPanelOrder(newOrder);
    },

    setPanelOrder: (order: string[]) => {
      set({ panelOrder: order });
      persistPanelOrder(order);
    },

    setActiveMobilePanel: (panel) => set({ activeMobilePanel: panel, mobileOverflowOpen: false }),

    startDrag: (panel: string) => set({ draggingPanel: panel }),
    endDrag: () => set({ draggingPanel: null, dropTarget: null }),
    setDropTarget: (target) => set({ dropTarget: target }),
    setFullscreenPreview: (v) => set({ fullscreenPreview: v }),
    setShowProjectSettingsModal: (v) => set({ showProjectSettingsModal: v }),
    setHasUnreadConsole: (v) => set({ hasUnreadConsole: v }),
    setPaletteOpen: (v) => set({ paletteOpen: v }),
    setMobileOverflowOpen: (v) => set({ mobileOverflowOpen: v }),
    setPanelReplacePreview: (panel) => set({ panelReplacePreview: panel }),
    setPanelInsertPreview: (idx) => set({ panelInsertPreview: idx }),

    initLayout: () => {
      set({ panelOrder: loadPanelOrder() });
    },

    resetLayout: () => {
      set({
        draggingPanel: null,
        dropTarget: null,
        panelReplacePreview: null,
        panelInsertPreview: null,
        mobileOverflowOpen: false,
        showProjectSettingsModal: false,
        fullscreenPreview: false,
        paletteOpen: false,
      });
    },
  };
};
