/**
 * Codex Adapter — Server-side format conversion between
 * Chat Completions API and the Codex Responses API.
 *
 * All transformations happen here so the client streaming parser,
 * orchestrator, and UI remain unchanged.
 */

import { LLMMessage, ContentBlock, TextContentBlock } from './types';
import { logger } from '@/lib/utils';

// --- Package imports (cherry-picked utilities) ---
import { decodeJWT } from '@spmurrayzzz/opencode-openai-codex-auth/dist/lib/auth/auth.js';
import { createCodexHeaders, handleErrorResponse } from '@spmurrayzzz/opencode-openai-codex-auth/dist/lib/request/fetch-helpers.js';
import { getReasoningConfig } from '@spmurrayzzz/opencode-openai-codex-auth/dist/lib/request/request-transformer.js';
import { getNormalizedModel } from '@spmurrayzzz/opencode-openai-codex-auth/dist/lib/request/helpers/model-map.js';
import { CODEX_BASE_URL, JWT_CLAIM_PATH } from '@spmurrayzzz/opencode-openai-codex-auth/dist/lib/constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CodexInputItem {
  type: string;
  role?: string;
  content?: unknown;
  name?: string;
  call_id?: string;
  arguments?: string;
  output?: string;
  [key: string]: unknown;
}

interface CodexTool {
  type: 'function';
  name: string;
  description: string;
  parameters: unknown;
}

interface ChatCompletionsTool {
  name: string;
  description: string;
  parameters: unknown;
}

// ---------------------------------------------------------------------------
// 1. Message conversion: Chat Completions → Responses API input
// ---------------------------------------------------------------------------

function getTextFromContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b): b is TextContentBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n');
}

/**
 * Convert Chat Completions messages to Responses API `input` array.
 * System messages are extracted separately as `instructions`.
 */
export function messagesToCodexInput(
  messages: LLMMessage[]
): { input: CodexInputItem[]; systemPrompt: string } {
  let systemPrompt = '';
  const input: CodexInputItem[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Collect system prompts into instructions
      systemPrompt += (systemPrompt ? '\n\n' : '') + getTextFromContent(msg.content);
      continue;
    }

    if (msg.role === 'user') {
      const text = getTextFromContent(msg.content);
      input.push({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      });
      continue;
    }

    if (msg.role === 'assistant') {
      // If there are tool_calls, emit each as a separate function_call item
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Emit text content first if present
        const text = getTextFromContent(msg.content);
        if (text) {
          input.push({
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text }],
          });
        }
        for (const tc of msg.tool_calls) {
          input.push({
            type: 'function_call',
            name: tc.function.name,
            call_id: tc.id,
            arguments: tc.function.arguments,
          });
        }
      } else {
        const text = getTextFromContent(msg.content);
        input.push({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        });
      }
      continue;
    }

    if (msg.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: msg.tool_call_id || '',
        output: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      });
      continue;
    }
  }

  return { input, systemPrompt };
}

// ---------------------------------------------------------------------------
// 2. Tool conversion: Chat Completions → Responses API format
// ---------------------------------------------------------------------------

export function toolsToCodexFormat(
  tools: ChatCompletionsTool[]
): CodexTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

// ---------------------------------------------------------------------------
// 3. Build full Codex request body
// ---------------------------------------------------------------------------

export function buildCodexRequestBody(opts: {
  model: string;
  input: CodexInputItem[];
  tools?: CodexTool[];
  instructions: string;
}): Record<string, unknown> {
  // Use package normalizeModel only for models it knows about.
  // For newer models (e.g. gpt-5.3-codex) not yet in the package's MODEL_MAP,
  // pass through as-is to avoid mangling.
  const knownMapping = getNormalizedModel(opts.model);
  const modelId = knownMapping || opts.model;
  const reasoning = getReasoningConfig(opts.model);

  const body: Record<string, unknown> = {
    model: modelId,
    input: opts.input,
    instructions: opts.instructions,
    store: false,
    stream: true,
    reasoning,
    text: { verbosity: 'medium' },
    include: ['reasoning.encrypted_content'],
  };

  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = 'auto';
  }

  return body;
}

// ---------------------------------------------------------------------------
// 4. Extract account ID from JWT access token
// ---------------------------------------------------------------------------

export function getCodexAccountId(accessToken: string): string {
  const decoded = decodeJWT(accessToken);
  if (!decoded) {
    throw new Error('Failed to decode Codex access token');
  }
  const accountId = decoded?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
  if (!accountId) {
    throw new Error('Failed to extract chatgpt_account_id from token');
  }
  return accountId;
}

// ---------------------------------------------------------------------------
// 5. SSE Transformer: Responses API → Chat Completions format
// ---------------------------------------------------------------------------

/**
 * Creates a TransformStream that reads Responses API SSE events and
 * outputs Chat Completions–compatible SSE events.
 *
 * The client-side streaming parser expects:
 *   data: {"choices":[{"index":0,"delta":{"content":"..."},"finish_reason":null}]}
 *   data: {"choices":[{"index":0,"delta":{"tool_calls":[...]},"finish_reason":null}]}
 *   data: [DONE]
 */
