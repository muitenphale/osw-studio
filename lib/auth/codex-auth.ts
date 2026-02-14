/**
 * Codex CLI OAuth — Token management for ChatGPT subscription access
 *
 * The long-lived refresh_token is stored in an HttpOnly cookie (osw_codex_rt)
 * and never exposed to JavaScript. Only the short-lived access_token (~1 hour)
 * is kept in localStorage.
 */

import { CodexAuthData } from '@/lib/llm/providers/types';
import { configManager } from '@/lib/config/storage';

/**
 * Send the full auth payload to the server. The server stores the
 * refresh_token in an HttpOnly cookie and returns the non-sensitive fields.
 */
export async function connectCodex(auth: CodexAuthData): Promise<CodexAuthData> {
  const res = await fetch('/api/auth/codex/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(auth),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Connect failed' }));
    throw new Error(data.error || 'Failed to connect Codex session');
  }

  // Server returns { access_token, expires_at, user_email } — no refresh_token
  return res.json();
}

/**
 * Delete the HttpOnly refresh token cookie and clear localStorage.
 */
export async function disconnectCodex(): Promise<void> {
  const res = await fetch('/api/auth/codex/disconnect', {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new Error('Failed to clear server session');
  }
  configManager.clearCodexAuth();
}

/**
 * Check whether the server has a refresh token cookie set.
 */
export async function checkCodexStatus(): Promise<boolean> {
  const res = await fetch('/api/auth/codex/status', {
    credentials: 'same-origin',
  });
  if (!res.ok) return false;
  const data = await res.json();
  return !!data.hasRefreshToken;
}

/**
 * Refresh the access token using the HttpOnly cookie. The client sends no
 * token — the server reads it from the cookie automatically.
 */
export async function refreshAccessToken(): Promise<CodexAuthData> {
  const res = await fetch('/api/auth/codex/token', {
    method: 'POST',
    credentials: 'same-origin',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Token refresh failed' }));
    throw new Error(data.error || `Token refresh failed: ${res.status}`);
  }

  // Server returns { access_token, expires_at }
  return res.json();
}

/**
 * Ensure the stored Codex token is valid. Refreshes if expired.
 * Returns the valid access token, or throws if refresh fails.
 */
export async function ensureValidCodexToken(): Promise<string> {
  const auth = configManager.getCodexAuth();
  if (!auth) {
    throw new Error('ChatGPT session not found. Please log in via Settings.');
  }

  if (!configManager.isCodexTokenExpired()) {
    return auth.access_token;
  }

  // Token expired or near-expiry — refresh via HttpOnly cookie
  try {
    const refreshed = await refreshAccessToken();
    configManager.setCodexAuth(refreshed);
    return refreshed.access_token;
  } catch {
    configManager.clearCodexAuth();
    throw new Error('ChatGPT session expired. Please re-authenticate in Settings.');
  }
}

/**
 * Parse a pasted auth JSON (from running `codex login` locally).
 * Handles the actual ~/.codex/auth.json format where tokens are nested:
 *   { "tokens": { "access_token": "...", "refresh_token": "...", ... }, ... }
 * Also accepts a flat format with top-level access_token/refresh_token.
 */
export function parseCodexAuthJson(json: string): CodexAuthData {
  const parsed = JSON.parse(json);

  // Codex CLI nests tokens under a "tokens" key
  const tokens = parsed.tokens || parsed;
  const accessToken = tokens.access_token || tokens.token;
  const refreshToken = tokens.refresh_token;

  if (!accessToken) {
    throw new Error('Missing access_token in pasted JSON');
  }
  if (!refreshToken) {
    throw new Error('Missing refresh_token in pasted JSON');
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: tokens.expires_at || parsed.expires_at || Math.floor(Date.now() / 1000) + 3600,
    user_email: tokens.user_email || parsed.user_email || tokens.email || parsed.email,
  };
}
