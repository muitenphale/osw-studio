/**
 * Deployment access control for routes that are not workspace-scoped by URL.
 *
 * The analytics dashboard endpoints take a deployment id and nothing else. They authenticated the
 * caller but never checked that the caller had any claim to that deployment, and deployment ids are
 * not secret — the tracking script embeds them in every published page. Anyone with a session could
 * therefore read another tenant's analytics, and DELETE /clear could destroy them.
 *
 * This is the counterpart to lib/api/workspace-context.ts for deployment-addressed routes: resolve
 * the deployment to its owning workspace, then apply the same workspace access check.
 */

import 'server-only';

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { verifyWorkspaceAccess } from '@/lib/auth/system-database';
import { resolveDeployment, type ResolvedDeployment } from '@/lib/vfs/adapters/deployment-adapter';
import { logger } from '@/lib/utils';

type DeploymentAccessResult =
  | { ok: true; context: ResolvedDeployment }
  | { ok: false; response: NextResponse };

/**
 * Authenticate the caller, resolve the deployment, and verify workspace access.
 *
 * @param requiredRole 'viewer' to read, 'editor' to mutate or export.
 * @param options.probe The caller is asking whether this level is available to them, having
 *   already been authorised at a lower one — review mode asks at 'viewer' to admit someone and
 *   again at 'editor' to decide whether they may act as the team. A refusal is then the answer to
 *   a question rather than someone reaching for a deployment they have no claim to, so it is not
 *   logged as one; left unset, a read-only member browsing a review copy would file a denial
 *   warning for every asset on every page.
 *
 * A deployment with no routing row resolves from the default database with workspaceId null. That
 * is the legacy single-user layout, where any authenticated user is already the owner, so it is
 * allowed — hosted deployments always have a routing row.
 */
export async function requireDeploymentAccess(
  deploymentId: string,
  requiredRole: 'owner' | 'editor' | 'viewer' = 'viewer',
  options: { probe?: boolean } = {}
): Promise<DeploymentAccessResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const resolved = await resolveDeployment(deploymentId);
  if (!resolved) {
    return { ok: false, response: NextResponse.json({ error: 'Deployment not found' }, { status: 404 }) };
  }

  if (resolved.workspaceId) {
    try {
      verifyWorkspaceAccess(session.userId, resolved.workspaceId, requiredRole);
    } catch (error) {
      // Deliberately 404, not 403: a caller with no claim to this deployment should not learn
      // that it exists.
      if (!options.probe) {
        logger.warn(`[DeploymentAccess] Denied ${session.userId} on deployment ${deploymentId}:`, error);
      }
      return { ok: false, response: NextResponse.json({ error: 'Deployment not found' }, { status: 404 }) };
    }
  }

  return { ok: true, context: resolved };
}
