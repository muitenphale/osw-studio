
import { ProviderId } from './providers/types';
import { getProvider } from './providers/registry';
import { configManager } from '../config/storage';

export async function validateApiKey(apiKey: string, provider: ProviderId): Promise<boolean> {
  if (!apiKey) return false;

  try {
    const response = await fetch('/api/validate-key', {
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

export async function getAvailableModels(apiKey?: string, provider?: ProviderId): Promise<string[]> {
  const currentProvider = provider || configManager.getSelectedProvider() || 'openrouter';
  const providerConfig = getProvider(currentProvider);
  const key = apiKey || configManager.getProviderApiKey(currentProvider);

  if (!providerConfig.supportsModelDiscovery && providerConfig.models) {
    return providerConfig.models.map(m => m.id);
  }

  try {
    const response = await fetch('/api/models', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        apiKey: key,
        provider: currentProvider
      })
    });

    if (!response.ok) {
      return providerConfig.models?.map(m => m.id) || [];
    }

    const { models } = await response.json();
    return models || [];
  } catch {
    return providerConfig.models?.map(m => m.id) || [];
  }
}
