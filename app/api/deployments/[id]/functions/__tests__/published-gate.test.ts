import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * An unpublished deployment must not answer on its function endpoint.
 *
 * Unpublishing removes the built pages, but the deployment id stays addressable and the runtime
 * database is kept on purpose, so this endpoint was still running code and reading that database
 * for anyone holding the URL. The pages 404 while the API behind them did not, which made
 * "off traffic" only half true.
 */

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@/lib/vfs/adapters/deployment-adapter', () => ({
  resolveDeploymentByIdOrSlug: mocks.resolve,
}));
vi.mock('@/lib/edge-functions/executor', () => ({ executeFunction: mocks.execute }));
vi.mock('@/lib/utils', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../[...path]/route';

const FN = { id: 'fn1', name: 'counter', enabled: true, method: 'ANY', code: 'return null;', timeoutMs: 5000 };

function resolved(deployment: Record<string, unknown>) {
  return {
    workspaceId: 'w1',
    deployment: { id: 'd1', databaseEnabled: true, ...deployment },
    adapter: {
      getDeploymentDatabaseForAnalytics: () => ({
        getFunctionByName: () => FN,
        logFunctionExecution: vi.fn(),
        getSecrets: () => [],
        listSecrets: () => [],
      }),
    },
  };
}

const params = Promise.resolve({ id: 'd1', path: ['counter'] });
const call = () => GET(new NextRequest('http://localhost/api/deployments/d1/functions/counter'), { params });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue({
    response: { status: 200, headers: {}, body: { ok: true } },
    logs: [],
    durationMs: 1,
  });
});

describe('edge function invocation and published state', () => {
  it('refuses an unpublished deployment without running anything', async () => {
    mocks.resolve.mockResolvedValue(resolved({ publishedAt: undefined }));

    const response = await call();

    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatch(/not published/i);
    // The point is that no user code ran and the database was not touched.
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('runs for a published deployment', async () => {
    mocks.resolve.mockResolvedValue(resolved({ publishedAt: new Date('2026-09-22') }));

    const response = await call();

    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalled();
  });

  it('still refuses when published but the database was never provisioned', async () => {
    mocks.resolve.mockResolvedValue(resolved({ publishedAt: new Date('2026-09-22'), databaseEnabled: false }));

    const response = await call();

    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatch(/not enabled/i);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
