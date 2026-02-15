/**
 * HuggingFace Auth — Client-side auth management
 *
 * Supports two auth methods:
 * 1. OAuth "Sign in with HuggingFace" — available only on HF Spaces
 * 2. API key paste — available everywhere
 *
 * OAuth tokens are stored in HttpOnly cookies (server-side).
 * API keys are stored in localStorage via configManager.
 */

export interface HFCapabilities {
  oauthAvailable: boolean;
}

export interface HFStatus {
  authenticated: boolean;
  username?: string;
}

/**
 * Check if OAuth is available (only on HF Spaces with OAUTH_CLIENT_ID set).
 */
export async function checkHFCapabilities(): Promise<HFCapabilities> {
  const res = await fetch('/api/auth/hf/capabilities', {
    credentials: 'same-origin',
  });
  if (!res.ok) return { oauthAvailable: false };
  return res.json();
}

/**
 * Check if user is authenticated via OAuth (cookie-based).
 */
export async function checkHFStatus(): Promise<HFStatus> {
  const res = await fetch('/api/auth/hf/status', {
    credentials: 'same-origin',
  });
  if (!res.ok) return { authenticated: false };
  return res.json();
}

/**
 * Disconnect OAuth session (clear HttpOnly cookie).
 */
export async function disconnectHF(): Promise<void> {
  const res = await fetch('/api/auth/hf/disconnect', {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new Error('Failed to disconnect HuggingFace session');
  }
}

/**
 * Redirect to HF OAuth login.
 */
export function loginHF(): void {
  window.location.href = '/api/auth/hf/login';
}
