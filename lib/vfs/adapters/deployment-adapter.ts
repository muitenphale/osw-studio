/**
 * Deployment → adapter resolution
 *
 * Deployments live in the workspace database that owns them (data/workspaces/{id}/osws.sqlite),
 * but they are reached through routes that carry no workspace in the URL: the analytics dashboard,
 * the public tracking endpoints hit by published sites, edge-function invocation, and the
 * scheduler. Those routes used to read the default data/osws.sqlite unconditionally, so every
 * lookup missed and returned "Deployment not found".
 *
 * The system database's deployment_routing table maps deployment → workspace. Resolve through it,
 * and fall back to the default adapter when no route is registered so legacy single-user installs
 * keep working unchanged.
 *
 * This resolves *where* a deployment lives. It does not decide who may read it — authenticated
 * callers must go through requireDeploymentAccess (lib/api/deployment-access.ts).
 */

import 'server-only';

import { SQLiteAdapter } from './sqlite-adapter';
import { getSQLiteAdapter, getWorkspaceAdapter } from './server';
import {
  getDeploymentWorkspace,
  getDeploymentBySlug as getDeploymentRouteBySlug,
} from '@/lib/auth/system-database';
import { Deployment } from '../types';
import { logger } from '@/lib/utils';

export interface ResolvedDeployment {
  adapter: SQLiteAdapter;
  deployment: Deployment;
  /**
   * Owning workspace, or null when the deployment has no routing row at all — the legacy
   * single-user layout. A routed workspace is reported even if the record was ultimately found in
   * the default database, so authorization still runs against its owner rather than being skipped.
   */
  workspaceId: string | null;
}

// The public tracking endpoints run on every pageview of every published site, so the routing
// lookup is cached. TTL rather than permanent: a deployment can be re-registered or deleted.
// "Not routed" is cached far more briefly — publishing registers the route, and a long negative
// entry would keep a freshly published deployment unreachable well after it went live.
const ROUTE_TTL_MS = 60_000;
const MISSING_ROUTE_TTL_MS = 5_000;
// Both directions are self-correcting, so there is no explicit invalidation: a deleted deployment
// resolves through its cached workspace and simply isn't there, and a newly registered route is
// picked up within the short negative TTL.
//
// Bounded and swept, because the keys are deployment ids straight off the wire: the public
// tracking and edge-function endpoints accept any string and reach this before any id-format
// check, so an unbounded map is a memory-exhaustion vector rather than merely untidy. Same guard
// as lib/analytics/rate-limiter.ts.
const MAX_ROUTE_CACHE_KEYS = 10_000;
const ROUTE_CACHE_SWEEP_MS = 60_000;
const routeCache = new Map<string, { workspaceId: string | null; ts: number }>();
let lastRouteCacheSweep = Date.now();

function rememberRoute(deploymentId: string, workspaceId: string | null): void {
  const now = Date.now();

  if (now - lastRouteCacheSweep >= ROUTE_CACHE_SWEEP_MS) {
    lastRouteCacheSweep = now;
    for (const [key, entry] of routeCache) {
      const ttl = entry.workspaceId ? ROUTE_TTL_MS : MISSING_ROUTE_TTL_MS;
      if (now - entry.ts >= ttl) routeCache.delete(key);
    }
  }

  // Hard ceiling for a burst that outruns the sweep: evict oldest-inserted first.
  while (routeCache.size >= MAX_ROUTE_CACHE_KEYS) {
    const oldest = routeCache.keys().next().value;
    if (oldest === undefined) break;
    routeCache.delete(oldest);
  }

  routeCache.set(deploymentId, { workspaceId, ts: now });
}

function lookupWorkspaceId(deploymentId: string): string | null {
  const cached = routeCache.get(deploymentId);
  if (cached) {
    const ttl = cached.workspaceId ? ROUTE_TTL_MS : MISSING_ROUTE_TTL_MS;
    if (Date.now() - cached.ts < ttl) return cached.workspaceId;
  }

  let workspaceId: string | null = null;
  try {
    workspaceId = getDeploymentWorkspace(deploymentId) ?? null;
  } catch (error) {
    // No system database (browser-mode build, or a fresh instance) — fall back to the default DB.
    logger.warn('[DeploymentAdapter] Could not resolve deployment workspace:', error);
  }

  rememberRoute(deploymentId, workspaceId);
  return workspaceId;
}

/**
 * Adapters that could hold this deployment, most specific first: its routed workspace, then the
 * default database. Only ever two candidates — this never scans across tenants.
 */
function candidateAdapters(deploymentId: string): Array<{ adapter: SQLiteAdapter; workspaceId: string | null }> {
  const candidates: Array<{ adapter: SQLiteAdapter; workspaceId: string | null }> = [];
  const workspaceId = lookupWorkspaceId(deploymentId);

  if (workspaceId) {
    try {
      candidates.push({ adapter: getWorkspaceAdapter(workspaceId), workspaceId });
    } catch (error) {
      // Malformed workspace id in the routing table — fall through to the default database.
      logger.warn(`[DeploymentAdapter] Invalid workspace for deployment ${deploymentId}:`, error);
    }
  }

  const fallback = getSQLiteAdapter();
  if (!candidates.some((candidate) => candidate.adapter === fallback)) {
    candidates.push({ adapter: fallback, workspaceId });
  }
  return candidates;
}

/**
 * Find a deployment by id, returning it together with the adapter that owns it.
 * Returns null when no candidate database has it.
 */
export async function resolveDeployment(deploymentId: string): Promise<ResolvedDeployment | null> {
  for (const { adapter, workspaceId } of candidateAdapters(deploymentId)) {
    await adapter.init();
    const deployment = await adapter.getDeployment(deploymentId);
    if (deployment) return { adapter, deployment, workspaceId };
  }
  return null;
}

/**
 * Find a deployment by id or by subdomain slug. Used by edge-function invocation, which accepts
 * either form in its URL.
 */
export async function resolveDeploymentByIdOrSlug(idOrSlug: string): Promise<ResolvedDeployment | null> {
  const byId = await resolveDeployment(idOrSlug);
  if (byId) return byId;

  let workspaceId: string | undefined;
  try {
    workspaceId = getDeploymentRouteBySlug(idOrSlug)?.workspace_id;
  } catch (error) {
    logger.warn('[DeploymentAdapter] Could not resolve deployment slug:', error);
  }

  if (workspaceId) {
    try {
      const adapter = getWorkspaceAdapter(workspaceId);
      await adapter.init();
      const deployment = await adapter.getDeploymentBySlug?.(idOrSlug);
      if (deployment) return { adapter, deployment, workspaceId };
    } catch (error) {
      logger.warn(`[DeploymentAdapter] Invalid workspace for slug ${idOrSlug}:`, error);
    }
  }

  const fallback = getSQLiteAdapter();
  await fallback.init();
  const deployment = await fallback.getDeploymentBySlug?.(idOrSlug);
  return deployment ? { adapter: fallback, deployment, workspaceId: null } : null;
}
