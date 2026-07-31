import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The analytics endpoints take a deployment id and nothing else. Two things used to be wrong:
 * they read the default database so hosted deployments were never found, and they authenticated
 * the caller without ever checking that the caller had a claim to that deployment.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  verifyWorkspaceAccess: vi.fn(),
  getDeploymentWorkspace: vi.fn(),
  getDeploymentBySlug: vi.fn(),
  defaultAdapter: { init: vi.fn(), getDeployment: vi.fn(), getDeploymentBySlug: vi.fn() },
  getWorkspaceAdapter: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/auth/system-database', () => ({
  verifyWorkspaceAccess: mocks.verifyWorkspaceAccess,
  getDeploymentWorkspace: mocks.getDeploymentWorkspace,
  getDeploymentBySlug: mocks.getDeploymentBySlug,
}));
vi.mock('@/lib/vfs/adapters/server', () => ({
  getSQLiteAdapter: () => mocks.defaultAdapter,
  getWorkspaceAdapter: mocks.getWorkspaceAdapter,
}));
vi.mock('@/lib/vfs/adapters/sqlite-adapter', () => ({ SQLiteAdapter: class {} }));
vi.mock('@/lib/utils', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/**
 * The deployment→workspace lookup is cached in module state, so each case reloads the modules
 * rather than reaching for a test-only invalidation hook.
 */
async function load() {
  vi.resetModules();
  const [access, adapter] = await Promise.all([
    import('../deployment-access'),
    import('@/lib/vfs/adapters/deployment-adapter'),
  ]);
  return { requireDeploymentAccess: access.requireDeploymentAccess, resolveDeployment: adapter.resolveDeployment };
}

const DEPLOYMENT = { id: 'dep-1', name: 'Site' };
const WORKSPACE = '11111111-2222-3333-4444-555555555555';

function workspaceAdapterWith(deployment: unknown) {
  return { init: vi.fn(), getDeployment: vi.fn().mockResolvedValue(deployment), getDeploymentBySlug: vi.fn() };
}

describe('deployment resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.defaultAdapter.init.mockResolvedValue(undefined);
    mocks.defaultAdapter.getDeployment.mockResolvedValue(null);
    mocks.getSession.mockResolvedValue({ userId: 'user-1' });
  });

  it('finds a deployment in the workspace database it is routed to', async () => {
    const { resolveDeployment } = await load();
    const wsAdapter = workspaceAdapterWith(DEPLOYMENT);
    mocks.getDeploymentWorkspace.mockReturnValue(WORKSPACE);
    mocks.getWorkspaceAdapter.mockReturnValue(wsAdapter);

    const resolved = await resolveDeployment('dep-1');

    expect(resolved?.deployment).toEqual(DEPLOYMENT);
    expect(resolved?.workspaceId).toBe(WORKSPACE);
    expect(mocks.getWorkspaceAdapter).toHaveBeenCalledWith(WORKSPACE);
  });

  it('falls back to the default database when no route is registered', async () => {
    const { resolveDeployment } = await load();
    mocks.getDeploymentWorkspace.mockReturnValue(undefined);
    mocks.defaultAdapter.getDeployment.mockResolvedValue(DEPLOYMENT);

    const resolved = await resolveDeployment('dep-1');

    expect(resolved?.deployment).toEqual(DEPLOYMENT);
    expect(resolved?.workspaceId).toBeNull();
    expect(mocks.getWorkspaceAdapter).not.toHaveBeenCalled();
  });

  it('returns null when no candidate database has it', async () => {
    const { resolveDeployment } = await load();
    mocks.getDeploymentWorkspace.mockReturnValue(undefined);

    expect(await resolveDeployment('dep-1')).toBeNull();
  });
});

