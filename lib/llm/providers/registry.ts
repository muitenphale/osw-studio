import { ProviderId, ProviderConfig, ProviderModel } from './types';

const codexModels: ProviderModel[] = [
  {
    id: 'gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    description: 'Most capable agentic coding model',
    contextLength: 272000,
    maxTokens: 128000,
    supportsFunctions: true,
    supportsVision: true,
  },
  {
    id: 'gpt-5.2-codex',
    name: 'GPT-5.2 Codex',
    description: 'Frontier agentic coding model',
    contextLength: 272000,
    maxTokens: 128000,
    supportsFunctions: true,
    supportsVision: true,
  },
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    description: 'General purpose frontier model',
    contextLength: 272000,
    maxTokens: 128000,
    supportsFunctions: true,
    supportsVision: true,
  },
  {
    id: 'gpt-5.1-codex',
    name: 'GPT-5.1 Codex',
    description: 'Optimized for coding tasks',
    contextLength: 272000,
    maxTokens: 128000,
    supportsFunctions: true,
    supportsVision: true,
  },
  {
    id: 'gpt-5.1-codex-mini',
    name: 'GPT-5.1 Codex Mini',
    description: 'Fast and lightweight coding model',
    contextLength: 272000,
    maxTokens: 128000,
    supportsFunctions: true,
    supportsVision: true,
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    description: 'Broad world knowledge, general reasoning',
    contextLength: 272000,
    maxTokens: 128000,
    supportsFunctions: true,
    supportsVision: true,
  },
  {
    id: 'gpt-5-codex',
    name: 'GPT-5 Codex',
    description: 'Legacy codex model',
    contextLength: 272000,
    maxTokens: 128000,
    supportsFunctions: true,
    supportsVision: true,
  },
  {
    id: 'codex-mini-latest',
    name: 'Codex Mini',
    description: 'Fast lightweight codex model',
    contextLength: 272000,
    maxTokens: 128000,
    supportsFunctions: true,
    supportsVision: true,
  },
];

const geminiModels: ProviderModel[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Latest fast Gemini model with thinking',
    contextLength: 1048576,
    maxTokens: 65536,
    supportsFunctions: true,
    supportsVision: true
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Advanced reasoning and analysis',
    contextLength: 1048576,
    maxTokens: 65536,
    supportsFunctions: true,
    supportsVision: true
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: 'Fast and versatile',
    contextLength: 1048576,
    maxTokens: 8192,
    supportsFunctions: true,
    supportsVision: true
  }
];

const zhipuModels: ProviderModel[] = [
  {
    id: 'glm-5',
    name: 'GLM-5',
    description: 'Most capable GLM model for reasoning and coding',
    contextLength: 200000,
    maxTokens: 128000,
    supportsFunctions: true,
    supportsReasoning: true,
    pricing: { input: 1.00, output: 3.20 },
  },
  {
    id: 'glm-4.7',
    name: 'GLM-4.7',
    description: 'High-performance reasoning model',
    contextLength: 200000,
    maxTokens: 128000,
    supportsFunctions: true,
    supportsReasoning: true,
    pricing: { input: 0.60, output: 2.20 },
  },
  {
    id: 'glm-4.7-flash',
    name: 'GLM-4.7 Flash',
    description: 'Fast and free GLM model',
    contextLength: 200000,
    maxTokens: 128000,
    supportsFunctions: true,
    pricing: { input: 0, output: 0 },
  },
  {
    id: 'glm-4.6',
    name: 'GLM-4.6',
    description: 'Balanced performance model',
    contextLength: 200000,
    maxTokens: 128000,
    supportsFunctions: true,
    pricing: { input: 0.60, output: 2.20 },
  },
  {
    id: 'glm-4.6v',
    name: 'GLM-4.6V',
    description: 'Vision model with tool calling support',
    contextLength: 128000,
    maxTokens: 32000,
    supportsFunctions: true,
    supportsVision: true,
    pricing: { input: 0.30, output: 0.90 },
  },
  {
    id: 'glm-4.6v-flash',
    name: 'GLM-4.6V Flash',
    description: 'Fast and free vision model',
    contextLength: 128000,
    maxTokens: 32000,
    supportsFunctions: true,
    supportsVision: true,
    pricing: { input: 0, output: 0 },
  },
];

