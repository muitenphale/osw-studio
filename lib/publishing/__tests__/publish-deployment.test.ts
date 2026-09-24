import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Publishing, as the route and the MCP tool both now run it.
 *
 * Two orderings here are load-bearing, and each encodes a bug that shipped once:
 *
 * - The slug is written before the build, because the builder reads it to choose asset path style.
 * - The cross-workspace guard refuses before the build, because registering the route afterwards
 *   left the site written and the record marked published while the caller was told it failed.
 *
 * The call order is recorded and asserted, since a refactor that keeps every step but reorders two
 * of them would otherwise pass.
 */

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  order: [] as string[],
  buildResult: { success: true, deploymentId: 'd1', projectId: 'p1', filesWritten: 4, outputPath: '/deployments/d1' } as {
    success: boolean; deploymentId: string; projectId: string; filesWritten: number; outputPath: string; error?: string;
  },
  route: undefined as { workspace_id: string; slug: string } | undefined,
  workspace: { max_deployments: 10 } as { max_deployments: number } | undefined,
  registered: undefined as { deploymentId: string; workspaceId: string; slug: string } | undefined,
  cleanResult: true,
}));

vi.mock('@/lib/compiler/static-builder', () => ({
  buildStaticDeployment: vi.fn(async () => { h.order.push('build'); return h.buildResult; }),
  cleanStaticDeployment: vi.fn(async () => { h.order.push('clean'); return h.cleanResult; }),
}));
vi.mock('@/lib/publishing/slug-generator', () => ({ generateUniqueSlug: () => 'fresh-slug' }));
vi.mock('@/lib/caddy/regenerate', () => ({ regenerateInstanceCaddy: async () => { h.order.push('caddy'); } }));
vi.mock('@/lib/auth/system-database', () => ({
  getWorkspaceById: () => h.workspace,
  getDeploymentWorkspace: () => undefined,
  getDeploymentBySlug: () => undefined,
  getDeploymentRoute: () => h.route,
  registerDeploymentRoute: (deploymentId: string, workspaceId: string, slug: string) => {
    h.order.push('register');
    h.registered = { deploymentId, workspaceId, slug };
  },
}));

import { publishDeployment, unpublishDeployment } from '@/lib/publishing/publish-deployment';

function adapterWith(deployment: Record<string, unknown> | null) {
  const state = deployment ? { ...deployment } : null;
  return {
    listDeployments: async () => (state ? [state] : []),
    getDeployment: async () => (state ? { ...state } : null),
    updateDeployment: async (d: Record<string, unknown>) => {
      h.order.push(`update:${String(d.slug)}`);
      Object.assign(state as object, d);
    },
    enableDeploymentDatabase: async () => { h.order.push('enable-db'); },
    state: () => state,
  };
}

beforeEach(() => {
  h.order = [];
  h.route = undefined;
  h.workspace = { max_deployments: 10 };
  h.registered = undefined;
  h.buildResult = { success: true, deploymentId: 'd1', projectId: 'p1', filesWritten: 4, outputPath: '/deployments/d1' };
  h.cleanResult = true;
});

