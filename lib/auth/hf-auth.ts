/**
 * HuggingFace Auth — Client-side auth management
 *
 * Supports two auth methods:
 * 1. OAuth "Sign in with HuggingFace" — available only on HF Spaces
 * 2. API key paste — available everywhere
 *
 * Both methods store tokens in localStorage via configManager.
 */

export interface HFCapabilities {
  oauthAvailable: boolean;
  codexAvailable: boolean;
}

export interface HFStatus {
  authenticated: boolean;
  username?: string;
}

/**
 * Check if OAuth is available (only on HF Spaces with OAUTH_CLIENT_ID set)
 * and whether Codex auth is supported (not on HF Spaces — cookies blocked).
 */
export async function checkHFCapabilities(): Promise<HFCapabilities> {
  const res = await fetch('/api/auth/hf/capabilities', {
    credentials: 'same-origin',
  });
  if (!res.ok) return { oauthAvailable: false, codexAvailable: true };
  return res.json();
}

/**
 * Redirect to HF OAuth login.
 */
export function loginHF(): void {
  window.location.href = '/api/auth/hf/login';
}
