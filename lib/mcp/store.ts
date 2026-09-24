import 'server-only';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { getSystemDatabase, getWorkspaceById } from '@/lib/auth/system-database';
import { MCP_SCOPES, type McpScope } from './scopes';

/**
 * Storage for MCP OAuth: registered clients, the codes they exchange, and the grants and tokens
 * that come out of it. Lives in the system database beside users and workspaces, because a grant
 * belongs to an account and names one workspace.
 *
 * Secrets are never stored in the clear. Access and refresh tokens are random 32-byte strings;
 * only their SHA-256 is written, so a copy of the database does not yield working tokens.
 */

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const CODE_TTL_SECONDS = 60;

export interface McpClient {
  client_id: string;
  client_name: string;
  redirect_uris: string;
  created_at: string;
}

export interface McpGrantRow {
  id: string;
  client_id: string;
  user_id: string;
  workspace_id: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
  revoked: number;
}

export interface TokenSubject {
  grantId: string;
  clientId: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  scopes: McpScope[];
  clientName: string;
  expiresAt: number;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function secret(): string {
  return randomBytes(32).toString('base64url');
}

export function initMcpSchema(): void {
  const db = getSystemDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_clients (
      client_id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      redirect_uris TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS mcp_grants (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      scopes TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      revoked INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_grants_user ON mcp_grants(user_id, revoked);
    CREATE TABLE IF NOT EXISTS mcp_codes (
      code_hash TEXT PRIMARY KEY,
      grant_id TEXT NOT NULL,
      code_challenge TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      resource TEXT,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mcp_tokens (
      token_hash TEXT PRIMARY KEY,
      grant_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('access', 'refresh')),
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_tokens_grant ON mcp_tokens(grant_id);
    CREATE TABLE IF NOT EXISTS mcp_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      tool TEXT NOT NULL,
      target TEXT,
      refused INTEGER NOT NULL DEFAULT 0,
      at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_activity_user ON mcp_activity(user_id, id DESC);
    CREATE TABLE IF NOT EXISTS mcp_consumed_refresh (
      token_hash TEXT PRIMARY KEY,
      grant_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
}

/** How many calls are kept per grant. Enough to answer "what did it just do", not a full archive. */
const ACTIVITY_PER_GRANT = 200;

export interface McpActivityRow {
  id: number;
  grant_id: string;
  tool: string;
  target: string | null;
  refused: number;
  at: string;
}

/**
 * Record one tool call against the grant that made it.
 *
 * A grant recorded only `last_used_at`, so a person could see that a connector had been active but
 * never what it did: which project, which tool, whether it was refused. File edits leave
 * checkpoints, but SQL, backend and deployment calls left nothing at all, which made an
 * after-the-fact review of a connector impossible.
 *
 * Arguments are deliberately not stored. A prompt or a SQL statement is the caller's content, and
 * keeping it would turn this into a second copy of the work rather than a record of access.
 */
export function recordMcpActivity(input: {
  grantId: string;
  userId: string;
  workspaceId: string;
  tool: string;
  target?: string;
  refused?: boolean;
}): void {
  try {
    initMcpSchema();
    const db = getSystemDatabase();
    db.prepare(
      'INSERT INTO mcp_activity (grant_id, user_id, workspace_id, tool, target, refused) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      input.grantId,
      input.userId,
      input.workspaceId,
      input.tool,
      // The caller chose this string. An id is a UUID, so anything past 80 characters is padding
      // a row that is kept 200 deep per grant.
      input.target ? input.target.slice(0, 80) : null,
      input.refused ? 1 : 0,
    );
    db.prepare(`
      DELETE FROM mcp_activity
      WHERE grant_id = ?
        AND id NOT IN (SELECT id FROM mcp_activity WHERE grant_id = ? ORDER BY id DESC LIMIT ?)
    `).run(input.grantId, input.grantId, ACTIVITY_PER_GRANT);
  } catch {
    // A tool call is not worth failing because its audit row could not be written.
  }
}

/** The calls a grant has made, newest first. */
export function listMcpActivity(grantId: string, userId: string, limit = 20): McpActivityRow[] {
  initMcpSchema();
  const db = getSystemDatabase();
  return db.prepare(
    'SELECT id, grant_id, tool, target, refused, at FROM mcp_activity WHERE grant_id = ? AND user_id = ? ORDER BY id DESC LIMIT ?'
  ).all(grantId, userId, limit) as McpActivityRow[];
}

// --- clients ---------------------------------------------------------------

/** Dynamic client registration. Redirect URIs are stored exactly and matched exactly later. */
export function registerMcpClient(clientName: string, redirectUris: string[]): McpClient {
  initMcpSchema();
  const db = getSystemDatabase();
  const client_id = randomUUID();
  db.prepare('INSERT INTO mcp_clients (client_id, client_name, redirect_uris) VALUES (?, ?, ?)')
    .run(client_id, clientName, JSON.stringify(redirectUris));
  return getMcpClient(client_id)!;
}

export function getMcpClient(clientId: string): McpClient | undefined {
  initMcpSchema();
  const db = getSystemDatabase();
  return db.prepare('SELECT * FROM mcp_clients WHERE client_id = ?').get(clientId) as McpClient | undefined;
}

export function clientRedirectUris(client: McpClient): string[] {
  try {
    const parsed = JSON.parse(client.redirect_uris);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * A redirect URI is acceptable when it is loopback http or https, and has no fragment. The MCP
 * authorization spec requires both; without the loopback case Claude Code, whose callback is
 * `http://localhost:PORT/callback`, could not register at all.
 */
export function redirectUriAllowed(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1');
}

// --- grants and codes ------------------------------------------------------

export function createAuthorizationCode(input: {
  clientId: string;
  userId: string;
  workspaceId: string;
  scopes: McpScope[];
  codeChallenge: string;
  redirectUri: string;
  resource?: string;
}): string {
  initMcpSchema();
  const db = getSystemDatabase();

  const grantId = randomUUID();
  db.prepare('INSERT INTO mcp_grants (id, client_id, user_id, workspace_id, scopes) VALUES (?, ?, ?, ?, ?)')
    .run(grantId, input.clientId, input.userId, input.workspaceId, input.scopes.join(' '));
  const code = secret();
  db.prepare('INSERT INTO mcp_codes (code_hash, grant_id, code_challenge, redirect_uri, resource, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(hash(code), grantId, input.codeChallenge, input.redirectUri, input.resource ?? null, Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS);
  return code;
}

/** S256 only: the spec requires PKCE, and `plain` offers nothing against an intercepted code. */
function verifyPkce(verifier: string, challenge: string): boolean {
  const computed = createHash('sha256').update(verifier).digest('base64url');
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type CodeExchange =
  | { ok: true; grantId: string }
  | { ok: false; error: 'invalid_grant' | 'invalid_request'; description: string };

/** Exchanges a code once: the row is deleted whether or not the checks pass. */
export function redeemAuthorizationCode(input: {
  code: string;
  clientId: string;
  codeVerifier: string;
  redirectUri: string;
}): CodeExchange {
  initMcpSchema();
  const db = getSystemDatabase();
  const row = db.prepare('SELECT * FROM mcp_codes WHERE code_hash = ?').get(hash(input.code)) as
    | { grant_id: string; code_challenge: string; redirect_uri: string; expires_at: number }
    | undefined;
  if (!row) return { ok: false, error: 'invalid_grant', description: 'Unknown or already used code' };
  db.prepare('DELETE FROM mcp_codes WHERE code_hash = ?').run(hash(input.code));

  const grant = getGrant(row.grant_id);
  if (!grant || grant.client_id !== input.clientId) {
    return { ok: false, error: 'invalid_grant', description: 'Code was issued to another client' };
  }
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: 'invalid_grant', description: 'Code has expired' };
  }
  if (row.redirect_uri !== input.redirectUri) {
    return { ok: false, error: 'invalid_grant', description: 'redirect_uri does not match the authorization request' };
  }
  if (!input.codeVerifier || !verifyPkce(input.codeVerifier, row.code_challenge)) {
    return { ok: false, error: 'invalid_grant', description: 'PKCE verification failed' };
  }

  // One live grant per client, account and workspace. Re-approving used to add a row and leave the
  // old one working, so the Settings list showed several identical entries and revoking the one
  // you could see left another token valid. Superseding happens here rather than at consent: an
  // approval the browser never completes must not disconnect the client that is already working.
  const superseded = db.prepare(
    'SELECT id FROM mcp_grants WHERE client_id = ? AND user_id = ? AND workspace_id = ? AND revoked = 0 AND id != ?'
  ).all(grant.client_id, grant.user_id, grant.workspace_id, row.grant_id) as Array<{ id: string }>;
  for (const previous of superseded) {
    revokeGrant(previous.id);
  }

  return { ok: true, grantId: row.grant_id };
}

export function getGrant(grantId: string): McpGrantRow | undefined {
  initMcpSchema();
  const db = getSystemDatabase();
  return db.prepare('SELECT * FROM mcp_grants WHERE id = ?').get(grantId) as McpGrantRow | undefined;
}

export function listGrantsForUser(userId: string): (McpGrantRow & { client_name: string })[] {
  initMcpSchema();
  const db = getSystemDatabase();
  return db.prepare(`
    SELECT g.*, c.client_name
    FROM mcp_grants g JOIN mcp_clients c ON c.client_id = g.client_id
    WHERE g.user_id = ? AND g.revoked = 0
    ORDER BY g.created_at DESC
  `).all(userId) as (McpGrantRow & { client_name: string })[];
}

/** Revoking a grant drops its tokens, so a client holding one is refused on its next call. */
export function revokeGrant(grantId: string, userId?: string): boolean {
  initMcpSchema();
  const db = getSystemDatabase();
  const grant = getGrant(grantId);
  if (!grant || (userId && grant.user_id !== userId)) return false;
  db.prepare('UPDATE mcp_grants SET revoked = 1 WHERE id = ?').run(grantId);
  db.prepare('DELETE FROM mcp_tokens WHERE grant_id = ?').run(grantId);
  db.prepare('DELETE FROM mcp_codes WHERE grant_id = ?').run(grantId);
  db.prepare('DELETE FROM mcp_consumed_refresh WHERE grant_id = ?').run(grantId);
  return true;
}

// --- tokens ----------------------------------------------------------------

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: McpScope[];
}

/**
 * Drop rows that can no longer authenticate anything.
 *
 * Access tokens last an hour and codes a minute, so a busy instance accumulates dead rows in the
 * system database for as long as it runs. Called when tokens are issued, which is the only moment
 * the table grows.
 */
function pruneExpired(): void {
  const db = getSystemDatabase();
  const now = Math.floor(Date.now() / 1000);
  db.prepare('DELETE FROM mcp_tokens WHERE expires_at < ?').run(now);
  db.prepare('DELETE FROM mcp_codes WHERE expires_at < ?').run(now);
  db.prepare('DELETE FROM mcp_consumed_refresh WHERE expires_at < ?').run(now);
}

export function issueTokens(grantId: string): IssuedTokens {
  initMcpSchema();
  const db = getSystemDatabase();
  const grant = getGrant(grantId);
  if (!grant) throw new Error('Unknown grant');
  pruneExpired();
  const now = Math.floor(Date.now() / 1000);
  const accessToken = secret();
  const refreshToken = secret();
  const insert = db.prepare('INSERT INTO mcp_tokens (token_hash, grant_id, kind, expires_at) VALUES (?, ?, ?, ?)');
  insert.run(hash(accessToken), grantId, 'access', now + ACCESS_TOKEN_TTL_SECONDS);
  insert.run(hash(refreshToken), grantId, 'refresh', now + REFRESH_TOKEN_TTL_SECONDS);
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, scopes: parseScopes(grant.scopes) };
}

/** Rotation: the presented refresh token is consumed, so a replayed one is refused. */
export function rotateRefreshToken(refreshToken: string, clientId: string): { ok: true; tokens: IssuedTokens } | { ok: false; description: string } {
  initMcpSchema();
  const db = getSystemDatabase();
  const row = db.prepare("SELECT * FROM mcp_tokens WHERE token_hash = ? AND kind = 'refresh'").get(hash(refreshToken)) as
    | { grant_id: string; expires_at: number }
    | undefined;
  if (!row) {
    // Rotation consumes a refresh token, so seeing one again means two parties hold it: the
    // client and whoever copied it. Refusing only this request would leave the other holder's
    // freshly rotated pair working, so the grant itself goes.
    const consumed = db.prepare('SELECT grant_id FROM mcp_consumed_refresh WHERE token_hash = ?')
      .get(hash(refreshToken)) as { grant_id: string } | undefined;
    if (consumed) {
      revokeGrant(consumed.grant_id);
      return { ok: false, description: 'This refresh token was already used. The connection has been revoked; reconnect through consent.' };
    }
    return { ok: false, description: 'Unknown refresh token' };
  }
  db.prepare('DELETE FROM mcp_tokens WHERE token_hash = ?').run(hash(refreshToken));
  db.prepare('INSERT OR REPLACE INTO mcp_consumed_refresh (token_hash, grant_id, expires_at) VALUES (?, ?, ?)')
    .run(hash(refreshToken), row.grant_id, row.expires_at);
  const grant = getGrant(row.grant_id);
  if (!grant || grant.revoked) return { ok: false, description: 'Grant has been revoked' };
  if (grant.client_id !== clientId) return { ok: false, description: 'Refresh token was issued to another client' };
  if (row.expires_at < Math.floor(Date.now() / 1000)) return { ok: false, description: 'Refresh token has expired' };
  return { ok: true, tokens: issueTokens(row.grant_id) };
}

/**
 * The grant a token belongs to, whichever kind it is.
 *
 * Revocation took only access tokens, so a client handing back the refresh token it holds — which
 * RFC 7009 permits, and which is the longer-lived credential of the two — got a 200 and stayed
 * connected.
 */
export function grantIdForToken(token: string): string | undefined {
  initMcpSchema();
  const db = getSystemDatabase();
  const row = db.prepare('SELECT grant_id FROM mcp_tokens WHERE token_hash = ?').get(hash(token)) as
    | { grant_id: string }
    | undefined;
  return row?.grant_id;
}

/** Resolves an access token to its grant, or undefined when unknown, expired or revoked. */
export function subjectForAccessToken(accessToken: string): TokenSubject | undefined {
  initMcpSchema();
  const db = getSystemDatabase();
  const row = db.prepare("SELECT * FROM mcp_tokens WHERE token_hash = ? AND kind = 'access'").get(hash(accessToken)) as
    | { grant_id: string; expires_at: number }
    | undefined;
  if (!row) return undefined;
  if (row.expires_at < Math.floor(Date.now() / 1000)) return undefined;
  const grant = db.prepare(`
    SELECT g.*, c.client_name FROM mcp_grants g JOIN mcp_clients c ON c.client_id = g.client_id WHERE g.id = ?
  `).get(row.grant_id) as (McpGrantRow & { client_name: string }) | undefined;
  if (!grant || grant.revoked) return undefined;
  db.prepare("UPDATE mcp_grants SET last_used_at = datetime('now') WHERE id = ?").run(grant.id);
  return {
    grantId: grant.id,
    clientId: grant.client_id,
    userId: grant.user_id,
    workspaceId: grant.workspace_id,
    workspaceName: getWorkspaceById(grant.workspace_id)?.name ?? grant.workspace_id,
    scopes: parseScopes(grant.scopes),
    clientName: grant.client_name,
    expiresAt: row.expires_at,
  };
}

export function parseScopes(value: string): McpScope[] {
  return value.split(/[\s,]+/).filter((s): s is McpScope => (MCP_SCOPES as readonly string[]).includes(s));
}
