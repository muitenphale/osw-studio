import { OAuthError, OAuthErrorCode, type AuthInfo, type OAuthTokenVerifier } from '@modelcontextprotocol/server';
import { ACTIVE_SCOPES, type McpScope } from './scopes';

/**
 * Bearer verification for the MCP endpoint: an access token issued by this instance's own OAuth
 * consent flow (lib/mcp/store.ts), or the development token when one is configured.
 *
 * Env: MCP_ENABLED=true, MCP_DEV_TOKEN=<secret>, MCP_DEV_USER_ID=<system user id>,
 * MCP_DEV_WORKSPACE_ID=<workspace the grant covers>, MCP_DEV_SCOPES=<optional narrowed list>.
 */

export { MCP_SCOPES, type McpScope } from './scopes';

export function mcpEnabled(): boolean {
  return process.env.MCP_ENABLED === 'true';
}

export interface McpPrincipal {
  userId: string;
  /** The workspace's name, shown so a client can tell one instance's connector from another's. */
  workspaceName: string;
  /**
   * The one workspace this grant covers. Enforced by the tools on every call, on top of the
   * account's role: `verifyWorkspaceAccess` lets an instance admin into every workspace, so a
   * grant held by an admin would otherwise reach workspaces the consent screen never named.
   */
  workspaceId: string;
  scopes: McpScope[];
  clientLabel: string;
  /** The grant this call is made under, so its activity can be recorded against it. */
  grantId: string;
}

export function principalOf(auth: AuthInfo): McpPrincipal {
  const extra = (auth.extra ?? {}) as { userId?: string; workspaceId?: string; workspaceName?: string; clientLabel?: string; grantId?: string };
  return {
    userId: String(extra.userId ?? ''),
    workspaceId: String(extra.workspaceId ?? ''),
    workspaceName: String(extra.workspaceName ?? ''),
    scopes: auth.scopes as McpScope[],
    clientLabel: String(extra.clientLabel ?? auth.clientId),
    grantId: String(extra.grantId ?? auth.clientId),
  };
}

/**
 * The real verifier: an opaque access token resolved through the grant store. The dev token is
 * still accepted when MCP_DEV_TOKEN is set, which is how the endpoint is driven in tests and
 * local experiments without walking the consent flow.
 */
export function mcpTokenVerifier(): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const { subjectForAccessToken } = await import('./store');
      const subject = subjectForAccessToken(token);
      if (subject) {
        return {
          token,
          clientId: subject.clientId,
          scopes: subject.scopes,
          expiresAt: subject.expiresAt,
          extra: {
            userId: subject.userId,
            workspaceId: subject.workspaceId,
            workspaceName: subject.workspaceName,
            clientLabel: subject.clientName,
            grantId: subject.grantId,
          },
        };
      }
      return devToken(token);
    },
  };
}

/**
 * Local-only shortcut: one token from the environment, mapped to one account and workspace.
 *
 * It bypasses consent, so it creates no grant row: it appears in no Settings list and cannot be
 * revoked from the app, only by editing the environment and restarting. That is a fair trade for
 * a local experiment and an unseen permanent key on a real instance, so it is refused outright in
 * production however the variables are set.
 */
function devToken(token: string): AuthInfo {
  if (process.env.NODE_ENV === 'production') {
    throw new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown token');
  }
  const expected = process.env.MCP_DEV_TOKEN;
  const userId = process.env.MCP_DEV_USER_ID;
  const workspaceId = process.env.MCP_DEV_WORKSPACE_ID;
  if (!expected || !userId || !workspaceId || token.length !== expected.length || !timingSafeEqual(token, expected)) {
    throw new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown token');
  }
  // Narrowed against the real list, so a typo or a withdrawn scope cannot hand out something no
  // consent screen would offer.
  const granted = process.env.MCP_DEV_SCOPES?.split(',')
    .map(s => s.trim())
    .filter((s): s is McpScope => (ACTIVE_SCOPES as readonly string[]).includes(s));
  return {
    token,
    clientId: 'dev',
    scopes: granted?.length ? granted : [...ACTIVE_SCOPES],
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    extra: { userId, workspaceId, workspaceName: 'Development workspace', clientLabel: 'Development token', grantId: 'dev' },
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
