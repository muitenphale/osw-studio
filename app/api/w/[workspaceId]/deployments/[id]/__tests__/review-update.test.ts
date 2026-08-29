import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyPassword } from '@/lib/auth/passwords';
import type { Deployment } from '@/lib/vfs/types';

/**
 * Boundary test for the deployment PUT.
 *
 * Two things only exist at the route: the review password is plaintext in the body and hashed here
 * before it reaches the merge, and `settingsVersion` is bumped here when review mode changes what
 * the build produces. Neither is visible to a unit test of `mergeReviewConfig`.
 */

const mocks = vi.hoisted(() => ({ getWorkspaceContext: vi.fn() }));
vi.mock('@/lib/api/workspace-context', () => ({ getWorkspaceContext: mocks.getWorkspaceContext }));
vi.mock('@/lib/utils', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/compiler/static-builder', () => ({ cleanStaticDeployment: vi.fn() }));
vi.mock('@/lib/auth/system-database', () => ({ removeDeploymentRoute: vi.fn() }));
vi.mock('@/lib/caddy/regenerate', () => ({ regenerateInstanceCaddy: vi.fn() }));

import { PUT } from '../route';

const DEPLOYMENT_ID = 'd1';
const params = Promise.resolve({ workspaceId: 'default', id: DEPLOYMENT_ID });

let stored: Deployment;

function deployment(review?: Deployment['review']): Deployment {
  return {
    id: DEPLOYMENT_ID,
    projectId: 'p1',
    name: 'Site',
    slug: 'site',
    enabled: true,
    underConstruction: false,
    headScripts: [],
    bodyScripts: [],
    cdnLinks: [],
    analytics: {} as Deployment['analytics'],
    seo: {} as Deployment['seo'],
    compliance: {} as Deployment['compliance'],
    settingsVersion: 4,
    lastPublishedVersion: 4,
    review,
    createdAt: new Date('2026-07-30T10:00:00.000Z'),
    updatedAt: new Date('2026-07-30T10:00:00.000Z'),
  };
}

async function put(body: unknown) {
  const request = new NextRequest(`http://localhost/api/w/default/deployments/${DEPLOYMENT_ID}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return PUT(request, { params });
}

beforeEach(() => {
  vi.clearAllMocks();
  stored = deployment();
  mocks.getWorkspaceContext.mockImplementation(async () => ({
    adapter: {
      getDeployment: async () => stored,
      updateDeployment: async (d: Deployment) => {
        stored = d;
      },
    },
  }));
});

describe('deployment PUT — review password', () => {
  it('hashes a plaintext password and stores the hash', async () => {
    const response = await put({ review: { enabled: true, password: 'correct horse battery' } });

    expect(response.status).toBe(200);
    expect(stored.review?.passwordHash).toMatch(/^\$2/);
    expect(await verifyPassword('correct horse battery', stored.review!.passwordHash!)).toBe(true);
    expect(stored.review).not.toHaveProperty('password');
  });

  it('never returns the hash to the client', async () => {
    const response = await put({ review: { enabled: true, password: 'correct horse battery' } });
    const json = await response.json();

    expect(json.review).not.toHaveProperty('passwordHash');
    expect(json.review.reviewPasswordSet).toBe(true);
  });

  it('clears the password on password: null', async () => {
    stored = deployment({ enabled: true, passwordHash: '$2b$12$storedhashstoredhashstoredhash' });

    await put({ review: { enabled: true, password: null } });

    expect(stored.review).not.toHaveProperty('passwordHash');
  });

  it('leaves the stored hash untouched when password is absent', async () => {
    stored = deployment({ enabled: true, passwordHash: '$2b$12$storedhashstoredhashstoredhash' });

    await put({ review: { enabled: true, expiresAt: '2030-01-01T00:00:00.000Z', reviewPasswordSet: true } });

    expect(stored.review?.passwordHash).toBe('$2b$12$storedhashstoredhashstoredhash');
    expect(stored.review?.expiresAt).toBe('2030-01-01T00:00:00.000Z');
  });

  it('ignores a body-supplied passwordHash when no password accompanies it', async () => {
    stored = deployment({ enabled: true, passwordHash: '$2b$12$storedhashstoredhashstoredhash' });

    const response = await put({ review: { enabled: true, passwordHash: '$2b$12$attackerhashattackerhashattack' } });

    expect(response.status).toBe(200);
    expect(stored.review?.passwordHash).toBe('$2b$12$storedhashstoredhashstoredhash');
  });

  it('ignores a body-supplied passwordHash when a password accompanies it', async () => {
    const attackerHash = await import('@/lib/auth/passwords').then((m) => m.hashPassword('attacker known'));

    await put({ review: { enabled: true, password: 'correct horse battery', passwordHash: attackerHash } });

    expect(stored.review?.passwordHash).not.toBe(attackerHash);
    expect(await verifyPassword('correct horse battery', stored.review!.passwordHash!)).toBe(true);
    expect(await verifyPassword('attacker known', stored.review!.passwordHash!)).toBe(false);
  });

  it('rejects a password shorter than the minimum without writing anything', async () => {
    const response = await put({ review: { enabled: true, password: 'short' } });

    expect(response.status).toBe(400);
    expect(stored.review).toBeUndefined();
  });
});

describe('deployment PUT — settingsVersion', () => {
  it('bumps settingsVersion when review.enabled flips on', async () => {
    await put({ review: { enabled: true } });

    expect(stored.settingsVersion).toBe(5);
  });

  it('bumps settingsVersion when review.enabled flips off', async () => {
    stored = deployment({ enabled: true });

    await put({ review: { enabled: false } });

    expect(stored.settingsVersion).toBe(5);
  });

  it('does not bump settingsVersion when only expiresAt changes', async () => {
    // Expiry is read at request time by the review access layer, so it takes effect with no
    // republish. Bumping would show a false "unpublished changes" prompt.
    stored = deployment({ enabled: true, expiresAt: '2030-01-01T00:00:00.000Z' });

    await put({ review: { enabled: true, expiresAt: '2031-01-01T00:00:00.000Z' } });

    expect(stored.settingsVersion).toBe(4);
  });

  it('does not bump settingsVersion when only the password changes', async () => {
    stored = deployment({ enabled: true, passwordHash: '$2b$12$storedhashstoredhashstoredhash' });

    await put({ review: { enabled: true, password: 'correct horse battery' } });

    expect(stored.settingsVersion).toBe(4);
  });

  it('does not bump settingsVersion when the password is cleared', async () => {
    stored = deployment({ enabled: true, passwordHash: '$2b$12$storedhashstoredhashstoredhash' });

    await put({ review: { enabled: true, password: null } });

    expect(stored.settingsVersion).toBe(4);
  });

  it('does not bump settingsVersion for a body with no review block', async () => {
    await put({ name: 'Renamed' });

    expect(stored.settingsVersion).toBe(4);
  });

  it('ignores a client-supplied settingsVersion when review.enabled flips', async () => {
    // The handler spreads the whole body, so a stale or forged counter would otherwise land in
    // storage and desync the unpublished-changes comparison.
    await put({ settingsVersion: 99, review: { enabled: true } });

    expect(stored.settingsVersion).toBe(5);
  });
});
