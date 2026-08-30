import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Deployments created before routing rows were written at creation time have none.
 *
 * They live in their workspace's database, but resolveDeployment only ever tries the workspace
 * deployment_routing points at and then the default data/osws.sqlite — so an unrouted workspace
 * deployment is found in neither and every route addressed by deployment id alone (analytics,
 * edge functions, the scheduler, the owner's own review copy) behaves as if it does not exist.
 *
 * These tests build that exact state on disk with real databases, confirm the deployment is
 * unresolvable, and then confirm the boot-time backfill makes it resolvable.
 */

vi.mock('server-only', () => ({}));

const PROJECT = '11111111-1111-1111-1111-111111111111';
const DEPLOYMENT = 'ffffffff-1111-2222-3333-444444444444';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-backfill-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  vi.stubEnv('DEPLOYMENTS_DIR', path.join(dir, 'deployments'));
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Create a workspace holding one deployment, with no routing row for it. */
async function workspaceWithUnroutedDeployment(
  deploymentId = DEPLOYMENT,
  slug?: string
): Promise<string> {
  const { getSystemDatabase, createWorkspace } = await import('@/lib/auth/system-database');
  const sysDb = getSystemDatabase();
  sysDb.prepare(
    `INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('u1', 'u1@localhost', 'x')`
  ).run();
  const workspaceId = createWorkspace('W', 'u1');

  const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
  const adapter = getWorkspaceAdapter(workspaceId);
  await adapter.init();
  await adapter.createProject({
    id: PROJECT, name: 'P', createdAt: new Date(), updatedAt: new Date(), settings: {},
  } as never);
  await adapter.createDeployment!({
    id: deploymentId, projectId: PROJECT, name: 'D', slug, enabled: true,
    createdAt: new Date(), updatedAt: new Date(),
  } as never);

  return workspaceId;
}

/**
 * Resolve through a freshly loaded module registry.
 *
 * resolveDeployment caches the deployment→workspace lookup, misses included (briefly), in module
 * state. A test that resolves before and after the backfill would otherwise read back its own
 * cached miss. Reloading the modules drops that cache and nothing else — the databases are on
 * disk — which is the same approach the sibling test in lib/api/__tests__ takes.
 */
async function resolve(deploymentId: string) {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.resetModules();
  const { resolveDeployment } = await import('@/lib/vfs/adapters/deployment-adapter');
  return resolveDeployment(deploymentId);
}

async function routeFor(deploymentId: string) {
  const { getDeploymentRoute } = await import('@/lib/auth/system-database');
  return getDeploymentRoute(deploymentId);
}

async function backfill(workspaceId: string): Promise<number> {
  const { backfillDeploymentRoutes } = await import('@/lib/auth/default-workspace');
  return backfillDeploymentRoutes(workspaceId);
}

describe('backfillDeploymentRoutes', () => {
  it('makes an unrouted workspace deployment resolvable again', async () => {
    const workspaceId = await workspaceWithUnroutedDeployment();

    // The premise: without a routing row the deployment cannot be found at all.
    expect(await resolve(DEPLOYMENT)).toBeNull();

    expect(await backfill(workspaceId)).toBe(1);

    const resolved = await resolve(DEPLOYMENT);
    expect(resolved?.deployment.id).toBe(DEPLOYMENT);
    expect(resolved?.workspaceId).toBe(workspaceId);
  });

  it('assigns a slug so the deployment gets a subdomain route', async () => {
    const workspaceId = await workspaceWithUnroutedDeployment();
    await backfill(workspaceId);

    expect((await routeFor(DEPLOYMENT))?.slug).toBeTruthy();
  });

  it('keeps the deployment\'s own slug rather than inventing one', async () => {
    const workspaceId = await workspaceWithUnroutedDeployment(DEPLOYMENT, 'sunny-oak-river');
    await backfill(workspaceId);

    expect((await routeFor(DEPLOYMENT))?.slug).toBe('sunny-oak-river');
  });

  it('is idempotent — a second run creates nothing and rewrites nothing', async () => {
    const workspaceId = await workspaceWithUnroutedDeployment();
    expect(await backfill(workspaceId)).toBe(1);
    const first = await routeFor(DEPLOYMENT);

    expect(await backfill(workspaceId)).toBe(0);

    expect(await routeFor(DEPLOYMENT)).toEqual(first);
  });

  it('leaves an existing route untouched, including a slug and domain set at publish', async () => {
    const workspaceId = await workspaceWithUnroutedDeployment(DEPLOYMENT, 'from-deployment');
    const { registerDeploymentRoute } = await import('@/lib/auth/system-database');
    registerDeploymentRoute(DEPLOYMENT, workspaceId, 'published-slug', 'sweetcandies.com');

    expect(await backfill(workspaceId)).toBe(0);

    const route = await routeFor(DEPLOYMENT);
    expect(route?.slug).toBe('published-slug');
    expect(route?.custom_domain).toBe('sweetcandies.com');
  });

  it('skips a workspace whose database does not exist', async () => {
    const { getSystemDatabase, createWorkspace } = await import('@/lib/auth/system-database');
    getSystemDatabase().prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('u1', 'u1@localhost', 'x')`
    ).run();
    const workspaceId = createWorkspace('Empty', 'u1');

    expect(await backfill(workspaceId)).toBe(0);
  });

  it('skips a workspace database that has no deployments table', async () => {
    const { getSystemDatabase, createWorkspace } = await import('@/lib/auth/system-database');
    getSystemDatabase().prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('u1', 'u1@localhost', 'x')`
    ).run();
    const workspaceId = createWorkspace('Bare', 'u1');

    const workspaceDir = path.join(dir, 'data', 'workspaces', workspaceId);
    fs.mkdirSync(workspaceDir, { recursive: true });
    const Database = (await import('better-sqlite3')).default;
    const bare = new Database(path.join(workspaceDir, 'osws.sqlite'));
    bare.exec('CREATE TABLE unrelated (id TEXT)');
    bare.close();

    expect(await backfill(workspaceId)).toBe(0);
  });
});

