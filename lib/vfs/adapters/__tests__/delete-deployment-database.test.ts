import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * A deployment directory is no longer flat: the review build lives in a subdirectory
 * beside the SQLite files. Deleting a deployment has to cope with that, or the
 * directory becomes undeletable the moment a review build has been written.
 */

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-deldep-'));
  vi.resetModules();
  vi.stubEnv('DEPLOYMENTS_DIR', dir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('deleteDeploymentDatabase', () => {
  it('removes a deployment directory that contains subdirectories', async () => {
    const { deleteDeploymentDatabase } = await import('@/lib/vfs/adapters/sqlite-connection');
    const id = '11111111-1111-4111-8111-111111111111';
    const deploymentDir = path.join(dir, id);
    fs.mkdirSync(path.join(deploymentDir, 'review-build', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(deploymentDir, 'runtime.sqlite'), 'x');
    fs.writeFileSync(path.join(deploymentDir, 'review-build', 'index.html'), '<html></html>');

    deleteDeploymentDatabase(id);

    expect(fs.existsSync(deploymentDir)).toBe(false);
  });

  it('removes a deployment whose review database is still open', async () => {
    // deleteDeploymentDatabase closes the review connection before removing the directory. An open
    // better-sqlite3 handle holds a lock that makes the removal fail on Windows, so the close is
    // load-bearing on a platform the test suite does not run on.
    const { deleteDeploymentDatabase } = await import('@/lib/vfs/adapters/sqlite-connection');
    const { ReviewDatabase } = await import('@/lib/vfs/adapters/review-database');
    const id = '22222222-2222-4222-8222-222222222222';
    const deploymentDir = path.join(dir, id);

    const review = new ReviewDatabase(id);
    review.init();
    expect(fs.existsSync(path.join(deploymentDir, 'review.sqlite'))).toBe(true);

    deleteDeploymentDatabase(id);

    expect(fs.existsSync(deploymentDir)).toBe(false);
  });

  it('drops the cached review connection so a later open is not a handle to a deleted file', async () => {
    const { deleteDeploymentDatabase, getReviewDatabaseConnection } = await import(
      '@/lib/vfs/adapters/sqlite-connection'
    );
    const id = '33333333-3333-4333-8333-333333333333';

    const before = getReviewDatabaseConnection(id);
    deleteDeploymentDatabase(id);
    const after = getReviewDatabaseConnection(id);

    expect(after).not.toBe(before);
    expect(after.open).toBe(true);
  });
});
