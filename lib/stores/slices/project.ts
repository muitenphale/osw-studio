import { StateCreator } from 'zustand';
import type { ProjectRuntime, PromptSuggestion } from '@/lib/vfs/types';
import type { FocusContextPayload } from '@/lib/preview/types';
import { track } from '@/lib/telemetry';

type FocusTarget = FocusContextPayload & { timestamp: number };

export type WorkspaceMode = 'code' | 'chat' | 'interview';

export interface ActiveInterview {
  templateId: string;
  title: string;
}

export interface ProjectSlice {
  projectId: string;
  projectName: string;
  isDirty: boolean;
  saveInProgress: boolean;
  lastSavedAt: Date | null;
  entryPoint: string | undefined;
  projectRuntime: ProjectRuntime | undefined;
  /** The project's own chat starters, seeded by its template and editable in Settings. */
  promptSuggestions: PromptSuggestion[];
  modelConfigVersion: number;
  focusContext: FocusTarget | null;
  /**
   * Sibling of focusContext, not nested in it: recompiles rebuild focusContext wholesale,
   * which would drop a flag carried inside the payload.
   */
  focusIncluded: boolean;
  mode: WorkspaceMode;
  activeInterview: ActiveInterview | null;
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
  bumpModelConfig: () => void;
  incrementCheckpointRefresh: () => void;
  updateProjectSettings: (settings: { runtime?: ProjectRuntime; previewEntryPoint?: string; promptSuggestions?: PromptSuggestion[] }) => void;
  setMode: (mode: WorkspaceMode) => void;
  setActiveInterview: (interview: ActiveInterview | null) => void;
  setBackendEnabled: (enabled: boolean) => void;
  setDeployment: (id: string | null) => void;
  setFocusContext: (ctx: FocusTarget | null) => void;
  setFocusIncluded: (included: boolean) => void;
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
  promptSuggestions: [],
  modelConfigVersion: 0,
  focusContext: null,
  focusIncluded: false,
  mode: 'code',
  activeInterview: null,
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
      promptSuggestions: project.settings?.promptSuggestions ?? [],
      lastSavedAt: project.lastSavedAt ?? null,
      isDirty: false,
    });
  },

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),

  bumpRefreshTrigger: () => set(s => ({ refreshTrigger: s.refreshTrigger + 1 })),
  bumpModelConfig: () => set(s => ({ modelConfigVersion: s.modelConfigVersion + 1 })),
  incrementCheckpointRefresh: () => set(s => ({ checkpointRefreshKey: s.checkpointRefreshKey + 1 })),

  updateProjectSettings: (settings) => {
    set(s => ({
      projectRuntime: settings.runtime ?? s.projectRuntime,
      entryPoint: settings.previewEntryPoint ?? s.entryPoint,
      // ?? rather than ||: emptying the list is a deliberate edit, and [] must not read as absent.
      promptSuggestions: settings.promptSuggestions ?? s.promptSuggestions,
      refreshTrigger: s.refreshTrigger + 1,
    }));
  },

  setMode: (mode: WorkspaceMode) => {
    const prevMode = get().mode;
    set({ mode });
    if (prevMode !== mode) {
      track('mode_switch', { from: prevMode, to: mode });
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('osw-studio-mode', mode);
    }
    if (!get().generating) {
      get().resetOrchestrator();
    }
  },

  setActiveInterview: (interview: ActiveInterview | null) => {
    set({ activeInterview: interview });
    const pid = get().projectId;
    if (pid && typeof window !== 'undefined') {
      const key = `osw-interview-${pid}`;
      if (interview) {
        localStorage.setItem(key, JSON.stringify(interview));
      } else {
        localStorage.removeItem(key);
      }
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
  setFocusIncluded: (included) => set({ focusIncluded: included }),
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
      promptSuggestions: [],
      focusContext: null,
      focusIncluded: false,
      activeInterview: null,
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
