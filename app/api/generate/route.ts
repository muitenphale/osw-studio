import { NextRequest, NextResponse } from 'next/server';
import { ProviderId } from '@/lib/llm/providers/types';
import { getProvider, getDefaultModel } from '@/lib/llm/providers/registry';
import { LLMMessage, ToolDefinition, ContentBlock, TextContentBlock, ImageContentBlock } from '@/lib/llm/types';
import { logger } from '@/lib/utils';
import { handleCodexGeneration } from '@/lib/llm/codex-adapter';

// Helper to extract text content from string or ContentBlock[]
function getTextContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b): b is TextContentBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n');
}

// Parse data URL to extract media type and base64 data
function parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL format');
  }
  return { mediaType: match[1], data: match[2] };
}

// Transform content blocks for Anthropic (requires specific image format)
function toAnthropicContent(content: string | ContentBlock[]): any {
  if (typeof content === 'string') return content;
  return content.map(block => {
    if (block.type === 'text') {
      return { type: 'text', text: block.text };
    }
    // Transform image_url to Anthropic's format
    const { mediaType, data } = parseDataUrl(block.image_url.url);
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data
      }
    };
  });
}

// Transform messages to Gemini format
function toGeminiContents(messages: LLMMessage[]): { contents: any[]; systemInstruction?: any } {
  let systemInstruction: any = undefined;
  const contents: any[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = { parts: [{ text: getTextContent(msg.content) }] };
      continue;
    }

    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts: any[] = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          parts.push({ text: block.text });
        } else if (block.type === 'image_url') {
          try {
            const { mediaType, data } = parseDataUrl(block.image_url.url);
            parts.push({ inline_data: { mime_type: mediaType, data } });
          } catch {
            logger.warn('[API] Failed to parse image data URL for Gemini');
          }
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  return { contents, systemInstruction };
}

// Build Gemini-format request body from the standard OpenAI-format parameters
function buildGeminiRequestBody(
  messages: LLMMessage[],
  options: {
    maxTokens?: number;
    temperature?: number;
    tools?: any[];
    toolChoice?: any;
    reasoning?: any;
  }
): Record<string, unknown> {
  const { contents, systemInstruction } = toGeminiContents(messages);
  const body: Record<string, unknown> = { contents };

  if (systemInstruction) {
    body.system_instruction = systemInstruction;
  }

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.7,
  };

  if (options.reasoning) {
    generationConfig.thinkingConfig = { thinkingBudget: options.reasoning.max_tokens || 4096 };
  }

  body.generationConfig = generationConfig;

  if (options.tools && options.tools.length > 0) {
    body.tools = [{
      function_declarations: options.tools.map((t: any) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    }];
  }

  return body;
}