describe('publishDeployment', () => {
  it('writes the slug before building, so the builder emits the right asset paths', async () => {
    const adapter = adapterWith({ id: 'd1', slug: undefined, settingsVersion: 3, databaseEnabled: false });

    const outcome = await publishDeployment(adapter as never, 'w1', 'd1');

    expect(outcome.ok).toBe(true);
    expect(h.order.indexOf('update:fresh-slug')).toBeLessThan(h.order.indexOf('build'));
  });

  it('keeps the slug a deployment is already routed at', async () => {
    h.route = { workspace_id: 'w1', slug: 'existing-slug' };
    const adapter = adapterWith({ id: 'd1', slug: 'existing-slug', settingsVersion: 1, databaseEnabled: true });

    const outcome = await publishDeployment(adapter as never, 'w1', 'd1');

    expect(outcome.ok && outcome.slug).toBe('existing-slug');
    expect(h.registered?.slug).toBe('existing-slug');
  });

  it('refuses a deployment another workspace owns without building anything', async () => {
    h.route = { workspace_id: 'other-workspace', slug: 's' };
    const adapter = adapterWith({ id: 'd1', settingsVersion: 1, databaseEnabled: true });

    const outcome = await publishDeployment(adapter as never, 'w1', 'd1');

    expect(outcome).toMatchObject({ ok: false, status: 409 });
    expect(h.order).toEqual([]);
    // Nothing was written and nothing was registered, so the record is not left marked published.
    expect((adapter.state() as { publishedAt?: Date }).publishedAt).toBeUndefined();
  });

  it('refuses when the workspace is at its deployment quota, before building', async () => {
    h.workspace = { max_deployments: 1 };
    const adapter = adapterWith({ id: 'd1', settingsVersion: 1, databaseEnabled: true });

    const outcome = await publishDeployment(adapter as never, 'w1', 'd1');

    expect(outcome).toMatchObject({ ok: false, status: 403 });
    expect(h.order).toEqual([]);
  });

  it('reports a build failure and does not register a route for it', async () => {
    h.buildResult = { success: false, deploymentId: 'd1', projectId: 'p1', filesWritten: 0, outputPath: '', error: 'compile failed' };
    const adapter = adapterWith({ id: 'd1', slug: 'x', settingsVersion: 1, databaseEnabled: true });

    const outcome = await publishDeployment(adapter as never, 'w1', 'd1');

    expect(outcome).toMatchObject({ ok: false, status: 500, error: 'compile failed' });
    expect(h.order).not.toContain('register');
  });

  it('stamps the published version and turns on the analytics database on first publish', async () => {
    const adapter = adapterWith({ id: 'd1', slug: 'x', settingsVersion: 7, databaseEnabled: false });

    const outcome = await publishDeployment(adapter as never, 'w1', 'd1');

    expect(outcome.ok && outcome.lastPublishedVersion).toBe(7);
    const state = adapter.state() as { lastPublishedVersion?: number; publishedAt?: Date; databaseEnabled?: boolean };
    expect(state.lastPublishedVersion).toBe(7);
    expect(state.publishedAt).toBeInstanceOf(Date);
    expect(h.order).toContain('enable-db');
  });
});

/**
 * Unpublishing, which is what taking a site off traffic means now that `enabled` is gone.
 *
 * The flag it replaced was never enforced: every serving path resolves the deployment's output
 * directory on disk, so a site came down only when those files went. These assert the two halves
 * that matter, that the files are removed and that nothing else is, since the whole point of
 * unpublish over delete is that publishing again restores the same site at the same URL.
 */
describe('unpublishDeployment', () => {
  it('removes the served files and forgets that it was published', async () => {
    const adapter = adapterWith({
      id: 'd1', slug: 'kept-slug', settingsVersion: 3, lastPublishedVersion: 3,
      publishedAt: new Date('2026-01-01'), databaseEnabled: true,
    });

    const outcome = await unpublishDeployment(adapter as never, 'd1');

    expect(outcome).toMatchObject({ ok: true, deploymentId: 'd1' });
    expect(h.order).toContain('clean');
    expect(adapter.state()).toMatchObject({ publishedAt: undefined, lastPublishedVersion: undefined });
  });

  it('keeps the row, its settings and its slug, so republishing returns the same URL', async () => {
    const adapter = adapterWith({
      id: 'd1', slug: 'kept-slug', settingsVersion: 3, lastPublishedVersion: 3,
      publishedAt: new Date('2026-01-01'), databaseEnabled: true, customDomain: 'example.test',
    });

    await unpublishDeployment(adapter as never, 'd1');

    expect(adapter.state()).toMatchObject({
      id: 'd1', slug: 'kept-slug', settingsVersion: 3,
      databaseEnabled: true, customDomain: 'example.test',
    });
    // The route is left registered: dropping it would free the slug for another deployment and
    // send the subdomain to the wildcard block, which answers with the studio instead of a 404.
    expect(h.order).not.toContain('register');
  });

  it('refuses a deployment that is not in this workspace', async () => {
    const outcome = await unpublishDeployment(adapterWith(null) as never, 'gone');

    expect(outcome).toMatchObject({ ok: false, status: 404 });
    expect(h.order).not.toContain('clean');
  });

  it('leaves the record published when the files could not be removed', async () => {
    h.cleanResult = false;
    const adapter = adapterWith({
      id: 'd1', slug: 'kept-slug', settingsVersion: 3, lastPublishedVersion: 3,
      publishedAt: new Date('2026-01-01'),
    });

    const outcome = await unpublishDeployment(adapter as never, 'd1');

    // Reporting success here would show an unpublished badge over a site still being served, which
    // is the exact desync this change removes.
    expect(outcome).toMatchObject({ ok: false, status: 500 });
    expect(adapter.state()).toMatchObject({ lastPublishedVersion: 3 });
  });
});
