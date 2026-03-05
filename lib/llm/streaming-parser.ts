/**
 * Streaming Parser - Handles LLM streaming response parsing
 * Extracted from original orchestrator for reuse
 */

import { ToolCall, UsageInfo, ReasoningDetail } from './types';
import { logger } from '../utils';
import { VirtualFile } from '@/lib/vfs';

// Re-export for consumers that import from streaming-parser
export type { ReasoningDetail };

export interface StreamResponse {
  content?: string;
  reasoning?: string;       // Accumulated reasoning/thinking content
  toolCalls?: ToolCall[];
  usage?: UsageInfo;
  wasTruncated?: boolean;   // True if response was cut off due to max_tokens
  finishReason?: string;    // The actual finish reason from the API
  reasoningDetails?: ReasoningDetail[];  // Gemini reasoning blocks with signatures
}

export interface StreamParserOptions {
  provider: string;
  model: string;
  suppressAssistantDelta?: boolean;
  onProgress?: (event: string, data?: any) => void;
}

/**
 * Parse streaming response from LLM
 * Handles Anthropic, OpenAI, and OpenRouter formats
 *
 * Progress events emit only deltas (new text), never cumulative snapshots,
 * to avoid O(N²) memory/render cost on the consumer side.
 */
export async function parseStreamingResponse(
  response: Response,
  options: StreamParserOptions
): Promise<StreamResponse> {
  const { provider, suppressAssistantDelta = false, onProgress } = options;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';  // Separate buffer for reasoning/thinking tokens
  const toolCallsById: Record<string, ToolCall> = {};
  let currentToolCall: Partial<ToolCall> | null = null;
  let toolCallBuffer = '';
  let usageInfo: UsageInfo | undefined;
  let wasTruncated = false;
  let lastFinishReason: string | undefined;
  let reasoningDetails: ReasoningDetail[] = [];  // For Gemini thinking models

  // State for extracting inline <think>...</think> blocks (MiniMax, Ollama thinking models, etc.)
  let inThinkBlock = false;
  let thinkTagBuffer = '';

  /**
   * Split a content piece into regular content and reasoning, handling
   * <think>...</think> tags that may span across streaming chunks.
   */
  function splitThinkTags(piece: string): { content: string; reasoning: string } {
    const text = thinkTagBuffer + piece;
    thinkTagBuffer = '';
    let contentOut = '';
    let reasoningOut = '';
    let pos = 0;

    while (pos < text.length) {
      if (!inThinkBlock) {
        const idx = text.indexOf('<think>', pos);
        if (idx === -1) {
          // Check if text ends with a partial "<think>" prefix
          for (let k = Math.min(6, text.length - pos); k >= 1; k--) {
            if ('<think>'.startsWith(text.slice(text.length - k))) {
              contentOut += text.slice(pos, text.length - k);
              thinkTagBuffer = text.slice(text.length - k);
              return { content: contentOut, reasoning: reasoningOut };
            }
          }
          contentOut += text.slice(pos);
          return { content: contentOut, reasoning: reasoningOut };
        }
        contentOut += text.slice(pos, idx);
        inThinkBlock = true;
        pos = idx + 7; // '<think>'.length
        if (pos < text.length && text[pos] === '\n') pos++;
      } else {
        const idx = text.indexOf('</think>', pos);
        if (idx === -1) {
          // Check if text ends with a partial "</think>" prefix
          for (let k = Math.min(8, text.length - pos); k >= 1; k--) {
            if ('</think>'.startsWith(text.slice(text.length - k))) {
              reasoningOut += text.slice(pos, text.length - k);
              thinkTagBuffer = text.slice(text.length - k);
              return { content: contentOut, reasoning: reasoningOut };
            }
          }
          reasoningOut += text.slice(pos);
          return { content: contentOut, reasoning: reasoningOut };
        }
        reasoningOut += text.slice(pos, idx);
        inThinkBlock = false;
        pos = idx + 8; // '</think>'.length
        while (pos < text.length && text[pos] === '\n') pos++;
      }
    }

    return { content: contentOut, reasoning: reasoningOut };
  }

  // For Anthropic: track partial JSON building and thinking blocks
  const anthropicToolBuffers: Record<string, string> = {};
  const contentBlockIndexToToolId: Record<number, string> = {};
  let anthropicThinkingBlockIndex: number | null = null;  // Track active thinking block

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        // Skip SSE comments
        if (line.startsWith(':')) {
          continue;
        }

        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            if (currentToolCall && toolCallBuffer && currentToolCall.function && currentToolCall.id) {
              currentToolCall.function.arguments = toolCallBuffer;
              toolCallsById[currentToolCall.id] = currentToolCall as ToolCall;
            }
            break;
          }

          try {
            const json = JSON.parse(data);

            if (provider === 'anthropic') {
              // Handle Anthropic streaming format
              // Check for Anthropic stop reasons
              if (json.type === 'message_delta' && json.delta?.stop_reason) {
                lastFinishReason = json.delta.stop_reason;
                // 'max_tokens' is Anthropic's equivalent of 'length'
                if (json.delta.stop_reason === 'max_tokens') {
                  wasTruncated = true;
                  logger.warn('[StreamParser] Response truncated due to max_tokens limit (Anthropic)');
                }
              }

              // Handle Anthropic extended thinking (thinking content blocks)
              if (json.type === 'content_block_start' && json.content_block?.type === 'thinking') {
                anthropicThinkingBlockIndex = json.index;
                if (!suppressAssistantDelta) {
                  onProgress?.('reasoning_start', {});
                }
              } else if (json.type === 'content_block_delta' && json.delta?.type === 'thinking_delta') {
                const piece = json.delta.thinking as string;
                reasoning += piece;
                if (!suppressAssistantDelta) {

                  onProgress?.('reasoning_delta', { text: piece });
                }
              } else if (json.type === 'content_block_stop' && json.index === anthropicThinkingBlockIndex) {
                anthropicThinkingBlockIndex = null;
                if (!suppressAssistantDelta) {
                  onProgress?.('reasoning_complete', { reasoning });
                }
              } else if (json.type === 'content_block_delta' && json.delta?.text_delta?.text) {
                const piece = json.delta.text_delta.text as string;
                content += piece;

                if (!suppressAssistantDelta) onProgress?.('assistant_delta', { text: piece });
              } else if (json.type === 'content_block_start' && json.content_block?.type === 'tool_use') {
                const toolCall = {
                  id: json.content_block.id,
                  type: 'function' as const,
                  function: {
                    name: json.content_block.name,
                    arguments: ''
                  }
                };
                toolCallsById[json.content_block.id] = toolCall;
                anthropicToolBuffers[json.content_block.id] = '';
                contentBlockIndexToToolId[json.index] = json.content_block.id;

                if (!suppressAssistantDelta) {
                  onProgress?.('toolCalls', { toolCalls: [toolCall] });
                }
              } else if (json.type === 'content_block_delta' && json.delta?.type === 'input_json_delta') {
                const contentBlockIndex = json.index;
                const toolId = contentBlockIndexToToolId[contentBlockIndex];

                if (toolId && json.delta.partial_json) {
                  anthropicToolBuffers[toolId] += json.delta.partial_json;

                  if (!suppressAssistantDelta && toolCallsById[toolId]) {
                    toolCallsById[toolId].function.arguments = anthropicToolBuffers[toolId];
                    onProgress?.('tool_param_delta', {
                      toolId,
                      partialArguments: anthropicToolBuffers[toolId]
                    });
                  }
                }
              } else if (json.type === 'content_block_stop') {
                const contentBlockIndex = json.index;
                const toolId = contentBlockIndexToToolId[contentBlockIndex];

                if (toolId && anthropicToolBuffers[toolId]) {
                  try {
                    const completeJson = anthropicToolBuffers[toolId];
                    JSON.parse(completeJson); // Validate
                    toolCallsById[toolId].function.arguments = completeJson;
                  } catch (error) {
                    logger.error('Invalid JSON for tool parameters:', anthropicToolBuffers[toolId], error);
                    toolCallsById[toolId].function.arguments = '{}';
                  }
                }
              }
            } else {
              // Handle OpenAI/OpenRouter streaming format
              const delta = json.choices?.[0]?.delta;
              const finishReason = json.choices?.[0]?.finish_reason;

              // Track finish reason for truncation detection
              if (finishReason) {
                lastFinishReason = finishReason;
                // 'length' means max_tokens was hit - response was truncated
                if (finishReason === 'length') {
                  wasTruncated = true;
                  logger.warn('[StreamParser] Response truncated due to max_tokens limit');
                }
              }

              if (finishReason === 'stop' || finishReason === 'tool_calls' || finishReason === 'length') {
                if (currentToolCall && toolCallBuffer && currentToolCall.function && currentToolCall.id) {
                  currentToolCall.function.arguments = toolCallBuffer;
                  toolCallsById[currentToolCall.id] = currentToolCall as ToolCall;
                  currentToolCall = null;
                  toolCallBuffer = '';
                }
              }

              // Handle DeepSeek/Qwen delta.reasoning (separate from content)
              // When DeepSeek is accessed via OpenRouter, both delta.reasoning AND
              // delta.reasoning_details may be present - we only want to emit once
              let handledReasoningDelta = false;
              if (delta?.reasoning && !delta?.content && !delta?.tool_calls) {
                const reasoningPiece = String(delta.reasoning);
                reasoning += reasoningPiece;
                if (!suppressAssistantDelta) {

                  onProgress?.('reasoning_delta', { text: reasoningPiece });
                }
                handledReasoningDelta = true;
              }

              // Handle Zhipu delta.reasoning_content (same pattern, different field name)
              if (delta?.reasoning_content && !delta?.content && !delta?.tool_calls) {
                const reasoningPiece = String(delta.reasoning_content);
                reasoning += reasoningPiece;
                if (!suppressAssistantDelta) {
                  onProgress?.('reasoning_delta', { text: reasoningPiece });
                }
                handledReasoningDelta = true;
              }

              if (delta?.content) {
                const piece = String(delta.content);
                // Extract inline <think>...</think> blocks into reasoning
                const { content: contentPiece, reasoning: reasoningPiece } = splitThinkTags(piece);
                if (contentPiece) {
                  content += contentPiece;
                  if (!suppressAssistantDelta) onProgress?.('assistant_delta', { text: contentPiece });
                }
                if (reasoningPiece) {
                  reasoning += reasoningPiece;
                  if (!suppressAssistantDelta) onProgress?.('reasoning_delta', { text: reasoningPiece });
                  handledReasoningDelta = true;
                }
              }

              // Capture reasoning_details for Gemini thinking models (OpenRouter format)
              // These contain signatures that MUST be preserved for multi-turn tool use
              // IMPORTANT: Gemini sends CUMULATIVE SNAPSHOTS, not incremental deltas.
              // Each rd.text contains the FULL text so far, not just the new portion.
              // Skip if we already handled reasoning via delta.reasoning (DeepSeek via OpenRouter)
              if (!handledReasoningDelta && delta?.reasoning_details && Array.isArray(delta.reasoning_details)) {
                for (const rd of delta.reasoning_details) {
                  // Merge or update reasoning details
                  const existingIdx = reasoningDetails.findIndex(
                    (existing) => existing.id && existing.id === rd.id
                  );
                  if (existingIdx >= 0) {
                    // Update existing - Gemini sends cumulative snapshots, not deltas
                    if (rd.text) {
                      const previousText = reasoningDetails[existingIdx].text || '';
                      // Only emit delta if text actually changed
                      if (rd.text !== previousText) {
                        // Calculate the actual delta (new text minus previous)
                        const deltaText = rd.text.startsWith(previousText)
                          ? rd.text.slice(previousText.length)
                          : rd.text; // Fallback to full text if not a clean extension

                        // Store full snapshot (replace, not append)
                        reasoningDetails[existingIdx].text = rd.text;

                        // Emit delta event with just the new portion
      
                        if (deltaText && !suppressAssistantDelta) {
                          onProgress?.('reasoning_delta', { text: deltaText });
                        }
                      }
                    }
                    if (rd.signature) {
                      reasoningDetails[existingIdx].signature = rd.signature;
                    }
                  } else {
                    reasoningDetails.push(rd as ReasoningDetail);
                    // Emit delta for new reasoning detail
  
                    if (rd.text && !suppressAssistantDelta) {
                      onProgress?.('reasoning_delta', { text: rd.text });
                    }
                  }
                }
                // Update reasoning buffer from the latest cumulative text
                // Use the last reasoning detail's text as the current total
                const latestText = reasoningDetails
                  .filter(rd => rd.text)
                  .map(rd => rd.text)
                  .join('');
                if (latestText) {
                  reasoning = latestText; // Replace, don't append
                }
              }

              if (delta?.tool_calls) {
                // Auto-close any open <think> block when tool calls arrive
                // (MiniMax sometimes omits </think> before making tool calls)
                if (inThinkBlock) {
                  if (thinkTagBuffer) {
                    reasoning += thinkTagBuffer;
                    if (!suppressAssistantDelta) onProgress?.('reasoning_delta', { text: thinkTagBuffer });
                    thinkTagBuffer = '';
                  }
                  inThinkBlock = false;
                  if (!suppressAssistantDelta) onProgress?.('reasoning_complete', { reasoning });
                }

                for (const tc of delta.tool_calls) {
                  if (tc.index !== undefined) {
                    const key = `idx_${tc.index}`;
                    const isNewTool = !toolCallsById[key];

                    if (isNewTool) {
                      toolCallsById[key] = {
                        id: tc.id || `tool_${tc.index}`,
                        type: 'function' as const,
                        function: { name: '', arguments: '' }
                      };
                    }

                    if (tc.function?.name) {
                      toolCallsById[key].function.name = tc.function.name;

                      if (isNewTool && !suppressAssistantDelta) {
                        onProgress?.('toolCalls', { toolCalls: [toolCallsById[key]] });
                      }
                    }

                    if (tc.function?.arguments) {
                      const argFragment = tc.function.arguments;
                      toolCallsById[key].function.arguments += argFragment;

                      if (!suppressAssistantDelta) {
                        onProgress?.('tool_param_delta', {
                          toolId: toolCallsById[key].id,
                          partialArguments: toolCallsById[key].function.arguments
                        });
                      }
                    }
                  } else if (tc.id) {
                    if (currentToolCall && toolCallBuffer && currentToolCall.function && currentToolCall.id) {
                      currentToolCall.function.arguments = toolCallBuffer;
                      toolCallsById[currentToolCall.id] = currentToolCall as ToolCall;
                    }
                    currentToolCall = {
                      id: tc.id,
                      type: 'function' as const,
                      function: {
                        name: tc.function?.name || '',
                        arguments: ''
                      }
                    };
                    toolCallBuffer = tc.function?.arguments || '';

                    if (!suppressAssistantDelta && currentToolCall.function?.name) {
                      onProgress?.('toolCalls', { toolCalls: [currentToolCall as ToolCall] });
                    }
                  } else if (tc.function?.arguments) {
                    const argFragment = tc.function.arguments;
                    toolCallBuffer += argFragment;

                    if (!suppressAssistantDelta && currentToolCall) {
                      onProgress?.('tool_param_delta', {
                        toolId: currentToolCall.id,
                        partialArguments: toolCallBuffer
                      });
                    }
                  }

                  if (tc.function?.name && currentToolCall && currentToolCall.function) {
                    currentToolCall.function.name = tc.function.name;
                  }
                }
              }
            }

            // Parse usage info
            if (json.usage) {
              usageInfo = {
                promptTokens: json.usage.prompt_tokens || 0,
                completionTokens: json.usage.completion_tokens || 0,
                totalTokens: json.usage.total_tokens || 0,
                cachedTokens: json.usage.cached_tokens,
                reasoningTokens: json.usage.reasoning_tokens || json.usage.completion_tokens_details?.reasoning_tokens || 0,
                model: options.model,
                provider
              };
            }

            if (json.x_groq?.usage) {
              usageInfo = {
                promptTokens: json.x_groq.usage.prompt_tokens || 0,
                completionTokens: json.x_groq.usage.completion_tokens || 0,
                totalTokens: json.x_groq.usage.total_tokens || 0,
                reasoningTokens: json.x_groq.usage.reasoning_tokens || 0,
                model: options.model,
                provider
              };
            }
          } catch (error) {
            if (data && data.length > 10 && !data.includes('[DONE]')) {
              logger.warn('[StreamParser] Parse error:', error, 'Data:', data.substring(0, 200));
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error reading stream:', error);
    if (currentToolCall && toolCallBuffer && currentToolCall.function && currentToolCall.id) {
      currentToolCall.function.arguments = toolCallBuffer;
      toolCallsById[currentToolCall.id] = currentToolCall as ToolCall;
    }
  }

  // Flush any remaining thinkTagBuffer (partial tag that never completed)
  if (thinkTagBuffer) {
    if (inThinkBlock) {
      reasoning += thinkTagBuffer;
    } else {
      content += thinkTagBuffer;
    }
    thinkTagBuffer = '';
  }

  // Pass tool calls as-is - let tool-registry handle JSON repair with smart strategies
  const toolCallsArray = Object.values(toolCallsById);

  return {
    content,
    reasoning: reasoning || undefined,
    toolCalls: toolCallsArray,
    usage: usageInfo,
    wasTruncated,
    finishReason: lastFinishReason,
    reasoningDetails: reasoningDetails.length > 0 ? reasoningDetails : undefined
  };
}