describe('requireDeploymentAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.defaultAdapter.init.mockResolvedValue(undefined);
    mocks.defaultAdapter.getDeployment.mockResolvedValue(null);
    mocks.getDeploymentWorkspace.mockReturnValue(WORKSPACE);
    mocks.getWorkspaceAdapter.mockReturnValue(workspaceAdapterWith(DEPLOYMENT));
  });

  it('401s an unauthenticated caller', async () => {
    const { requireDeploymentAccess } = await load();
    mocks.getSession.mockResolvedValue(null);

    const result = await requireDeploymentAccess('dep-1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('allows a member of the owning workspace', async () => {
    const { requireDeploymentAccess } = await load();
    mocks.getSession.mockResolvedValue({ userId: 'user-1' });

    const result = await requireDeploymentAccess('dep-1', 'viewer');

    expect(result.ok).toBe(true);
    expect(mocks.verifyWorkspaceAccess).toHaveBeenCalledWith('user-1', WORKSPACE, 'viewer');
  });

  it('hides another tenant’s deployment behind a 404 rather than a 403', async () => {
    const { requireDeploymentAccess } = await load();
    mocks.getSession.mockResolvedValue({ userId: 'outsider' });
    mocks.verifyWorkspaceAccess.mockImplementation(() => {
      throw new Error('Workspace access denied');
    });

    const result = await requireDeploymentAccess('dep-1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });

  it('enforces the requested role for mutating calls', async () => {
    const { requireDeploymentAccess } = await load();
    mocks.getSession.mockResolvedValue({ userId: 'viewer-only' });
    mocks.verifyWorkspaceAccess.mockImplementation((_u: string, _w: string, role: string) => {
      if (role === 'editor') throw new Error('Insufficient workspace permissions');
    });

    expect((await requireDeploymentAccess('dep-1', 'viewer')).ok).toBe(true);
    expect((await requireDeploymentAccess('dep-1', 'editor')).ok).toBe(false);
  });

  it('404s a deployment that does not exist', async () => {
    const { requireDeploymentAccess } = await load();
    mocks.getSession.mockResolvedValue({ userId: 'user-1' });
    mocks.getDeploymentWorkspace.mockReturnValue(undefined);

    const result = await requireDeploymentAccess('dep-1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
    expect(mocks.verifyWorkspaceAccess).not.toHaveBeenCalled();
  });
});

describe('resolveDeploymentByIdOrSlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.defaultAdapter.init.mockResolvedValue(undefined);
    mocks.defaultAdapter.getDeployment.mockResolvedValue(null);
    mocks.defaultAdapter.getDeploymentBySlug.mockResolvedValue(null);
  });

  async function load() {
    vi.resetModules();
    const mod = await import('@/lib/vfs/adapters/deployment-adapter');
    return mod.resolveDeploymentByIdOrSlug;
  }

  it('resolves by id without consulting the slug index', async () => {
    const resolveByIdOrSlug = await load();
    mocks.getDeploymentWorkspace.mockReturnValue(WORKSPACE);
    mocks.getWorkspaceAdapter.mockReturnValue(workspaceAdapterWith(DEPLOYMENT));

    const resolved = await resolveByIdOrSlug('dep-1');

    expect(resolved?.deployment).toEqual(DEPLOYMENT);
    expect(mocks.getDeploymentBySlug).not.toHaveBeenCalled();
  });

  // Published sites invoke edge functions by subdomain slug, not id.
  it('falls back to the slug index and reads the owning workspace database', async () => {
    const resolveByIdOrSlug = await load();
    const wsAdapter = {
      init: vi.fn(),
      getDeployment: vi.fn().mockResolvedValue(null),
      getDeploymentBySlug: vi.fn().mockResolvedValue(DEPLOYMENT),
    };
    mocks.getDeploymentWorkspace.mockReturnValue(undefined);
    mocks.getDeploymentBySlug.mockReturnValue({ deployment_id: 'dep-1', workspace_id: WORKSPACE });
    mocks.getWorkspaceAdapter.mockReturnValue(wsAdapter);

    const resolved = await resolveByIdOrSlug('my-site');

    expect(resolved?.deployment).toEqual(DEPLOYMENT);
    expect(resolved?.workspaceId).toBe(WORKSPACE);
    expect(wsAdapter.getDeploymentBySlug).toHaveBeenCalledWith('my-site');
  });

  it('falls back to the default database for an unrouted slug', async () => {
    const resolveByIdOrSlug = await load();
    mocks.getDeploymentWorkspace.mockReturnValue(undefined);
    mocks.getDeploymentBySlug.mockReturnValue(undefined);
    mocks.defaultAdapter.getDeploymentBySlug.mockResolvedValue(DEPLOYMENT);

    const resolved = await resolveByIdOrSlug('legacy-site');

    expect(resolved?.deployment).toEqual(DEPLOYMENT);
    expect(resolved?.workspaceId).toBeNull();
  });

  it('returns null when neither id nor slug matches anywhere', async () => {
    const resolveByIdOrSlug = await load();
    mocks.getDeploymentWorkspace.mockReturnValue(undefined);
    mocks.getDeploymentBySlug.mockReturnValue(undefined);

    expect(await resolveByIdOrSlug('nope')).toBeNull();
  });
});
