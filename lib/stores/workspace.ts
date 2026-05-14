import { create } from 'zustand';
import { createOrchestratorSlice, OrchestratorSlice } from './slices/orchestrator';
import { createProjectSlice, ProjectSlice } from './slices/project';
import { createLayoutSlice, LayoutSlice } from './slices/layout';

type WorkspaceState = OrchestratorSlice & ProjectSlice & LayoutSlice;

export const useWorkspaceStore = create<WorkspaceState>()((...a) => ({
  ...createOrchestratorSlice(...a),
  ...createProjectSlice(...a),
  ...createLayoutSlice(...a),
}));