/**
 * Build a tree structure from files with sizes
 */
export function buildFileTree(files: VirtualFile[]): string {
  if (files.length === 0) return '';

  const tree = new Map<string, {
    isDirectory: boolean;
    size?: number;
    children: Set<string>;
  }>();

  // Add all directories and files to the tree
  for (const file of files) {
    const pathParts = file.path.split('/').filter(Boolean);

    // Add intermediate directories
    for (let i = 0; i < pathParts.length - 1; i++) {
      const dirPath = '/' + pathParts.slice(0, i + 1).join('/');
      if (!tree.has(dirPath)) {
        tree.set(dirPath, { isDirectory: true, children: new Set() });
      }
    }

    // Add file
    tree.set(file.path, {
      isDirectory: false,
      size: file.size,
      children: new Set()
    });

    // Link child to parent
    const parentPath = '/' + pathParts.slice(0, -1).join('/');
    if (parentPath !== '/' && tree.has(parentPath)) {
      tree.get(parentPath)!.children.add(file.path);
    } else if (parentPath === '/') {
      if (!tree.has('/')) {
        tree.set('/', { isDirectory: true, children: new Set() });
      }
      tree.get('/')!.children.add(file.path);
    }
  }

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = (bytes / Math.pow(k, i));
    const formatted = i === 0 ? size.toString() : size.toFixed(1);
    return formatted + sizes[i];
  };

  // Build tree string recursively
  const buildTreeString = (path: string, prefix: string = '', isLast: boolean = true): string[] => {
    const entry = tree.get(path);
    if (!entry) return [];

    const lines: string[] = [];
    const name = path === '/' ? '' : path.split('/').pop() || '';

    if (path !== '/') {
      const connector = isLast ? '└── ' : '├── ';
      const displayName = entry.isDirectory ? name + '/' : name;
      const sizeInfo = entry.isDirectory ? '' : ` (${formatSize(entry.size || 0)})`;
      lines.push(prefix + connector + displayName + sizeInfo);
    }

    // Sort children: directories first, then files, alphabetically
    const children = Array.from(entry.children).sort((a, b) => {
      const aEntry = tree.get(a);
      const bEntry = tree.get(b);
      if (aEntry?.isDirectory !== bEntry?.isDirectory) {
        return aEntry?.isDirectory ? -1 : 1;
      }
      return a.localeCompare(b);
    });

    children.forEach((childPath, index) => {
      const isLastChild = index === children.length - 1;
      const childPrefix = path === '/' ? '' : prefix + (isLast ? '    ' : '│   ');
      lines.push(...buildTreeString(childPath, childPrefix, isLastChild));
    });

    return lines;
  };

  const treeLines = buildTreeString('/');
  return treeLines.length > 0 ? 'Project Structure:\n' + treeLines.join('\n') : '';
}