// Extract images from messages for Ollama (images field at request level)
function extractOllamaImages(messages: LLMMessage[]): { processedMessages: LLMMessage[]; images: string[] } {
  const images: string[] = [];
  const processedMessages = messages.map(m => {
    if (typeof m.content === 'string') return m;

    const textBlocks = m.content.filter((b): b is TextContentBlock => b.type === 'text');
    const imageBlocks = m.content.filter((b): b is ImageContentBlock => b.type === 'image_url');

    // Extract base64 data (without data URL prefix) for each image
    for (const img of imageBlocks) {
      try {
        const { data } = parseDataUrl(img.image_url.url);
        images.push(data);
      } catch {
        logger.warn('[API] Failed to parse image data URL for Ollama');
      }
    }

    return {
      ...m,
      content: textBlocks.map(b => b.text).join('\n')
    };
  });

  return { processedMessages, images };
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, apiKey: clientApiKey, model, tools, context, messages, tool_choice, provider, max_tokens, reasoning, stream: requestStream } = await request.json();

    const selectedProvider: ProviderId = provider || 'openrouter';
    const providerConfig = getProvider(selectedProvider);

    let apiKey = clientApiKey;

    if (!prompt && !messages) {
      return NextResponse.json(
        { error: 'Either prompt or messages is required' },
        { status: 400 }
      );
    }

    if (providerConfig.apiKeyRequired && !apiKey && !providerConfig.usesOAuth) {
      return NextResponse.json(
        { error: `${providerConfig.name} API key is required. Please set it in settings.` },
        { status: 400 }
      );
    }

    let systemPrompt = `You operate in a sandboxed virtual terminal.

Guidelines:
- Create semantic, accessible HTML5; modern CSS3; clean JS (ES6+).
- Use relative paths; keep structure simple; prefer early returns.

Capabilities:
- Two tools: shell({ cmd: string[] }) for commands, write for file editing.
- Edit files reliably with write tool:
  Use EXACT string replacement - copy text precisely from file as seen with cat.
  oldStr must be unique; JSON escaping handled automatically.
- Supported shell commands: ls, cat, nl [-ba], grep (-n -i), find (-name), mkdir -p, rm [-rfv], rmdir [-v], mv, cp [-r], echo, sed [-i] 's/pat/repl/[g]'.
- Shell supports pipes (|), redirects (> >>), and && chaining.
- No network; only /workspace paths exist.
  • Note: both '/path' and '/workspace/path' are accepted; '/workspace' is normalized to '/'.

Habits:
- Read with ls/cat/grep/find before editing.
- Persist file content changes with write tool or sed -i; use mv/rm/mkdir/cp for structure.
- Use write operations in priority order:
  1. PREFER "replace_entity" for HTML elements, functions, components (more reliable)
  2. Use "update" only for simple text changes without clear entity boundaries  
  3. Use "rewrite" for complete file replacement
- AVOID large oldStr blocks (50+ lines) - use replace_entity instead for code blocks.
- Keep changes small and atomic.`;

    if (context?.fileTree) {
      systemPrompt += `\n\nCurrent project structure:\n${context.fileTree}`;
    }

    if (context?.existingFiles && Array.isArray(context.existingFiles)) {
      systemPrompt += `\n\nExisting files (modify via write; use mv/rm for structure):\n${context.existingFiles.join('\n')}`;
    }

    if (context?.mainFiles && Object.keys(context.mainFiles).length > 0) {
      systemPrompt += `\n\nCurrent file contents (use exact text when crafting write operations):`;
      for (const [path, content] of Object.entries(context.mainFiles)) {
        const contentStr = String(content);
        const truncatedContent = contentStr.length > 1000 ? contentStr.substring(0, 1000) + '\n... (truncated)' : contentStr;
        systemPrompt += `\n\n=== ${path} ===\n${truncatedContent}`;
      }
    }

    if (context?.instructions) {
      systemPrompt += `\n\nAdditional instructions:\n${context.instructions}`;
    }

    const chatMessages = messages || [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];
    
    if (messages && !messages.some((m: LLMMessage) => m.role === 'system')) {
      chatMessages.unshift({ role: 'system', content: systemPrompt });
    }

    // --- Codex provider: delegate entirely to codex-adapter ---
    if (selectedProvider === 'openai-codex') {
      // Validate tools before passing to Codex
      const validTools = tools?.filter((tool: { name?: string; description?: string; parameters?: unknown }) => {
        if (!tool.name || tool.name.trim() === '') return false;
        return true;
      });

      return handleCodexGeneration({
        messages: chatMessages,
        model: model || 'gpt-5.3-codex',
        tools: validTools?.length > 0 ? validTools : undefined,
        accessToken: apiKey,
      });
    }

    const headers = buildHeaders(selectedProvider, apiKey, request, providerConfig);
    
    let processedMessages = chatMessages;
    let anthropicSystemPrompt = '';
    
    if (selectedProvider === 'anthropic') {
      const systemMessage = chatMessages.find((msg: LLMMessage) => msg.role === 'system');
      if (systemMessage) {
        anthropicSystemPrompt = getTextContent(systemMessage.content);
      }
      
      processedMessages = [];
      let currentUserMessage: any = null;
      
      for (const msg of chatMessages) {
        if (msg.role === 'system') {
          continue;
        } else if (msg.role === 'tool') {
          if (currentUserMessage && currentUserMessage.role === 'user') {
            if (!Array.isArray(currentUserMessage.content)) {
              currentUserMessage = {
                ...currentUserMessage,
                content: [{ type: 'text', text: currentUserMessage.content }]
              };
            }
            currentUserMessage.content.push({
              type: 'tool_result',
              tool_use_id: msg.tool_call_id,
              content: msg.content
            });
          } else {
            currentUserMessage = {
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: msg.tool_call_id,
                content: msg.content
              }]
            };
          }
        } else {
          if (currentUserMessage && currentUserMessage.role === 'user') {
            processedMessages.push(currentUserMessage);
          }
          
          if (msg.role === 'assistant' && msg.tool_calls) {
            const content = [];
            if (msg.content) {
              content.push({ type: 'text', text: msg.content });
            }
            for (const toolCall of msg.tool_calls) {
              content.push({
                type: 'tool_use',
                id: toolCall.id,
                name: toolCall.function.name,
                input: JSON.parse(toolCall.function.arguments || '{}')
              });
            }

            currentUserMessage = {
              role: 'assistant',
              content: content
            };
          } else {
            // Ensure non-empty content for Anthropic
            const messageContent = msg.content || '';
            if (!messageContent && msg.role === 'assistant') {
              // Skip empty assistant messages (Anthropic rejects them)
              currentUserMessage = null;
            } else if (msg.role === 'user' && typeof msg.content !== 'string') {
              // Handle multimodal user messages - transform to Anthropic format
              currentUserMessage = {
                ...msg,
                content: toAnthropicContent(msg.content)
              };
            } else {
              currentUserMessage = { ...msg };
            }
          }
          
          if (msg.role !== 'user' && currentUserMessage) {
            processedMessages.push(currentUserMessage);
            currentUserMessage = null;
          }
        }
      }
      
      if (currentUserMessage && currentUserMessage.role === 'user') {
        processedMessages.push(currentUserMessage);
      }
    }

    // Handle Ollama images - extract to request level
    let ollamaImages: string[] = [];
    if (selectedProvider === 'ollama') {
      const { processedMessages: ollamaMessages, images } = extractOllamaImages(processedMessages);
      processedMessages = ollamaMessages;
      ollamaImages = images;
    }

    const streamEnabled = requestStream !== false;
    const apiEndpoint = getApiEndpoint(selectedProvider, providerConfig, model, { apiKey, stream: streamEnabled });

    // --- Gemini: build entirely different request body ---
    if (selectedProvider === 'gemini') {
      // Validate tools if present
      let validTools: any[] = [];
      if (tools && tools.length > 0) {
        validTools = tools.filter((tool: { name?: string }) => tool.name && tool.name.trim() !== '');
        if (validTools.length === 0) {
          return NextResponse.json(
            { error: 'All tools are invalid. Tools must have a name field.' },
            { status: 400 }
          );
        }
      }

      const modelName = model || '';
      const needsReasoning = modelName.includes('thinking') || modelName.includes('2.5') || modelName.includes('3-pro');
      const geminiBody = buildGeminiRequestBody(processedMessages, {
        maxTokens: max_tokens,
        temperature: 0.7,
        tools: validTools.length > 0 ? validTools : undefined,
        reasoning: needsReasoning ? { max_tokens: 4096 } : undefined,
      });

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(geminiBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let cleanError = errorText;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.error?.message) cleanError = parsed.error.message;
        } catch {
          if (errorText.trimStart().startsWith('<!') || errorText.trimStart().startsWith('<html')) {
            cleanError = `HTTP ${response.status} — ${response.statusText || 'check your API key and try again'}`;
          }
        }
        return NextResponse.json(
          { error: `Google Gemini API error: ${cleanError}` },
          { status: response.status }
        );
      }

      if (!streamEnabled) {
        const data = await response.json();
        return NextResponse.json(data);
      }

      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // --- All other providers: OpenAI-compatible request body ---
    const requestBody: Record<string, unknown> = {
      model: model || getDefaultModel(selectedProvider),
      messages: processedMessages,
      stream: streamEnabled
    };

    // Add images for Ollama at request level
    if (selectedProvider === 'ollama' && ollamaImages.length > 0) {
      requestBody.images = ollamaImages;
    }

    if (selectedProvider === 'anthropic' && anthropicSystemPrompt) {
      requestBody.system = anthropicSystemPrompt;
    }

    if (tools && tools.length > 0) {
      // Validate tools to ensure all required fields are present
      const validTools = tools.filter((tool: { name?: string; description?: string; parameters?: unknown }) => {
        if (!tool.name || tool.name.trim() === '') {
          logger.error('[API] Tool missing required "name" field:', tool);
          return false;
        }
        if (!tool.description) {
          logger.warn('[API] Tool missing "description" field:', tool.name);
        }
        if (!tool.parameters) {
          logger.warn('[API] Tool missing "parameters" field:', tool.name);
        }
        return true;
      });

      if (validTools.length === 0) {
        return NextResponse.json(
          { error: 'All tools are invalid. Tools must have a name field.' },
          { status: 400 }
        );
      }

      if (selectedProvider === 'anthropic') {
        requestBody.tools = validTools.map((tool: { name: string; description: string; parameters: unknown }) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters
        }));
        if (tool_choice && typeof tool_choice === 'object') {
          requestBody.tool_choice = tool_choice;
        } else if (tool_choice === 'auto' || !tool_choice) {
          requestBody.tool_choice = { type: 'auto' };
        } else if (tool_choice === 'any') {
          requestBody.tool_choice = { type: 'any' };
        } else if (typeof tool_choice === 'string') {
          requestBody.tool_choice = { type: 'tool', name: tool_choice };
        } else {
          requestBody.tool_choice = { type: 'auto' };
        }
      } else {
        requestBody.tools = validTools.map((tool: { name: string; description: string; parameters: unknown }) => ({
          type: 'function',
          function: tool
        }));
        requestBody.tool_choice = tool_choice || 'auto';
      }
    }

    if (selectedProvider === 'openai') {
      requestBody.max_completion_tokens = max_tokens || 4096;

      const modelName = model || getDefaultModel(selectedProvider);
      if (modelName.includes('gpt-5-nano')) {
        // gpt-5-nano requires temperature=1; other values cause API errors
        requestBody.temperature = 1;
      } else {
        requestBody.temperature = 0.7;
      }
    } else if (selectedProvider === 'anthropic') {
      requestBody.max_tokens = max_tokens || 4096;
      requestBody.temperature = 0.7;
    } else {
      requestBody.max_tokens = max_tokens || 4096;
      requestBody.temperature = 0.7;
    }

    // Enable reasoning for models that support it
    const modelName = model || '';

    // Handle client-requested reasoning (for models that support toggleable reasoning)
    if (reasoning && selectedProvider === 'openrouter') {
      requestBody.reasoning = reasoning;
    }
    if (reasoning && selectedProvider === 'zhipu') {
      requestBody.thinking = { type: 'enabled' };
    }

    // DeepSeek V3.2+ models - some providers (e.g., AtlasCloud) may have issues with tool calling
    // Route to DeepSeek's native API for better reliability
    const isDeepSeekV3_2 = modelName.includes('deepseek') && modelName.includes('v3.2');
    if (selectedProvider === 'openrouter' && isDeepSeekV3_2) {
      // Use provider routing to prefer DeepSeek's native endpoint
      requestBody.provider = {
        order: ['DeepSeek'],  // Provider name from endpoints API
        allow_fallbacks: true
      };
    }

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Try to parse and extract clean error message from JSON response
      let cleanError = errorText;
      try {
        const parsed = JSON.parse(errorText);
        // OpenRouter nested error structure: { error: { message: "...", metadata: { raw: "..." } } }
        if (parsed.error?.message) {
          cleanError = parsed.error.message;
          // Check for more detailed error in metadata.raw (OpenRouter provider errors)
          if (parsed.error.metadata?.raw) {
            try {
              const rawError = JSON.parse(parsed.error.metadata.raw);
              if (rawError.error?.message) {
                cleanError = `${parsed.error.message}: ${rawError.error.message}`;
              }
            } catch {
              // raw isn't JSON, append as-is if it adds info
              if (parsed.error.metadata.raw !== parsed.error.message) {
                cleanError = `${parsed.error.message} (${parsed.error.metadata.raw})`;
              }
            }
          }
          // Also check for provider_name in metadata
          if (parsed.error.metadata?.provider_name) {
            cleanError = `[${parsed.error.metadata.provider_name}] ${cleanError}`;
          }
        } else if (typeof parsed.error === 'string') {
          cleanError = parsed.error;
        }
        // Log full error for debugging
        logger.error('[API] Provider error details:', JSON.stringify(parsed, null, 2));
      } catch {
        // Not JSON — check if it's HTML (provider returned a web page instead of API error)
        if (errorText.trimStart().startsWith('<!') || errorText.trimStart().startsWith('<html')) {
          cleanError = `HTTP ${response.status} — ${response.statusText || 'check your API key and try again'}`;
        }
        logger.error('[API] Provider error (raw):', errorText.slice(0, 500));
      }

      const rateLimitHeaders: Record<string, string> = {};
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const rateLimitReset = response.headers.get('X-RateLimit-Reset');
        const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');

        if (retryAfter) rateLimitHeaders['Retry-After'] = retryAfter;
        if (rateLimitReset) rateLimitHeaders['X-RateLimit-Reset'] = rateLimitReset;
        if (rateLimitRemaining) rateLimitHeaders['X-RateLimit-Remaining'] = rateLimitRemaining;
      }
      // HuggingFace credit exhaustion
      if (selectedProvider === 'huggingface' && (
        cleanError.includes('exceeded your monthly included credits') ||
        cleanError.includes('reached the free monthly usage limit') ||
        cleanError.includes('rate limit') ||
        response.status === 402 ||
        (response.status === 429 && cleanError.includes('limit'))
      )) {
        return NextResponse.json(
          { error: 'HuggingFace free credits exhausted. You get $0.10/month in free inference. Upgrade at huggingface.co/pricing or wait for your credits to reset.' },
          { status: 429 }
        );
      }

      if (providerConfig.isLocal && cleanError.includes('does not support tools') && tools && tools.length > 0) {
        const fallbackSystemPrompt = systemPrompt + `

IMPORTANT: This model doesn't support native function calling, so you must use JSON format for tool calls.

Available tools:
${tools.map((tool: ToolDefinition) => `
- ${tool.name}: ${tool.description}
  Parameters: ${JSON.stringify(tool.parameters, null, 2)}
`).join('')}

When you need to use a tool, respond with:
\`\`\`json
{
  "tool_calls": [
    {
      "id": "call_1",
      "function": {
        "name": "tool_name",
        "arguments": "{\"param1\": \"value1\"}"
      }
    }
  ]
}
\`\`\`

You can make multiple tool calls in a single response. Always include the tool_calls array even for a single tool call.`;

        const fallbackMessages = [...chatMessages];
        const systemMsgIndex = fallbackMessages.findIndex(m => m.role === 'system');
        if (systemMsgIndex >= 0) {
          fallbackMessages[systemMsgIndex].content = fallbackSystemPrompt;
        }

        const fallbackBody: any = {
          ...requestBody,
          messages: fallbackMessages
        };
        delete fallbackBody.tools;
        delete fallbackBody.tool_choice;

        const fallbackResponse = await fetch(apiEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(fallbackBody)
        });

        if (!fallbackResponse.ok) {
          let fallbackError = await fallbackResponse.text();
          if (fallbackError.trimStart().startsWith('<!') || fallbackError.trimStart().startsWith('<html')) {
            fallbackError = `HTTP ${fallbackResponse.status} — ${fallbackResponse.statusText || 'unknown error'}`;
          }
          return NextResponse.json(
            { error: `${providerConfig.name} API error (after fallback): ${fallbackError}` },
            { status: fallbackResponse.status }
          );
        }

        const fallbackHeaders: Record<string, string> = {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Tool-Fallback': 'json-parsing'
        };

        return new Response(fallbackResponse.body, {
          headers: fallbackHeaders,
        });
      }

      return NextResponse.json(
        { error: `${providerConfig.name} API error: ${cleanError}` },
        { status: response.status, headers: rateLimitHeaders }
      );
    }

    // Non-streaming: return JSON directly
    if (!streamEnabled) {
      const data = await response.json();
      return NextResponse.json(data);
    }

    const responseHeaders: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    };

    if (selectedProvider === 'openrouter') {
      const openRouterHeaders = [
        'x-openrouter-generation-id',
        'x-openrouter-usage',
        'x-openrouter-tokens',
        'x-openrouter-cost'
      ];

      for (const headerName of openRouterHeaders) {
        const value = response.headers.get(headerName);
        if (value) {
          responseHeaders[headerName] = value;
        }
      }
    }

    return new Response(response.body, {
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isNetwork = /fetch failed|Failed to fetch|NetworkError/i.test(message);
    const friendly = isNetwork
      ? 'Network error: unable to reach the model API. Check your internet connection or proxy settings.'
      : message;
    return NextResponse.json(
      { error: friendly },
      { status: isNetwork ? 503 : 500 }
    );
  }
}

function getApiEndpoint(provider: ProviderId, config: ReturnType<typeof getProvider>, model?: string, options?: { apiKey?: string; stream?: boolean }): string {
  const baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';

  if (provider === 'anthropic') {
    return 'https://api.anthropic.com/v1/messages';
  } else if (provider === 'gemini') {
    const geminiModel = model || 'gemini-2.5-flash';
    const action = options?.stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const key = options?.apiKey ? `${options.stream ? '&' : '?'}key=${options.apiKey}` : '';
    return `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:${action}${key}`;
  } else {
    return `${baseUrl}/chat/completions`;
  }
}

function buildHeaders(
  provider: ProviderId, 
  apiKey: string | undefined,
  request: NextRequest,
  config: ReturnType<typeof getProvider>
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey || '';
    headers['anthropic-version'] = '2023-06-01';
    if (config.supportsFunctions) {
      headers['anthropic-beta'] = 'tools-2024-04-04';
    }
  } else if (provider === 'gemini') {
    // Gemini uses query-param key auth; no auth headers needed
  } else {
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = request.headers.get('referer') || 'http://localhost:3000';
      headers['X-Title'] = 'OSW-Studio';
    }
  }
  
  return headers;
}
