
import { ProviderId, ProviderModel } from './providers/types';
import { getProvider } from './providers/registry';
import { configManager } from '../config/storage';
import { apiFetch } from '../api/backend-status';

export async function validateApiKey(apiKey: string, provider: ProviderId): Promise<boolean> {
  if (!apiKey) return false;

  try {
    const response = await apiFetch('/api/validate-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        apiKey,
        provider
      })
    });

    if (!response.ok) {
      return false;
    }

    const { valid } = await response.json();
    return valid;
  } catch {
    return false;
  }
}

export type ModelEntry = string | (Pick<ProviderModel, 'id'> & Partial<Omit<ProviderModel, 'id'>>);

export function normalizeModelEntry(entry: ModelEntry, defaultContextLength: number): ProviderModel {
  if (typeof entry === 'string') {
    return {
      id: entry,
      name: entry.split('/').pop() || entry,
      contextLength: defaultContextLength,
      supportsFunctions: true,
    };
  }

  return {
    ...entry,
    name: entry.name || entry.id.split('/').pop() || entry.id,
    contextLength: entry.contextLength || defaultContextLength,
    supportsFunctions: entry.supportsFunctions ?? true,
    supportsVision: entry.supportsVision ?? entry.inputModalities?.includes('image'),
  };
}

export async function getAvailableModels(
  apiKey?: string,
  provider?: ProviderId,
  baseUrl?: string,
  customHeaders?: Record<string, string>,
): Promise<ModelEntry[]> {
  const currentProvider = provider || configManager.getSelectedProvider() || 'openrouter';
  const providerConfig = getProvider(currentProvider);
  let key = apiKey || configManager.getProviderApiKey(currentProvider);

  if (!providerConfig.supportsModelDiscovery && providerConfig.models) {
    return providerConfig.models;
  }

  try {
    if (currentProvider === 'openai-codex' && typeof window !== 'undefined') {
      const { ensureValidCodexToken } = await import('@/lib/auth/codex-auth');
      key = await ensureValidCodexToken();
    }

    const body: Record<string, unknown> = {
      apiKey: key,
      provider: currentProvider
    };
    if (baseUrl) body.baseUrl = baseUrl;
    if (customHeaders) body.customHeaders = customHeaders;
    const response = await apiFetch('/api/models', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      return providerConfig.models || [];
    }

    const { models } = await response.json();
    return models || [];
  } catch {
    return providerConfig.models || [];
  }
}
