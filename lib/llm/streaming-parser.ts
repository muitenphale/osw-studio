/**
 * Streaming Parser - Handles LLM streaming response parsing
 * Extracted from original orchestrator for reuse
 */

import { ToolCall, UsageInfo } from './types';
import { logger } from '../utils';
import { VirtualFile } from '@/lib/vfs';

export interface StreamResponse {
  content?: string;
  toolCalls?: ToolCall[];
  usage?: UsageInfo;
}

export interface StreamParserOptions {
  provider: string;
  model: string;
  projectId: string;
  suppressAssistantDelta?: boolean;
  onProgress?: (event: string, data?: any) => void;
  onCostUpdate?: (cost: number, usage: UsageInfo) => void;
}

/**
 * Parse streaming response from LLM
 * Handles Anthropic, OpenAI, and OpenRouter formats
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
  const toolCallsById: Record<string, ToolCall> = {};
  let currentToolCall: Partial<ToolCall> | null = null;
  let toolCallBuffer = '';
  let usageInfo: UsageInfo | undefined;

  const DEBUG_TOOL_STREAM = process.env.NEXT_PUBLIC_DEBUG_TOOL_STREAM === '1';

  // For Anthropic: track partial JSON building
  const anthropicToolBuffers: Record<string, string> = {};
  const contentBlockIndexToToolId: Record<number, string> = {};

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
              if (json.type === 'content_block_delta' && json.delta?.text_delta?.text) {
                const piece = json.delta.text_delta.text as string;
                content += piece;
                if (!suppressAssistantDelta) onProgress?.('assistant_delta', { text: piece, snapshot: content });
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

              if (finishReason === 'stop' || finishReason === 'tool_calls') {
                if (currentToolCall && toolCallBuffer && currentToolCall.function && currentToolCall.id) {
                  currentToolCall.function.arguments = toolCallBuffer;
                  toolCallsById[currentToolCall.id] = currentToolCall as ToolCall;
                  currentToolCall = null;
                  toolCallBuffer = '';
                }
              }

              if (delta?.reasoning && !delta?.content && !delta?.tool_calls) {
                const reasoningPiece = String(delta.reasoning);
                content += reasoningPiece;
                if (!suppressAssistantDelta) onProgress?.('assistant_delta', { text: reasoningPiece, snapshot: content });
              }

              if (delta?.content) {
                const piece = String(delta.content);
                content += piece;
                if (!suppressAssistantDelta) onProgress?.('assistant_delta', { text: piece, snapshot: content });
              }

              if (delta?.tool_calls) {
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
                model: options.model,
                provider
              };
            }

            if (json.x_groq?.usage) {
              usageInfo = {
                promptTokens: json.x_groq.usage.prompt_tokens || 0,
                completionTokens: json.x_groq.usage.completion_tokens || 0,
                totalTokens: json.x_groq.usage.total_tokens || 0,
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
    if (Object.keys(toolCallsById).length > 0) {
      if (currentToolCall && toolCallBuffer && currentToolCall.function && currentToolCall.id) {
        currentToolCall.function.arguments = toolCallBuffer;
        toolCallsById[currentToolCall.id] = currentToolCall as ToolCall;
      }
    }
  }

  // Pass tool calls as-is - let tool-registry handle JSON repair with smart strategies
  const toolCallsArray = Object.values(toolCallsById);

  return { content, toolCalls: toolCallsArray, usage: usageInfo };
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
