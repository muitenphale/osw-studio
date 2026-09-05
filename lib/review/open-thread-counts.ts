import 'server-only';

import fs from 'fs';
import path from 'path';

import { deploymentsRoot } from '@/lib/deployments-root';
import { ReviewDatabase } from '@/lib/vfs/adapters/review-database';
import type { ReviewConfig } from '@/lib/vfs/types';

/**
 * How many review threads are still open, per deployment, for a listing.
 *
 * Two guards, and they are the reason this is not a one-line map over the deployments.
 * `getReviewDatabaseConnection` creates the directory and the SQLite file on open and then caches
 * the handle, so asking every deployment for a count would leave an empty review database and a held
 * file descriptor behind for every deployment that has never used review.
 *
 * So: only deployments with review switched on are considered, and only those whose database already
 * exists on disk are opened. A deployment with review enabled but never published has no file yet and
 * is simply absent from the result.
 *
 * A deployment with nothing open is absent too, rather than present with a zero. The caller renders a
 * badge or renders nothing, and "no entry" is the same answer as "zero" without a count to compare.
 */
export function openThreadCounts(
  deployments: Array<{ id: string; review?: ReviewConfig }>
): Record<string, number> {
  const counts: Record<string, number> = {};

  const withReview = deployments.filter((d) => d.review?.enabled === true);
  if (withReview.length === 0) return counts;

  for (const deployment of withReview) {
    const dbPath = path.join(deploymentsRoot(), deployment.id, 'review.sqlite');
    if (!fs.existsSync(dbPath)) continue;

    try {
      const db = new ReviewDatabase(deployment.id);
      db.init();
      const open = db.countOpenThreads();
      if (open > 0) counts[deployment.id] = open;
    } catch {
      // An unreadable review database is not a reason to fail the deployments listing. The badge is
      // supplementary; the rest of the row is the point.
    }
  }

  return counts;
}
