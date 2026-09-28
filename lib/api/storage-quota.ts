// No `server-only` marker: this sits under the SQLite adapter, and neither it nor the modules it
// reaches declare one, so adding it here would break every test that loads the adapter.
import path from 'path';
import { getWorkspaceById } from '@/lib/auth/system-database';
import { combinedDirectorySize } from '@/lib/api/directory-size';
import { deploymentStaticDir } from '@/lib/compiler/deployment-static-dir';

/**
 * One place that measures a workspace's storage and one that admits a write against it.
 *
 * `max_storage_mb` used to be checked in a single route, `sync/{id}/sync/files`, which is where the
 * publish flow happened to send its files; 38 other workspace write routes, the agent shell and the
 * MCP connector all wrote unmetered. The gate lives with the write rather than with the caller for
 * that reason: `SQLiteAdapter` is what every one of them reaches, whether the caller is a sync route,
 * server-mode generation, `bash/execute` or a connector tool.
 *
 * Two further faults in the old check are fixed here. It compared usage *before* the write against
 * the limit, so a workspace at 99% could commit a push of any size; `admitWorkspaceWrite` measures
 * the incoming bytes against the remaining headroom instead. And it counted only the workspace
 * directory, while the figure shown in Server Sync counted the published output too, so the number
 * the person saw and the number enforced were different. Both now come from `measureWorkspaceBytes`.
 */

/** The prefix every storage refusal carries, so a test can assert it without pinning the wording. */
export const STORAGE_QUOTA_MESSAGE = 'Storage limit reached';

export class StorageQuotaError extends Error {
  constructor(limitMb: number) {
    super(`${STORAGE_QUOTA_MESSAGE} (${limitMb} MB). Free up space or contact your admin.`);
    this.name = 'StorageQuotaError';
  }
}

const CACHE_TTL_MS = 60_000;

/**
 * `measured` is the last walk of the directories; `admitted` is what has been let through since,
 * so a burst of writes inside one cache window still counts against the limit rather than all
 * being admitted against the same stale total.
 */
interface Entry { measured: number; admitted: number; ts: number }
const cache = new Map<string, Entry>();

function workspaceDir(workspaceId: string): string {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  return path.join(dataDir, 'workspaces', workspaceId);
}

function fresh(workspaceId: string, deploymentIds: string[]): Entry {
  let measured = 0;
  try {
    // Measured as one total so a blob a deployment links to the project is counted once, not once
    // per deployment serving it.
    measured = combinedDirectorySize([workspaceDir(workspaceId), ...deploymentIds.map(deploymentStaticDir)]);
  } catch {
    // An unreadable or absent directory measures as nothing, which is what a new workspace is.
  }
  const entry = { measured, admitted: 0, ts: Date.now() };
  cache.set(workspaceId, entry);
  return entry;
}

/**
 * The workspace's stored bytes, cached for a minute.
 *
 * @param deploymentIds Resolved only on a cache miss, so a caller on the write path does not query
 *   its deployments on every file.
 */
function measureWorkspaceBytes(workspaceId: string, deploymentIds: () => string[]): number {
  const cached = cache.get(workspaceId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.measured + cached.admitted;
  const entry = fresh(workspaceId, deploymentIds());
  return entry.measured;
}

/** Storage in MB for display, to one decimal place. */
export function workspaceStorageMb(workspaceId: string, deploymentIds: () => string[]): number {
  return Math.round(measureWorkspaceBytes(workspaceId, deploymentIds) / (1024 * 1024) * 10) / 10;
}

/**
 * Admits a write of `incomingBytes`, or throws `StorageQuotaError`.
 *
 * A workspace with no row carries no limit: the shared database used by the legacy `admin`,
 * `desktop` and `instance-api` ids has no workspace record, and neither does a desktop install.
 */
export function admitWorkspaceWrite(
  workspaceId: string,
  incomingBytes: number,
  deploymentIds: () => string[],
): void {
  const workspace = getWorkspaceById(workspaceId);
  if (!workspace?.max_storage_mb) return;

  const cached = cache.get(workspaceId);
  const entry = cached && Date.now() - cached.ts < CACHE_TTL_MS ? cached : fresh(workspaceId, deploymentIds());
  const limitBytes = workspace.max_storage_mb * 1024 * 1024;

  if (entry.measured + entry.admitted + incomingBytes > limitBytes) {
    throw new StorageQuotaError(workspace.max_storage_mb);
  }
  entry.admitted += incomingBytes;
}

/** Dropped when a workspace shrinks, so a delete is not waited out for a minute. */
export function forgetWorkspaceStorage(workspaceId: string): void {
  cache.delete(workspaceId);
}
