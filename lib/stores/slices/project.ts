import { StateCreator } from 'zustand';
import type { ProjectRuntime } from '@/lib/vfs/types';
import type { FocusContextPayload } from '@/lib/preview/types';

type FocusTarget = FocusContextPayload & { timestamp: number };

export interface ProjectSlice {
  projectId: string;
  projectName: string;
  isDirty: boolean;
  saveInProgress: boolean;
  lastSavedAt: Date | null;
  entryPoint: string | undefined;
  projectRuntime: ProjectRuntime | undefined;
  focusContext: FocusTarget | null;
  chatMode: boolean;
  backendEnabled: boolean;
  selectedDeploymentId: string | null;
  initialCheckpointId: string | null;
  checkpointRefreshKey: number;
  refreshTrigger: number;
  runtimeErrors: string[];
  workspaceReady: boolean;

  initProject: (project: { id: string; name: string; settings?: any; lastSavedAt?: Date | null }) => void;
  markDirty: () => void;
  markClean: () => void;
  bumpRefreshTrigger: () => void;
  incrementCheckpointRefresh: () => void;
  updateProjectSettings: (settings: { runtime?: ProjectRuntime; previewEntryPoint?: string }) => void;
  setChatMode: (mode: boolean) => void;
  setBackendEnabled: (enabled: boolean) => void;
  setDeployment: (id: string | null) => void;
  setFocusContext: (ctx: FocusTarget | null) => void;
  setRuntimeErrors: (errors: string[]) => void;
  resetProject: () => void;
}

type CombinedState = ProjectSlice & { generating: boolean; isProjectGenerating: (id: string) => boolean; resetOrchestrator: () => void };

export const createProjectSlice: StateCreator<CombinedState, [], [], ProjectSlice> = (set, get) => ({
  projectId: '',
  projectName: '',
  isDirty: false,
  saveInProgress: false,
  lastSavedAt: null,
  entryPoint: undefined,
  projectRuntime: undefined,
  focusContext: null,
  chatMode: false,
  backendEnabled: false,
  selectedDeploymentId: null,
  initialCheckpointId: null,
  checkpointRefreshKey: 0,
  refreshTrigger: 0,
  runtimeErrors: [],
  workspaceReady: false,

  initProject: (project) => {
    set({
      projectId: project.id,
      projectName: project.name,
      entryPoint: project.settings?.previewEntryPoint,
      projectRuntime: project.settings?.runtime,
      lastSavedAt: project.lastSavedAt ?? null,
      isDirty: false,
    });
  },

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),

  bumpRefreshTrigger: () => set(s => ({ refreshTrigger: s.refreshTrigger + 1 })),
  incrementCheckpointRefresh: () => set(s => ({ checkpointRefreshKey: s.checkpointRefreshKey + 1 })),

  updateProjectSettings: (settings) => {
    set(s => ({
      projectRuntime: settings.runtime ?? s.projectRuntime,
      entryPoint: settings.previewEntryPoint ?? s.entryPoint,
      refreshTrigger: s.refreshTrigger + 1,
    }));
  },

  setChatMode: (mode: boolean) => {
    set({ chatMode: mode });
    if (typeof window !== 'undefined') {
      localStorage.setItem('osw-studio-chat-mode', String(mode));
    }
    if (!get().generating) {
      get().resetOrchestrator();
    }
  },

  setBackendEnabled: (enabled: boolean) => {
    set({ backendEnabled: enabled });
    const pid = get().projectId;
    if (pid && typeof window !== 'undefined') {
      localStorage.setItem(`osw-backend-${pid}`, String(enabled));
    }
  },

  setDeployment: (id: string | null) => set({ selectedDeploymentId: id }),
  setFocusContext: (ctx) => set({ focusContext: ctx }),
  setRuntimeErrors: (errors) => set({ runtimeErrors: errors }),

  resetProject: () => {
    if (get().generating) return;
    set({
      projectId: '',
      projectName: '',
      isDirty: false,
      saveInProgress: false,
      lastSavedAt: null,
      entryPoint: undefined,
      projectRuntime: undefined,
      focusContext: null,
      backendEnabled: false,
      selectedDeploymentId: null,
      initialCheckpointId: null,
      checkpointRefreshKey: 0,
      refreshTrigger: 0,
      runtimeErrors: [],
      workspaceReady: false,
    });
  },
});
