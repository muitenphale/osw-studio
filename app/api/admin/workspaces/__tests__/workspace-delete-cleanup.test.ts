import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

/**
 * Deleting a workspace has to take its published sites with it.
 *
 * The workspace directory holds the databases, but a published deployment's files live under the
 * static output directory, which is served. Removing only the former left those sites answering
 * requests after the workspace they belonged to was gone, so the content outlived the account.
 */

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  verifyInstanceApiKey: vi.fn(),
  getWorkspaceById: vi.fn(),
  deleteWorkspace: vi.fn(),
  removeDeploymentRoute: vi.fn(),
  getSystemDatabase: vi.fn(),
  getWorkspaceProjectCount: vi.fn(),
  regenerateInstanceCaddy: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({
  requireAuth: mocks.requireAuth,
  verifyInstanceApiKey: mocks.verifyInstanceApiKey,
}));
vi.mock('@/lib/auth/system-database', () => ({
  getWorkspaceById: mocks.getWorkspaceById,
  updateWorkspace: vi.fn(),
  deleteWorkspace: mocks.deleteWorkspace,
  getSystemDatabase: mocks.getSystemDatabase,
  getWorkspaceProjectCount: mocks.getWorkspaceProjectCount,
  removeDeploymentRoute: mocks.removeDeploymentRoute,
}));
vi.mock('@/lib/caddy/regenerate', () => ({ regenerateInstanceCaddy: mocks.regenerateInstanceCaddy }));

const WS = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const DEPLOYMENT = 'ffffffff-1111-2222-3333-444444444444';
const PROJECT = '11111111-1111-1111-1111-111111111111';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-wsdel-'));
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  vi.stubEnv('DEPLOYMENTS_DIR', path.join(dir, 'deployments'));
  vi.stubEnv('DEPLOYMENTS_STATIC_DIR', path.join(dir, 'public', 'deployments'));
  fs.mkdirSync(path.join(dir, 'deployments'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'data', 'workspaces', WS), { recursive: true });

  mocks.requireAuth.mockResolvedValue({ userId: 'u1', isAdmin: true });
  mocks.verifyInstanceApiKey.mockReturnValue(null);
  mocks.getWorkspaceById.mockReturnValue({ id: WS, name: 'W' });
  mocks.regenerateInstanceCaddy.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('deleting a workspace', () => {
  it('removes the published output of its deployments, not just its databases', async () => {
    const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    const adapter = getWorkspaceAdapter(WS);
    await adapter.init();
    await adapter.createProject({
      id: PROJECT, name: 'P', createdAt: new Date(), updatedAt: new Date(), settings: {},
    } as never);
    await adapter.createDeployment!({
      id: DEPLOYMENT, projectId: PROJECT, name: 'D', enabled: true,
      createdAt: new Date(), updatedAt: new Date(),
    } as never);

    // What a publish leaves behind: a served directory of static files.
    const served = path.join(dir, 'public', 'deployments', DEPLOYMENT);
    fs.mkdirSync(served, { recursive: true });
    fs.writeFileSync(path.join(served, 'index.html'), '<html>live</html>');

    const { DELETE } = await import('../[id]/route');
    const response = await DELETE(
      new NextRequest(`http://localhost/api/admin/workspaces/${WS}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: WS }) }
    );

    expect(response.status).toBe(200);
    expect(fs.existsSync(served)).toBe(false);
    expect(fs.existsSync(path.join(dir, 'data', 'workspaces', WS))).toBe(false);
    // The route table is what maps a hostname to the deployment; a stale row would outlive it.
    expect(mocks.removeDeploymentRoute).toHaveBeenCalledWith(DEPLOYMENT);
    expect(mocks.deleteWorkspace).toHaveBeenCalledWith(WS);
  });

  it('cleans the rest when one deployment fails', async () => {
    const OTHER = 'ffffffff-5555-6666-7777-888888888888';

    const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    const adapter = getWorkspaceAdapter(WS);
    await adapter.init();
    await adapter.createProject({
      id: PROJECT, name: 'P', createdAt: new Date(), updatedAt: new Date(), settings: {},
    } as never);

    const servedDirs: string[] = [];
    for (const deploymentId of [DEPLOYMENT, OTHER]) {
      await adapter.createDeployment!({
        id: deploymentId, projectId: PROJECT, name: 'D', enabled: true,
        createdAt: new Date(), updatedAt: new Date(),
      } as never);
      const served = path.join(dir, 'public', 'deployments', deploymentId);
      fs.mkdirSync(served, { recursive: true });
      fs.writeFileSync(path.join(served, 'index.html'), '<html>live</html>');
      servedDirs.push(served);
    }

    // One deployment's route removal fails. Sharing a single try meant every deployment after it
    // kept its files on disk and kept being served.
    let call = 0;
    mocks.removeDeploymentRoute.mockImplementation(() => {
      if (++call === 1) throw new Error('routing table locked');
    });

    const { DELETE } = await import('../[id]/route');
    const response = await DELETE(
      new NextRequest(`http://localhost/api/admin/workspaces/${WS}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: WS }) }
    );

    expect(response.status).toBe(200);
    for (const served of servedDirs) expect(fs.existsSync(served)).toBe(false);
    expect(mocks.removeDeploymentRoute).toHaveBeenCalledTimes(2);
  });

  it('deletes the workspace even when it has no deployments', async () => {
    const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    const adapter = getWorkspaceAdapter(WS);
    await adapter.init();

    const { DELETE } = await import('../[id]/route');
    const response = await DELETE(
      new NextRequest(`http://localhost/api/admin/workspaces/${WS}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: WS }) }
    );

    expect(response.status).toBe(200);
    expect(fs.existsSync(path.join(dir, 'data', 'workspaces', WS))).toBe(false);
    expect(mocks.removeDeploymentRoute).not.toHaveBeenCalled();
  });
});
