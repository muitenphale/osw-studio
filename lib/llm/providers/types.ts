/**
 * Provider-specific types and interfaces
 */

export type ProviderId =
  | 'openrouter'
  | 'openai'
  | 'openai-codex'
  | 'anthropic'
  | 'groq'
  | 'gemini'
  | 'ollama'
  | 'lmstudio'
  | 'sambanova';

export interface ProviderModel {
  id: string;
  name: string;
  description?: string;
  contextLength: number;
  maxTokens?: number;
  supportsFunctions?: boolean;
  supportsVision?: boolean;
  supportsReasoning?: boolean;  // Model supports toggleable reasoning (thinking tokens)
  pricing?: {
    input: number;  // per 1M tokens
    output: number; // per 1M tokens
    reasoning?: number;
  };
}

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  description: string;
  icon?: string;
  apiKeyRequired: boolean;
  apiKeyPlaceholder?: string;
  apiKeyHelpUrl?: string;
  baseUrl?: string;
  customHeaders?: Record<string, string>;
  models?: ProviderModel[];
  supportsModelDiscovery?: boolean;
  supportsFunctions?: boolean;
  supportsStreaming?: boolean;
  isLocal?: boolean;
  usesOAuth?: boolean;
}

export interface CodexAuthData {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // Unix timestamp in seconds
  user_email?: string;
}

export interface ProviderSettings {
  selectedProvider: ProviderId;
  providerKeys: Partial<Record<ProviderId, string>>;
  providerModels: Partial<Record<ProviderId, string>>;
}
