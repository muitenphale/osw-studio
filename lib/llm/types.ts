// Content block types for multimodal messages
export type TextContentBlock = {
  type: 'text';
  text: string;
};

export type ImageContentBlock = {
  type: 'image_url';
  image_url: {
    url: string;  // URL or data:image/...;base64,...
    detail?: 'auto' | 'low' | 'high';
  };
};

export type ContentBlock = TextContentBlock | ImageContentBlock;

export interface ToolParameter {
  type?: string;
  description?: string;
  enum?: string[];
  items?: {
    type: string;
    properties?: Record<string, ToolParameter>;
  };
  oneOf?: ToolParameter[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

export interface FileContext {
  projectId: string;
  fileTree?: string;
  currentFiles?: string[];
  openFile?: string;
}

// Reasoning detail from OpenRouter (Gemini thinking models)
export interface ReasoningDetail {
  type: string;
  text?: string;
  summary?: string;
  signature?: string;
  id?: string;
  format?: string;
  index?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];  // String or array of content blocks (for multimodal)
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning_details?: ReasoningDetail[];  // For Gemini thinking models - MUST be preserved
}

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface OpenRouterResponse {
  choices: Array<{
    message: {
      content?: string;
      tool_calls?: Array<{
        id: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number; // In USD, either from API or calculated
  cachedTokens?: number;
  reasoningTokens?: number;
  model?: string;
  provider?: string;
  generationId?: string; // OpenRouter generation ID for accurate cost tracking
  isEstimated?: boolean; // Flag to indicate if cost is estimated vs actual
}

export interface StreamChunk {
  type: 'content' | 'tool_call' | 'done' | 'usage';
  content?: string;
  toolCall?: ToolCall;
  usage?: UsageInfo;
}