const minimaxModels: ProviderModel[] = [
  {
    id: 'MiniMax-M2.5',
    name: 'MiniMax M2.5',
    description: 'Most capable model — coding, reasoning, and tool use',
    contextLength: 204800,
    maxTokens: 128000,
    supportsFunctions: true,
    pricing: { input: 0.30, output: 1.20 },
  },
  {
    id: 'MiniMax-M2.5-highspeed',
    name: 'MiniMax M2.5 Highspeed',
    description: 'Faster variant at ~100 tokens/sec',
    contextLength: 204800,
    maxTokens: 128000,
    supportsFunctions: true,
    pricing: { input: 0.60, output: 2.40 },
  },
  {
    id: 'MiniMax-M2.1',
    name: 'MiniMax M2.1',
    description: 'Multi-language programming with 230B params (10B active)',
    contextLength: 204800,
    maxTokens: 128000,
    supportsFunctions: true,
    pricing: { input: 0.30, output: 1.20 },
  },
  {
    id: 'MiniMax-M2.1-highspeed',
    name: 'MiniMax M2.1 Highspeed',
    description: 'Faster M2.1 variant at ~100 tokens/sec',
    contextLength: 204800,
    maxTokens: 128000,
    supportsFunctions: true,
    pricing: { input: 0.60, output: 2.40 },
  },
  {
    id: 'MiniMax-M2',
    name: 'MiniMax M2',
    description: 'Agentic model with function calling and reasoning',
    contextLength: 204800,
    maxTokens: 128000,
    supportsFunctions: true,
    pricing: { input: 0.30, output: 1.20 },
  },
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
    description: 'GPT-4o, GPT-5 and other OpenAI models',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'sk-...',
    apiKeyHelpUrl: 'https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com/v1',
    supportsModelDiscovery: true,
    supportsFunctions: true,
    supportsStreaming: true
  },
  'openai-codex': {
    id: 'openai-codex',
    name: 'Codex (ChatGPT Sub)',
    description: 'Use your ChatGPT subscription — experimental, use at your own risk',
    apiKeyRequired: false,
    baseUrl: 'https://chatgpt.com/backend-api',
    models: codexModels,
    supportsFunctions: true,
    supportsStreaming: true,
    usesOAuth: true
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude Sonnet, Haiku, and Opus models',
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
  huggingface: {
    id: 'huggingface',
    name: 'HuggingFace',
    description: 'Free inference with your HuggingFace account',
    apiKeyRequired: false,
    apiKeyPlaceholder: 'hf_...',
    apiKeyHelpUrl: 'https://huggingface.co/settings/tokens',
    baseUrl: 'https://router.huggingface.co/v1',
    supportsModelDiscovery: true,
    supportsFunctions: true,
    supportsStreaming: true,
    usesOAuth: true,
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
  llamacpp: {
    id: 'llamacpp',
    name: 'llama.cpp',
    description: 'Run GGUF models locally with llama-server',
    apiKeyRequired: false,
    baseUrl: 'http://localhost:8080/v1',
    supportsModelDiscovery: true,
    supportsFunctions: true,
    supportsStreaming: true,
    isLocal: true
  },
  meshllm: {
    id: 'meshllm',
    name: 'mesh-llm',
    description: 'Distributed p2p inference — free open models via shared compute',
    apiKeyRequired: false,
    baseUrl: 'http://localhost:9337/v1',
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
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    description: 'MiniMax M2 models for coding and reasoning',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'Your MiniMax API Key',
    apiKeyHelpUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    baseUrl: 'https://api.minimax.io/v1',
    models: minimaxModels,
    supportsModelDiscovery: false,
    supportsFunctions: true,
    supportsStreaming: true
  },
  zhipu: {
    id: 'zhipu',
    name: 'Zhipu AI',
    description: 'GLM models for reasoning, coding, and vision',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'Your Zhipu AI API Key',
    apiKeyHelpUrl: 'https://z.ai/subscribe',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    models: zhipuModels,
    supportsModelDiscovery: false,
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

export function getDefaultModel(provider: ProviderId): string {
  switch (provider) {
    case 'openrouter':
      return 'minimax/minimax-m2.7';
    case 'openai':
      return 'gpt-4o-mini';
    case 'openai-codex':
      return 'gpt-5.3-codex';
    case 'anthropic':
      return 'claude-haiku-4-5-20251001';
    case 'groq':
      return 'llama-3.3-70b-versatile';
    case 'gemini':
      return 'gemini-2.5-flash';
    case 'huggingface':
      return 'Qwen/Qwen2.5-Coder-32B-Instruct';
    case 'ollama':
      return 'llama3.2:latest';
    case 'lmstudio':
      return 'qwen/qwen3-4b-thinking-2507';
    case 'llamacpp':
      return 'local-model';
    case 'sambanova':
      return 'Meta-Llama-3.3-70B-Instruct';
    case 'zhipu':
      return 'glm-5';
    case 'minimax':
      return 'MiniMax-M2.7';
    default:
      return 'minimax/minimax-m2.7';
  }
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

/**
 * Get the context length for a specific model from the provider registry.
 * Returns undefined if the model isn't in the registry (dynamically discovered).
 */
export function getModelContextLength(providerId: ProviderId, modelId: string): number | undefined {
  const provider = providers[providerId];
  if (!provider?.models) return undefined;
  const model = provider.models.find(m => m.id === modelId);
  return model?.contextLength;
}
