import type { ProviderConfig } from './types';
import { sanitizeCustomHeaders } from './custom-headers';

const STORAGE_KEY = 'osw-studio-custom-providers';

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Load user-defined custom providers from localStorage. */
export function getCustomProviders(): Record<string, ProviderConfig> {
  if (typeof window === 'undefined') return {};
  return safeParse<Record<string, ProviderConfig>>(localStorage.getItem(STORAGE_KEY)) || {};
}

/** Persist the entire custom provider map. */
export function setCustomProviders(providers: Record<string, ProviderConfig>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
}

/** Add or replace a single custom provider. */
export function saveCustomProvider(id: string, config: ProviderConfig): void {
  const providers = getCustomProviders();
  providers[id] = config;
  setCustomProviders(providers);
}

/** Remove a custom provider. */
export function removeCustomProvider(id: string): void {
  const providers = getCustomProviders();
  delete providers[id];
  setCustomProviders(providers);
}

/** Generate a stable custom provider ID from a base string. */
export function generateCustomProviderId(base: string): string {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'custom';
  const existing = getCustomProviders();
  if (!existing[slug]) return slug;

  let i = 2;
  while (existing[`${slug}-${i}`]) i++;
  return `${slug}-${i}`;
}

/** Build a runtime config for a custom OpenAI-compatible provider. */
export function buildCustomProviderConfig(
  id: string,
  name: string,
  baseUrl: string,
  apiKeyRequired: boolean,
  customHeaders?: Record<string, string>
): ProviderConfig {
  const normalizedUrl = baseUrl.replace(/\/$/, '');
  const safeHeaders = sanitizeCustomHeaders(customHeaders).headers;
  return {
    id,
    name: name.trim() || id,
    description: `Custom OpenAI-compatible endpoint at ${normalizedUrl}`,
    apiKeyRequired,
    baseUrl: normalizedUrl,
    supportsModelDiscovery: true,
    supportsFunctions: true,
    supportsStreaming: true,
    ...(Object.keys(safeHeaders).length ? { customHeaders: safeHeaders } : {}),
  };
}
