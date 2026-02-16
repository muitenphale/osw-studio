/**
 * HuggingFace Auth — Client-side PKCE OAuth via @huggingface/hub
 *
 * Supports two auth methods:
 * 1. OAuth "Sign in with HuggingFace" — client-side PKCE, no server routes needed
 * 2. API key paste — available everywhere
 *
 * Both methods store tokens in localStorage via configManager.
 */

import { oauthLoginUrl, oauthHandleRedirectIfPresent } from '@huggingface/hub';

export interface HFCapabilities {
  oauthAvailable: boolean;
  clientId: string | null;
  scopes: string;
  codexAvailable: boolean;
}

/**
 * Check if OAuth is available (only on HF Spaces with OAUTH_CLIENT_ID set)
 * and whether Codex auth is supported (not on HF Spaces — cookies blocked).
 */
export async function checkHFCapabilities(): Promise<HFCapabilities> {
  const res = await fetch('/api/auth/hf/capabilities', {
    credentials: 'same-origin',
  });
  if (!res.ok) return { oauthAvailable: false, clientId: null, scopes: 'openid profile', codexAvailable: true };
  return res.json();
}

/**
 * Redirect to HF OAuth login using client-side PKCE.
 * The @huggingface/hub library handles code verifier generation and storage.
 */
export async function loginHF(clientId: string, scopes: string): Promise<void> {
  const url = await oauthLoginUrl({
    clientId,
    scopes,
    redirectUrl: window.location.origin + '/',
  });
  window.location.href = url;
}

/**
 * Handle OAuth redirect if present.
 * Call on page load — returns OAuthResult if we just came back from HF auth, false otherwise.
 */
export { oauthHandleRedirectIfPresent };