export function createCodexToCompletionsTransformer(): TransformStream<Uint8Array, Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Track tool call indices keyed by call_id
  let toolCallIndex = 0;
  const toolCallIndices = new Map<string, number>();

  // Buffer for incomplete SSE lines
  let buffer = '';
  let doneEmitted = false;

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      // Keep last (possibly incomplete) line in buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('event:')) continue; // Skip event type lines

        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') {
          if (dataStr === '[DONE]' && !doneEmitted) {
            doneEmitted = true;
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          }
          continue;
        }

        let event: any;
        try {
          event = JSON.parse(dataStr);
        } catch {
          // Not JSON, skip
          continue;
        }

        const eventType: string = event.type || '';

        // --- Text content delta ---
        if (eventType === 'response.output_text.delta') {
          const delta = event.delta ?? '';
          const completionsChunk = {
            choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(completionsChunk)}\n\n`));
          continue;
        }

        // --- New output item: function_call ---
        if (eventType === 'response.output_item.added') {
          const item = event.item;
          if (item?.type === 'function_call') {
            const callId = item.call_id || item.id || `call_${toolCallIndex}`;
            const idx = toolCallIndex++;
            toolCallIndices.set(callId, idx);
            if (item.id && item.id !== callId) toolCallIndices.set(item.id, idx);
            if (item.call_id && item.call_id !== callId) toolCallIndices.set(item.call_id, idx);

            const completionsChunk = {
              choices: [{
                index: 0,
                delta: {
                  tool_calls: [{
                    index: idx,
                    id: callId,
                    type: 'function',
                    function: {
                      name: item.name || '',
                      arguments: '',
                    },
                  }],
                },
                finish_reason: null,
              }],
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(completionsChunk)}\n\n`));
          }
          continue;
        }

        // --- Function call arguments delta ---
        if (eventType === 'response.function_call_arguments.delta') {
          const callId = event.call_id || event.item_id || '';
          const idx = toolCallIndices.get(callId) ?? (event.output_index ?? 0);
          const argDelta = event.delta ?? '';

          const completionsChunk = {
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: idx,
                  function: { arguments: argDelta },
                }],
              },
              finish_reason: null,
            }],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(completionsChunk)}\n\n`));
          continue;
        }

        // --- Response completed ---
        if (eventType === 'response.completed' || eventType === 'response.done') {
          if (doneEmitted) continue;
          doneEmitted = true;

          const response = event.response || event;
          const hasToolCalls = toolCallIndex > 0;
          const finishReason = hasToolCalls ? 'tool_calls' : 'stop';

          // Emit usage if available
          const usage = response.usage;
          const completionsChunk: Record<string, unknown> = {
            choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
          };
          if (usage) {
            completionsChunk.usage = {
              prompt_tokens: usage.input_tokens ?? 0,
              completion_tokens: usage.output_tokens ?? 0,
              total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
            };
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(completionsChunk)}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          continue;
        }

        // Skip other events silently (reasoning, metadata, etc.)
      }
    },

    flush(controller) {
      if (buffer.trim() && !doneEmitted) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') {
            doneEmitted = true;
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          }
        }
      }
    },
  });
}

// ---------------------------------------------------------------------------
// 6. Main handler — called from the API route
// ---------------------------------------------------------------------------

export async function handleCodexGeneration(opts: {
  messages: LLMMessage[];
  model: string;
  tools?: ChatCompletionsTool[];
  accessToken: string;
}): Promise<Response> {
  const { messages, model, tools, accessToken } = opts;

  // 1. Extract account ID from JWT
  let accountId: string;
  try {
    accountId = getCodexAccountId(accessToken);
  } catch (err) {
    logger.error('[Codex] Failed to extract account ID:', err);
    return new Response(
      JSON.stringify({ error: 'Invalid Codex access token — could not extract account ID. Try re-authenticating.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. Convert messages & tools
  const { input, systemPrompt } = messagesToCodexInput(messages);
  const codexTools = tools ? toolsToCodexFormat(tools) : undefined;

  // 3. Build request body
  const body = buildCodexRequestBody({
    model,
    input,
    tools: codexTools,
    instructions: systemPrompt,
  });

  // 4. Build headers using package utility
  const headers: Headers = createCodexHeaders(undefined, accountId, accessToken);
  headers.set('Content-Type', 'application/json');

  // 5. POST to Codex backend
  const url = `${CODEX_BASE_URL}/codex/responses`;
  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.error('[Codex] Network error:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to reach Codex backend. Check your network connection.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 6. Handle errors — flatten package's nested format to { error: "string" }
  if (!response.ok) {
    let errorMessage = `Codex API error (${response.status})`;
    try {
      const errorResponse = await handleErrorResponse(response);
      const errorBody = await errorResponse.text();
      const parsed = JSON.parse(errorBody);
      // Package returns { error: { message, friendly_message, rate_limits, status } }
      // Client expects { error: "string" }
      if (parsed.error) {
        const err = parsed.error;
        // Build a concise user-facing message
        const resetsAt = err.rate_limits?.primary?.resets_at || err.rate_limits?.secondary?.resets_at;
        const mins = resetsAt ? Math.max(0, Math.round((resetsAt * 1000 - Date.now()) / 60000)) : undefined;
        const suffix = mins !== undefined ? ` Try again in ~${mins} min.` : '';
        if (/usage_limit|rate_limit/i.test(err.code || err.type || err.message || '')) {
          errorMessage = `Currently selected model reported a usage limit.${suffix}`;
        } else {
          errorMessage = err.message || errorMessage;
        }
      }
    } catch {
      // Fall through with default message
    }
    logger.error('[Codex] API error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: response.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 7. Pipe through SSE transformer
  if (!response.body) {
    return new Response(
      JSON.stringify({ error: 'Codex response has no body' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const transformer = createCodexToCompletionsTransformer();
  const transformedStream = response.body.pipeThrough(transformer);

  return new Response(transformedStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
