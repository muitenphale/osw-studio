
import { ProviderId, ProviderConfig, ProviderModel } from './types';




const geminiModels: ProviderModel[] = [
  {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash',
    description: 'Latest experimental Gemini model',
    contextLength: 1048576,
    maxTokens: 8192,
    supportsFunctions: true,
    supportsVision: true
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    description: 'Advanced reasoning and analysis',
    contextLength: 2097152,
    maxTokens: 8192,
    supportsFunctions: true,
    supportsVision: true
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    description: 'Fast and versatile',
    contextLength: 1048576,
    maxTokens: 8192,
    supportsFunctions: true,
    supportsVision: true
  }
];






export const providers: Record<ProviderId, ProviderConfig> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access multiple AI models through a unified API',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'sk-or-...',
    apiKeyHelpUrl: 'https://openrouter.ai/keys',
    baseUrl: 'https://openrouter.ai/api/v1',
    supportsModelDiscovery: true,
    supportsFunctions: true,
    supportsStreaming: true
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4, GPT-3.5 and other OpenAI models',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'sk-...',
    apiKeyHelpUrl: 'https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com/v1',
    supportsModelDiscovery: true,
    supportsFunctions: true,
    supportsStreaming: true
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 3.5 Sonnet, Haiku and Opus models',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'sk-ant-...',
    apiKeyHelpUrl: 'https://console.anthropic.com/settings/keys',
    baseUrl: 'https://api.anthropic.com/v1',
    supportsModelDiscovery: true,
    supportsFunctions: true,
    supportsStreaming: true
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast inference with Llama and Mixtral models',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'gsk_...',
    apiKeyHelpUrl: 'https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai/v1',
    supportsModelDiscovery: true,
    supportsFunctions: true,
    supportsStreaming: true
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Google\'s multimodal AI models',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'AI...',
    apiKeyHelpUrl: 'https://aistudio.google.com/apikey',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: geminiModels,
    supportsFunctions: true,
    supportsStreaming: true
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    description: 'Run models locally with Ollama',
    apiKeyRequired: false,
    baseUrl: 'http://localhost:11434/v1',
    supportsModelDiscovery: true,
    supportsFunctions: true,
    supportsStreaming: true,
    isLocal: true
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    description: 'Local model server with tool use support',
    apiKeyRequired: false,
    baseUrl: 'http://localhost:1234/v1',
    supportsModelDiscovery: true,
    supportsFunctions: true,
    supportsStreaming: true,
    isLocal: true
  },
  sambanova: {
    id: 'sambanova',
    name: 'SambaNova',
    description: 'High-performance AI chips for inference',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'SambaNova API Key',
    apiKeyHelpUrl: 'https://cloud.sambanova.ai/apis',
    baseUrl: 'https://api.sambanova.ai/v1',
    supportsModelDiscovery: true,
    supportsFunctions: true,
    supportsStreaming: true
  },
};

export function getProvider(id: ProviderId): ProviderConfig {
  return providers[id];
}

export function getAllProviders(): ProviderConfig[] {
  return Object.values(providers);
}

/**
 * Check if a model supports vision/image input.
 * For providers with model discovery (OpenRouter, OpenAI), this checks cached model info.
 * For hardcoded models (Gemini), this checks the supportsVision flag.
 *
 * Note: Many vision models follow naming conventions:
 * - GPT-5.x models (gpt-5, gpt-5.1, gpt-5.2)
 * - Claude Opus 4.5 and Claude 3+ models
 * - Gemini models (generally all support vision)
 * - Contains 'llava' (Ollama vision models)
 */
export function modelSupportsVision(providerId: ProviderId, modelId: string): boolean {
  const provider = getProvider(providerId);

  // Check hardcoded models first
  if (provider.models) {
    const model = provider.models.find(m => m.id === modelId);
    if (model?.supportsVision !== undefined) {
      return model.supportsVision;
    }
  }

  // For providers without hardcoded models, use heuristics based on model name
  const modelLower = modelId.toLowerCase();

  // OpenAI GPT vision models (GPT-5.x, GPT-4.x with vision)
  if (modelLower.includes('gpt-5') ||
      modelLower.includes('gpt-4') ||
      modelLower.includes('vision')) {
    return true;
  }

  // Claude models with vision (Opus 4.5, Claude 3+, Claude 4+)
  if (modelLower.includes('claude-opus') ||
      modelLower.includes('claude-3') ||
      modelLower.includes('claude-4') ||
      modelLower.includes('claude-sonnet') ||
      modelLower.includes('claude-haiku')) {
    return true;
  }

  // Gemini models generally support vision
  if (modelLower.includes('gemini')) {
    return true;
  }

  // Ollama llava models
  if (modelLower.includes('llava') || modelLower.includes('bakllava')) {
    return true;
  }

  // Qwen-VL models
  if (modelLower.includes('qwen') && modelLower.includes('vl')) {
    return true;
  }

  // Pixtral (Mistral vision)
  if (modelLower.includes('pixtral')) {
    return true;
  }

  // GLM-4V models (Zhipu AI)
  if (modelLower.includes('glm') && modelLower.includes('v')) {
    return true;
  }

  return false;
}
