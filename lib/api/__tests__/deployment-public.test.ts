import { describe, it, expect } from 'vitest';
import { toPublicDeployment } from '@/lib/api/deployment-public';

describe('toPublicDeployment', () => {
  it('removes the review password hash and reports only that one is set', () => {
    const out = toPublicDeployment({
      id: 'd1', review: { enabled: true, passwordHash: '$2b$10$abcdef' },
    } as never) as Record<string, unknown>;
    const review = out.review as Record<string, unknown>;
    expect(review.passwordHash).toBeUndefined();
    expect(review.reviewPasswordSet).toBe(true);
    expect(JSON.stringify(out)).not.toContain('$2b$');
  });

  it('reports the flag as false when no password is set', () => {
    const out = toPublicDeployment({ id: 'd1', review: { enabled: true } } as never) as Record<string, unknown>;
    expect((out.review as Record<string, unknown>).reviewPasswordSet).toBe(false);
  });

  it('does not strip the hash from the deployment it was handed', () => {
    // The record comes from the storage adapter and other callers read and write the same object,
    // so stripping in place would remove the hash from the live deployment, not just the response.
    const deployment = { id: 'd1', review: { enabled: true, passwordHash: '$2b$10$abcdef' } };

    toPublicDeployment(deployment as never);

    expect(deployment.review.passwordHash).toBe('$2b$10$abcdef');
    expect(deployment.review).not.toHaveProperty('reviewPasswordSet');
  });

  it('leaves a deployment with no review block alone', () => {
    const out = toPublicDeployment({ id: 'd1' } as never) as Record<string, unknown>;
    expect(out.review).toBeUndefined();
  });
});
