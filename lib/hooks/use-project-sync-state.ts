'use client';

import { useEffect, useState } from 'react';
import {
  getProjectSyncState,
  subscribeProjectSyncState,
  type ProjectSyncState,
} from '@/lib/vfs/project-sync-state';

/**
 * Subscribe to the shared project sync state.
 *
 * Read-only: PageLayout owns refreshing it, and the sync-completed broadcast recomputes it after
 * that. Refreshing from here instead would be wrong as well as wasteful — child effects run before
 * parent effects, so a consumer that refreshed on mount would request the sync status before
 * PageLayout had scoped it to the workspace.
 */
export function useProjectSyncState(): ProjectSyncState {
  const [state, setState] = useState<ProjectSyncState>(getProjectSyncState);

  useEffect(() => subscribeProjectSyncState(setState), []);

  return state;
}
