/**
 * Shared project sync state
 *
 * Sync status used to be computed only inside the Server Sync dialog, so a project that had
 * drifted from the server looked completely normal everywhere else — the only way to find out was
 * to open the dialog and look. This computes it once for all projects and lets any component
 * subscribe, so the gallery and the sidebar can show it.
 *
 * Module state rather than React state on purpose: several unrelated subtrees need the same
 * answer, and re-deriving it per component would mean one /sync/status request each. Same shape as
 * lib/api/backend-status.ts.
 *
 * Server mode only. In browser mode there is no server to be out of sync with, and every read
 * returns the empty state without making a request.
 */

import { vfs } from './index';
import { fetchSyncStatus } from './auto-sync';
import { calculateItemSyncStatus, type ItemSyncStatus } from './sync-types';
import { SERVER_PROJECTS_CHANGED } from './sync-events';
import { logger } from '@/lib/utils';

export interface ProjectSyncState {
  /** Per project id. Absent means not computed yet — render nothing rather than guessing. */
  statuses: Map<string, ItemSyncStatus>;
  /** Projects the server is missing or behind on: what the user can act on. */
  pendingCount: number;
  loaded: boolean;
}

type Listener = (state: ProjectSyncState) => void;

const PENDING: ItemSyncStatus[] = ['local-only', 'local-newer', 'conflict'];

let state: ProjectSyncState = { statuses: new Map(), pendingCount: 0, loaded: false };
const listeners = new Set<Listener>();
let inFlight: Promise<void> | null = null;

function isServerMode(): boolean {
  return typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SERVER_MODE === 'true';
}

function notify(): void {
  listeners.forEach((listener) => listener(state));
}

export function getProjectSyncState(): ProjectSyncState {
  return state;
}

export function subscribeProjectSyncState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Recompute every project's status against the server.
 *
 * Concurrent calls share one request — the gallery, the sidebar and the post-sync broadcast all
 * tend to ask at once.
 */
export function refreshProjectSyncState(): Promise<void> {
  if (!isServerMode()) return Promise.resolve();
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const [status] = await Promise.all([fetchSyncStatus(), vfs.init()]);
      // A null status means the request failed, not that the server is empty. Treating it as empty
      // marked every project "Local only" — precisely when the backend is unreachable and the user
      // has no way to check. Keep the last known state instead.
      if (!status) {
        logger.debug('[ProjectSyncState] Server status unavailable, keeping last known state');
        return;
      }
      const serverUpdatedAt = new Map<string, string>(
        (status.projects ?? []).map((p: { id: string; updatedAt: string }) => [p.id, p.updatedAt])
      );

      const statuses = new Map<string, ItemSyncStatus>();
      let pendingCount = 0;
      for (const project of await vfs.listProjects()) {
        const itemStatus = calculateItemSyncStatus(
          project.updatedAt,
          serverUpdatedAt.get(project.id) ?? null,
          project.lastSyncedAt ?? null
        );
        statuses.set(project.id, itemStatus);
        if (PENDING.includes(itemStatus)) pendingCount++;
      }

      state = { statuses, pendingCount, loaded: true };
      notify();
    } catch (error) {
      // A failed status request is already surfaced by the backend-unreachable banner; leaving the
      // last known state in place beats flashing every project to "unknown".
      logger.warn('[ProjectSyncState] Failed to refresh sync state:', error);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

if (typeof window !== 'undefined') {
  window.addEventListener(SERVER_PROJECTS_CHANGED, () => {
    void refreshProjectSyncState();
  });
}
