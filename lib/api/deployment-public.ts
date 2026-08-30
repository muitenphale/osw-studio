/**
 * Strips server-only fields from a deployment before it is serialised to a client.
 *
 * The deployments API returns whole deployment objects, and `DeploymentDetail` takes one as a
 * React prop, so anything on the record reaches the browser by default. `review.passwordHash` is
 * a bcrypt hash of the review-mode password: it must never leave the server, and an offline
 * attack on it is exactly what shipping it would enable. The UI only ever needs to know whether
 * a password exists, which is what `reviewPasswordSet` answers.
 *
 * The return type omits `passwordHash`, so a caller cannot reach for it on a stripped object and
 * quietly reintroduce the leak.
 */
import type { ReviewConfig } from '@/lib/vfs/types';

export type PublicReviewConfig = Omit<ReviewConfig, 'passwordHash'> & {
  reviewPasswordSet: boolean;
};

export type PublicDeployment<T> = Omit<T, 'review'> & {
  review?: PublicReviewConfig;
};

/**
 * Returns a copy, deployment records come straight from the storage adapter and are read back
 * and written by other callers, so mutating one here would strip the hash from the live object.
 */
export function toPublicDeployment<T extends { review?: ReviewConfig }>(
  deployment: T
): PublicDeployment<T> {
  const { review, ...rest } = deployment;

  if (!review) {
    return rest as PublicDeployment<T>;
  }

  const { passwordHash, ...publicReview } = review;

  return {
    ...rest,
    review: { ...publicReview, reviewPasswordSet: !!passwordHash },
  } as PublicDeployment<T>;
}