describe('repairWorkspace', () => {
  it('still reports the deployment routes it created', async () => {
    const workspaceId = await workspaceWithUnroutedDeployment();

    const { repairWorkspace } = await import('@/lib/auth/default-workspace');
    const result = repairWorkspace(workspaceId);

    expect(result.deploymentRoutesCreated).toBe(1);
    expect(result.errors).toEqual([]);
    expect((await routeFor(DEPLOYMENT))?.workspace_id).toBe(workspaceId);
  });

  it('reports nothing to create on a second pass', async () => {
    const workspaceId = await workspaceWithUnroutedDeployment();
    const { repairWorkspace } = await import('@/lib/auth/default-workspace');

    repairWorkspace(workspaceId);
    expect(repairWorkspace(workspaceId).deploymentRoutesCreated).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The same deployment id in two workspaces
// ---------------------------------------------------------------------------

describe('a deployment id held by more than one workspace', () => {
  /**
   * Not hypothetical: migrateLegacyData copies the whole of a legacy data/osws.sqlite into each
   * workspace created on the box, so an upgraded instance with two workspaces holds the same
   * deployment ids twice. deployment_routing has room for one owner.
   *
   * The backfill visits workspaces in listWorkspaces order — created_at DESC — so claiming one
   * would hand the deployment to the newest workspace, and the older workspace that had been
   * publishing it would start getting 'Deployment is owned by another workspace' instead.
   */
  it('is left unrouted rather than assigned to whichever workspace is visited first', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const older = await workspaceWithUnroutedDeployment();
    const newer = await workspaceWithUnroutedDeployment();

    const { backfillDeploymentRoutes } = await import('@/lib/auth/default-workspace');
    const { getSystemDatabase } = await import('@/lib/auth/system-database');

    expect(backfillDeploymentRoutes(newer)).toBe(0);
    expect(backfillDeploymentRoutes(older)).toBe(0);

    const row = getSystemDatabase()
      .prepare('SELECT workspace_id FROM deployment_routing WHERE deployment_id = ?')
      .get(DEPLOYMENT);
    expect(row).toBeUndefined();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  /**
   * The ambiguity must not cost the unambiguous deployments in the same workspace their rows —
   * that would trade one broken case for a broader one.
   */
  it('still routes the deployments that only one workspace has', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const shared = await workspaceWithUnroutedDeployment();
    await workspaceWithUnroutedDeployment();

    const onlyHere = 'aaaaaaaa-5555-6666-7777-888888888888';
    const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    const adapter = getWorkspaceAdapter(shared);
    await adapter.init();
    await adapter.createDeployment!({
      id: onlyHere, projectId: PROJECT, name: 'D2', enabled: true,
      createdAt: new Date(), updatedAt: new Date(),
    } as never);

    const { backfillDeploymentRoutes } = await import('@/lib/auth/default-workspace');
    const { getSystemDatabase } = await import('@/lib/auth/system-database');

    expect(backfillDeploymentRoutes(shared)).toBe(1);

    const row = getSystemDatabase()
      .prepare('SELECT workspace_id FROM deployment_routing WHERE deployment_id = ?')
      .get(onlyHere) as { workspace_id: string } | undefined;
    expect(row?.workspace_id).toBe(shared);
  });
});
