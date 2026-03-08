/**
 * Multi-Agent Orchestrator - Manages agent execution and tool orchestration
 * Handles conversation state, checkpointing, and event streaming
 */

import { Agent, AgentType, agentRegistry } from './agent';
import { toolRegistry, ToolExecutionContext } from './tool-registry';
import { vfs } from '@/lib/vfs';
import { checkpointManager, Checkpoint } from '@/lib/vfs/checkpoint';
import { saveManager } from '@/lib/vfs/save-manager';
import { configManager } from '@/lib/config/storage';
import { getProvider } from '@/lib/llm/providers/registry';
import { CostCalculator } from './cost-calculator';
import { ToolCall, UsageInfo, ContentBlock } from './types';
import { logger } from '@/lib/utils';
import { toast } from 'sonner';
import { registerOpenRouterPricingFromApi, registerPricingFromProviderModels } from './pricing-cache';
import { fetchAvailableModels } from './models-api';
import { parseStreamingResponse, buildFileTree, ReasoningDetail } from './streaming-parser';
import { extractPartialContent, getContinuationMarker, PartialContentExtraction } from './json-repair';
import { drainCompileErrors, formatCompileErrors } from '@/lib/preview/compile-errors';
import { buildShellSystemPrompt, buildProjectContext } from './system-prompt';
import { evaluateRelevantSkills } from './skill-evaluator';
import { skillsService } from '@/lib/vfs/skills';
import { track } from '@/lib/telemetry';
import { extractToolAnalytics } from '@/lib/telemetry/tool-analytics';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Detect if content contains malformed tool calls written as text/markdown
 * instead of proper function calling invocations.
 *
 * This specifically looks for patterns where the model writes out tool call
 * syntax as text rather than using the function calling API.
 */
function detectMalformedToolCalls(content: string): boolean {
  if (!content) return false;

  // Only detect when the ENTIRE response or a significant portion appears to be
  // an attempt to "write" a tool call as text. Look for patterns at line start
  // or as standalone statements.
  const patterns = [
    // Markdown code block with shell/bash
    /```(?:shell|bash|sh)\s*\n[\s\S]*?\n```/,
    // Line starting with shell{"cmd" (no leading text explanation)
    /^shell\s*\{\s*["']?cmd["']?\s*:/m,
    // Line starting with shell[ for array format
    /^shell\s*\[\s*["']/m,
    // JSON code block with cmd
    /```json\s*\n\s*\{\s*["']?cmd["']?\s*:/,
    // write tool written as text (common with DeepSeek)
    /^write\s*\{/m,
    /write\s*\{\s*["']?file_path["']?\s*:/,
    // evaluation tool written as text
    /^evaluation\s*\{/m,
  ];

  // Check if ANY pattern matches
  const hasPattern = patterns.some(p => p.test(content));
  if (!hasPattern) return false;

  // Additional heuristic: if the content is SHORT and mostly just the tool call
  // pattern, it's likely a malformed tool call. If there's substantial text
  // around it (explanation), it might be intentional documentation.
  const trimmed = content.trim();

  // If the entire content is just a short tool-call-like pattern, flag it
  if (trimmed.length < 200) {
    return true;
  }

  // For longer content, only flag if the pattern appears at the very end
  // (model explaining then "calling" the tool as text)
  const endsWithToolPattern = /shell\s*\{\s*["']?cmd["']?\s*:.*\}\s*$/.test(trimmed) ||
                               /```(?:shell|bash|sh)\s*\n[\s\S]*?\n```\s*$/.test(trimmed) ||
                               /write\s*\{[\s\S]*\}\s*$/.test(trimmed);

  return endsWithToolPattern;
}

const MALFORMED_TOOL_CALL_ERROR = `⛔ CRITICAL ERROR: You wrote a tool call as TEXT instead of invoking it.

This is WRONG - you wrote text like:
  shell{"cmd": "..."}
  write{"file_path": "..."}
  \`\`\`shell
  command
  \`\`\`

This is RIGHT - invoke tools directly via function calling:
  Call shell tool with parameter cmd="your command"
  Call write tool with parameters file_path, operations

You MUST use function calling. DO NOT write tool syntax as text.
STOP writing text. START invoking tools. Try again NOW.`;

const MALFORMED_TOOL_CALL_PERSISTENT_REMINDER = `

⚠️ REMINDER: You have been writing tool calls as text instead of invoking them.
EVERY time you want to use a tool, you MUST invoke it via function calling.
DO NOT write shell{"cmd":...} or write{...} as text - INVOKE the tools directly.`;

/**
 * Context for continuing a truncated file operation
 */
interface ContinuationContext {
  toolCallId: string;
  toolName: string;
  filePath: string;
  operationType: string;
  partialContent: string;
  attemptCount: number;
  startedAt: number;
}

/**
 * Handles continuation of truncated file operations
 * Buffers partial content until all chunks are received, then writes final file
 */
class ContinuationHandler {
  private maxContinuationAttempts = 3;
  private contentBuffer: Map<string, string> = new Map();  // filePath -> accumulated content
  private activeContinuations: Map<string, ContinuationContext> = new Map();  // filePath -> context
  private onProgress?: (event: string, data?: unknown) => void;

  constructor(onProgress?: (event: string, data?: unknown) => void) {
    this.onProgress = onProgress;
  }

  /**
   * Check if truncation was detected and we need to continue
   */
  detectNeedsContinuation(
    toolCall: { function: { name: string; arguments: string }; id: string },
    wasTruncated: boolean,
    parseError?: Error
  ): { needsContinuation: boolean; extraction?: PartialContentExtraction } {
    if (!wasTruncated && !parseError) {
      return { needsContinuation: false };
    }

    // Only write operations can be continued
    if (toolCall.function.name !== 'write') {
      return { needsContinuation: false };
    }

    // Try to extract partial content
    const extraction = extractPartialContent(toolCall.function.arguments);

    // Only rewrite operations can be safely continued
    if (extraction.success && extraction.operationType === 'rewrite') {
      return { needsContinuation: true, extraction };
    }

    return { needsContinuation: false, extraction };
  }

  /**
   * Start or continue buffering content for a file
   */
  bufferContent(filePath: string, content: string, toolCallId: string): ContinuationContext {
    let context = this.activeContinuations.get(filePath);

    if (context) {
      // Append to existing buffer
      const existingContent = this.contentBuffer.get(filePath) || '';
      this.contentBuffer.set(filePath, existingContent + content);
      context.attemptCount++;
      context.toolCallId = toolCallId;

      this.onProgress?.('chunk_progress', {
        type: 'chunk_complete',
        filePath,
        message: `Chunk ${context.attemptCount} buffered, continuing...`,
        chunkNumber: context.attemptCount
      });
    } else {
      // Start new continuation
      context = {
        toolCallId,
        toolName: 'write',
        filePath,
        operationType: 'rewrite',
        partialContent: content,
        attemptCount: 1,
        startedAt: Date.now()
      };
      this.activeContinuations.set(filePath, context);
      this.contentBuffer.set(filePath, content);

      this.onProgress?.('chunk_progress', {
        type: 'large_file_detected',
        filePath,
        message: 'Large file detected, writing in chunks...',
        chunkNumber: 1
      });
    }

    return context;
  }

  /**
   * Check if we've exceeded max continuation attempts
   */
  hasExceededMaxAttempts(filePath: string): boolean {
    const context = this.activeContinuations.get(filePath);
    return context ? context.attemptCount >= this.maxContinuationAttempts : false;
  }

  /**
   * Generate a continuation prompt for the LLM
   */
  generateContinuationPrompt(filePath: string): string {
    const context = this.activeContinuations.get(filePath);
    const bufferedContent = this.contentBuffer.get(filePath) || '';

    if (!context) {
      return '';
    }

    const marker = getContinuationMarker(bufferedContent, 200);

    return `The previous file operation for "${filePath}" was truncated due to max_tokens limit.

**Current buffered content ends with:**
\`\`\`
...${marker}
\`\`\`

**IMPORTANT:** Continue writing the file content from EXACTLY where it left off.
- Do NOT repeat any content that was already written
- Do NOT add any extra spacing or newlines at the start
- Start your content directly after: "${marker.slice(-50)}"

Use the write tool to continue:
{
  "file_path": "${filePath}",
  "operations": [{"type": "rewrite", "content": "...remaining content starting from where you left off..."}]
}

Note: Your response will be automatically appended to the buffered content. Only write the NEW content.`;
  }

  /**
   * Finalize a file by combining all buffered chunks
   * Returns the complete content ready to write
   */
  finalizeFile(filePath: string): { content: string; totalChunks: number } | null {
    const context = this.activeContinuations.get(filePath);
    const content = this.contentBuffer.get(filePath);

    if (!context || !content) {
      return null;
    }

    const totalChunks = context.attemptCount;

    // Clean up
    this.activeContinuations.delete(filePath);
    this.contentBuffer.delete(filePath);

    this.onProgress?.('chunk_progress', {
      type: 'file_complete',
      filePath,
      message: 'File assembled successfully',
      totalChunks
    });

    return { content, totalChunks };
  }

  /**
   * Abort continuation and clean up
   */
  abortContinuation(filePath: string): void {
    this.activeContinuations.delete(filePath);
    this.contentBuffer.delete(filePath);

    this.onProgress?.('chunk_progress', {
      type: 'file_aborted',
      filePath,
      message: 'File operation aborted due to max continuation attempts'
    });
  }

  /**
   * Check if there's an active continuation for a file
   */
  hasContinuation(filePath: string): boolean {
    return this.activeContinuations.has(filePath);
  }

  /**
   * Get the current buffered content for a file
   */
  getBufferedContent(filePath: string): string | undefined {
    return this.contentBuffer.get(filePath);
  }

  /**
   * Check if a tool call is a continuation (not an original call)
   */
  isContinuationCall(filePath: string): boolean {
    const context = this.activeContinuations.get(filePath);
    return context ? context.attemptCount > 1 : false;
  }

  /**
   * Clear all buffers and active continuations
   * Called when orchestrator completes to free memory
   */
  clearAll(): void {
    this.contentBuffer.clear();
    this.activeContinuations.clear();
  }
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];  // String or array of content blocks (for multimodal)
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning_details?: ReasoningDetail[];  // For Gemini thinking models - MUST be preserved
  // UI metadata for session recovery and display hints
  ui_metadata?: {
    checkpointId?: string;
    cost?: number;
    usage?: UsageInfo;
    isSyntheticError?: boolean;  // True if this is an auto-injected error message (e.g., malformed tool call correction)
    projectContext?: string;  // Project context injected into first user message (for collapsible UI display)
    displayContent?: string | ContentBlock[];  // Clean user prompt for UI (without injected context/hints)
  };
}

// Pending image for the chat UI
export interface PendingImage {
  id: string;
  data: string;      // base64 data (without prefix)
  mediaType: string; // 'image/png', 'image/jpeg', etc.
  preview: string;   // full data URL for display
}

export interface ConversationNode {
  id: string;
  agent_type: AgentType;
  messages: AgentMessage[];
  metadata: {
    started_at: number;
    completed_at?: number;
    cost: number;
    status: 'running' | 'completed' | 'failed';
  };
}

export interface MultiAgentResult {
  success: boolean;
  summary: string;
  conversation: ConversationNode[];
  totalCost: number;
  totalUsage: UsageInfo;
  checkpointId?: string;
}

/**
 * Multi-Agent Orchestrator
 * Coordinates multiple agents with isolated conversation contexts
 */
export class MultiAgentOrchestrator {
  private projectId: string;
  private rootAgent: Agent;
  private conversations: Map<string, ConversationNode> = new Map();
  private currentConversationId: string;
  private onProgress?: (message: string, step?: unknown) => void;
  private totalCost = 0;
  private totalUsage: UsageInfo = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0
  };
  private stopped = false;
  private pricingEnsured = new Set<string>();
  private chatMode: boolean;
  private model?: string;
  private lastToolCallSignature: string | null = null; // Loop detection
  private duplicateToolCallCount: number = 0; // Track consecutive duplicates
  private evaluationRequested = false; // Track if we requested evaluation
  private lastEvaluationResult: { should_continue: boolean } | null = null; // Track evaluation result
  private malformedToolCallRetries = 0; // Track consecutive retries for malformed tool call detection
  private totalMalformedToolCalls = 0; // Track total malformed calls in session (doesn't reset)
  private readonly maxMalformedRetries = 2; // Max consecutive retries before allowing through
  private readonly malformedThresholdForReminder = 3; // After this many total failures, add persistent reminder
  private continuationHandler: ContinuationHandler; // Handles truncated file operations

  constructor(
    projectId: string,
    agentType: AgentType = 'orchestrator',
    onProgress?: (message: string, step?: unknown) => void,
    options?: { chatMode?: boolean; model?: string }
  ) {
    this.projectId = projectId;
    this.onProgress = onProgress;
    this.chatMode = options?.chatMode ?? false;
    this.model = options?.model;
    this.continuationHandler = new ContinuationHandler(onProgress);

    // Get root agent (default to orchestrator)
    const agent = agentRegistry.get(agentType);
    if (!agent) {
      throw new Error(`Agent type "${agentType}" not found`);
    }
    this.rootAgent = agent;

    // Create root conversation
    this.currentConversationId = this.createConversation(agentType);
  }

  /**
   * Stop execution
   */
  stop(): void {
    this.stopped = true;
    logger.info('[MultiAgentOrchestrator] Execution stopped by user');
  }

  /**
   * Import previous conversation messages to restore context
   */
  importConversation(messages: AgentMessage[]): void {
    const rootConversation = this.conversations.get(this.currentConversationId);
    if (!rootConversation) {
      throw new Error('Cannot import conversation: root conversation not found');
    }

    // Replace messages array with imported history
    rootConversation.messages = messages;
    logger.info(`[MultiAgentOrchestrator] Imported ${messages.length} conversation messages`);
  }

  /**
   * Add message to conversation and emit event for persistence
   */
  private addMessage(conversationId: string, message: AgentMessage): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    conversation.messages.push(message);

    // Emit event for persistence (only for root conversation)
    if (conversationId === this.currentConversationId) {
      this.onProgress?.('conversation_message', { message });
    }
  }

  /**
   * Execute user prompt with optional images
   */
  async execute(
    userPrompt: string,
    options?: {
      images?: Array<{ data: string; mediaType: string }>;
    }
  ): Promise<MultiAgentResult> {
    logger.info('[MultiAgentOrchestrator] Starting execution', { agent: this.rootAgent.type });

    // Reset state for new execution
    this.lastToolCallSignature = null;
    this.duplicateToolCallCount = 0;
    this.evaluationRequested = false;
    this.lastEvaluationResult = null;

    try {
      // Note: Initial checkpoint removed - checkpoints only created at task completion
      // The previous task's completion checkpoint serves as the "before" state

      // Get file tree for context
      let fileTreeStr: string | undefined;
      try {
        const files = await vfs.listDirectory(this.projectId, '/');
        if (files.length > 0) {
          fileTreeStr = buildFileTree(files);
        }
      } catch {
        // Ignore errors getting file tree
      }

      // Get server context metadata from VFS (already computed when context was mounted)
      const serverContext = vfs.getServerContextMetadata();

      // Build system prompt (behavioral instructions only — skills/tree go in user message)
      const systemPrompt = await buildShellSystemPrompt(this.chatMode, serverContext, this.projectId);

      // Get current conversation
      const conversation = this.conversations.get(this.currentConversationId);
      const hasExistingSystemMessage = conversation?.messages.some(m => m.role === 'system');

      // Only add system prompt if this is a fresh conversation (no existing system message)
      // For follow-up messages, the system prompt is already in the conversation history
      if (!hasExistingSystemMessage) {
        this.addMessage(this.currentConversationId, {
          role: 'system',
          content: systemPrompt
        });
      }

      // Build project context (skills list + file tree) for the first user message.
      // Placed in user message so the model treats it as project state, not instructions.
      let projectContext = '';
      if (!hasExistingSystemMessage) {
        projectContext = await buildProjectContext(fileTreeStr, serverContext);
      }

      // Skill evaluation pass - check if any enabled skills are relevant
      let skillHint = '';
      try {
        const evalEnabled = await skillsService.isEvaluationEnabled();
        if (evalEnabled) {
          const skillsMeta = await skillsService.getEnabledSkillsMetadata();
          if (skillsMeta.length > 0) {
            const { provider, apiKey, model } = this.getProviderConfig();
            const evalResult = await evaluateRelevantSkills(
              userPrompt, skillsMeta, fileTreeStr || '', provider, apiKey, model
            );

            // Track eval usage
            if (evalResult.usage) {
              const evalUsage = evalResult.usage;
              const cost = CostCalculator.calculateCost(
                evalUsage, evalUsage.provider, evalUsage.model, true
              );
              this.totalCost += cost;
              this.totalUsage.promptTokens += evalUsage.promptTokens;
              this.totalUsage.completionTokens += evalUsage.completionTokens;
              this.totalUsage.totalTokens += evalUsage.totalTokens;
              configManager.updateSessionCost({ ...evalUsage, cost }, cost);
            }

            // Emit debug event
            this.onProgress?.('skill_evaluation', {
              skills: skillsMeta.map(s => s.id),
              matched: evalResult.skillIds,
              usage: evalResult.usage,
            });

            if (evalResult.skillIds.length > 0) {
              const paths = evalResult.skillIds.map(s => `/.skills/${s}.md`).join(', ');
              skillHint = `Skill evaluation: read ${paths} before proceeding.\n\n`;
            }
          }
        }
      } catch {
        // Silent fallback - don't block normal execution
      }

      // Build user message content - string or ContentBlock[] with images
      // First message gets project context prepended; follow-ups get skill hint only
      const messagePrefix = (projectContext ? projectContext + '\n\n' : '') + skillHint;
      let userContent: string | ContentBlock[];
      let displayContent: string | ContentBlock[];

      if (options?.images && options.images.length > 0) {
        // Build multimodal content with text and images
        const imageBlocks: ContentBlock[] = [];
        for (const img of options.images) {
          imageBlocks.push({
            type: 'image_url',
            image_url: {
              url: `data:${img.mediaType};base64,${img.data}`
            }
          });
        }
        userContent = [{ type: 'text' as const, text: messagePrefix + userPrompt }, ...imageBlocks];
        displayContent = [{ type: 'text' as const, text: userPrompt }, ...imageBlocks];
      } else {
        userContent = messagePrefix + userPrompt;
        displayContent = userPrompt;
      }

      // Add user prompt — full content for LLM, display content + context metadata for UI
      this.addMessage(this.currentConversationId, {
        role: 'user',
        content: userContent,
        ui_metadata: {
          displayContent,
          ...(projectContext ? { projectContext } : {})
        }
      });

      // Run agent loop
      await this.runAgentLoop(this.currentConversationId, this.rootAgent);

      // Create final checkpoint
      await this.recordAutoCheckpoint(`After: ${userPrompt.substring(0, 60)}`);

      return {
        success: true,
        summary: 'Task completed',
        conversation: Array.from(this.conversations.values()),
        totalCost: this.totalCost,
        totalUsage: this.totalUsage
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[MultiAgentOrchestrator] Execution error:', errorMessage);

      // Emit error event for debug panel
      this.onProgress?.('error', {
        message: errorMessage,
        type: 'execution_error',
        stack: error instanceof Error ? error.stack : undefined
      });

      await this.recordAutoCheckpoint(`After failure: ${userPrompt.substring(0, 60)}`);

      return {
        success: false,
        summary: `Error: ${errorMessage}`,
        conversation: Array.from(this.conversations.values()),
        totalCost: this.totalCost,
        totalUsage: this.totalUsage
      };
    } finally {
      // Clean up continuation handler buffers to free memory
      this.continuationHandler.clearAll();
    }
  }

  /**
   * Run agent execution loop
   */
  private async runAgentLoop(conversationId: string, agent: Agent): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const maxIterations = agent.maxIterations;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (this.stopped) {
        logger.info('[MultiAgentOrchestrator] Loop stopped by user');
        this.onProgress?.('stopped', { reason: 'user' });
        break;
      }

      // Notify progress
      this.onProgress?.('iteration', {
        current: iteration + 1,
        max: maxIterations,
        agent: agent.type
      });

      // Before calling LLM, drain compile errors from previous iteration's file changes.
      // Preview compilation is debounced (150ms) so we must wait before draining.
      if (iteration > 0) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const compileErrors = drainCompileErrors();
        if (compileErrors.length > 0) {
          this.addMessage(conversationId, {
            role: 'user',
            content: formatCompileErrors(compileErrors),
            ui_metadata: { isSyntheticError: true }
          });
        }
      }

      // Get LLM response - emit 'waiting' to show we're waiting for first token
      // Note: actual reasoning tokens are handled via 'reasoning_delta' events from streaming-parser
      this.onProgress?.('waiting', {});

      const response = await this.streamLLMResponse(
        conversation.messages,
        agent
      );

      // Check for malformed tool calls (model wrote tool syntax as text instead of invoking)
      if (response.content && (!response.toolCalls || response.toolCalls.length === 0)) {
        if (detectMalformedToolCalls(response.content)) {
          this.malformedToolCallRetries++;
          this.totalMalformedToolCalls++;
          logger.warn(`[MultiAgentOrchestrator] Detected malformed tool call in text (consecutive: ${this.malformedToolCallRetries}/${this.maxMalformedRetries}, total: ${this.totalMalformedToolCalls})`);

          // Only retry if under the consecutive limit
          if (this.malformedToolCallRetries <= this.maxMalformedRetries) {
            // Add the malformed response to conversation
            this.addMessage(conversationId, {
              role: 'assistant',
              content: response.content
            });

            // Build error message - add persistent reminder if many total failures
            let errorMessage = MALFORMED_TOOL_CALL_ERROR;
            if (this.totalMalformedToolCalls >= this.malformedThresholdForReminder) {
              errorMessage += MALFORMED_TOOL_CALL_PERSISTENT_REMINDER;
            }

            // Add synthetic error to help model self-correct
            this.addMessage(conversationId, {
              role: 'user',
              content: errorMessage,
              ui_metadata: {
                isSyntheticError: true
              }
            });

            // Emit progress event so UI knows what happened
            this.onProgress?.('malformed_tool_call', {
              retry: this.malformedToolCallRetries,
              maxRetries: this.maxMalformedRetries,
              totalFailures: this.totalMalformedToolCalls
            });

            continue; // Retry the loop
          }
          // If over consecutive limit, fall through and let it proceed (model may still produce useful text)
        }
      } else if (response.toolCalls && response.toolCalls.length > 0) {
        // Reset CONSECUTIVE counter on successful tool calls (but not total)
        this.malformedToolCallRetries = 0;
      }

      // No tool calls - LLM wants to finish
      if (!response.toolCalls || response.toolCalls.length === 0) {
        const hasContent = response.content && response.content.trim();

        // Log when we get reasoning-only responses (no content, no tool calls)
        if (!hasContent) {
          logger.warn('[MultiAgentOrchestrator] Response has no content and no tool calls (reasoning-only response)', {
            hasReasoningDetails: !!response.reasoningDetails,
            evaluationRequested: this.evaluationRequested,
            iteration
          });
        }

        if (hasContent) {
          this.addMessage(conversationId, {
            role: 'assistant',
            content: response.content!
          });
        }

        // Check if we've received an evaluation
        if (this.lastEvaluationResult) {
          if (this.lastEvaluationResult.should_continue) {
            // Evaluation says more work needed - continue loop
            logger.info('[MultiAgentOrchestrator] Evaluation indicates more work needed, continuing');
            this.lastEvaluationResult = null;
            this.evaluationRequested = false;
            continue;
          } else {
            // Evaluation says complete - allow finish
            logger.info('[MultiAgentOrchestrator] Evaluation indicates task complete, finishing');
            break;
          }
        }

        // No evaluation yet - request it
        if (!this.evaluationRequested) {
          logger.info('[MultiAgentOrchestrator] Requesting evaluation before finishing');
          this.evaluationRequested = true;
          this.addMessage(conversationId, {
            role: 'user',
            content: 'Before finishing, you must call the evaluation tool to assess whether the task has been completed successfully.'
          });
          continue;
        }

        // Evaluation was requested but not received - break to avoid infinite loop
        logger.warn('[MultiAgentOrchestrator] Evaluation requested but not received, finishing anyway');
        break;
      }

      // Execute tool calls (pass wasTruncated for continuation handling)
      const { results: toolResults, continuationNeeded, continuationFilePath } = await this.executeToolCalls(
        response.toolCalls,
        conversationId,
        agent,
        response.wasTruncated
      );

      // Add assistant message with tool calls and reasoning_details (for Gemini)
      this.addMessage(conversationId, {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls,
        ...(response.reasoningDetails && { reasoning_details: response.reasoningDetails })
      });

      // Add tool results
      for (const result of toolResults) {
        this.addMessage(conversationId, result);
      }

      // If continuation is needed, inject a continuation prompt
      if (continuationNeeded && continuationFilePath) {
        const continuationPrompt = this.continuationHandler.generateContinuationPrompt(continuationFilePath);
        this.addMessage(conversationId, {
          role: 'user',
          content: continuationPrompt
        });
        logger.info(`[MultiAgentOrchestrator] Continuation needed for ${continuationFilePath}, injecting prompt`);
        // Continue loop to get continuation response
        continue;
      }
    }

    // Mark conversation as completed
    conversation.metadata.completed_at = Date.now();
    conversation.metadata.status = 'completed';
  }

  /**
   * Execute tool calls
   */
  private async executeToolCalls(
    toolCalls: ToolCall[],
    conversationId: string,
    agent: Agent,
    wasTruncated?: boolean
  ): Promise<{ results: AgentMessage[]; continuationNeeded: boolean; continuationFilePath?: string }> {
    const results: AgentMessage[] = [];
    const conversation = this.conversations.get(conversationId)!;
    let continuationNeeded = false;
    let continuationFilePath: string | undefined;

    for (let toolIndex = 0; toolIndex < toolCalls.length; toolIndex++) {
      const toolCall = toolCalls[toolIndex];

      if (this.stopped) break;

      const toolId = toolCall.function?.name;
      if (!toolId) continue;

      // Check if agent has access to this tool
      if (!agent.hasTool(toolId)) {
        const errorMsg = `Error: Agent "${agent.type}" does not have access to tool "${toolId}"`;
        results.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: errorMsg
        });

        // Emit tool failure
        this.onProgress?.('tool_status', {
          toolIndex,
          status: 'failed',
          error: errorMsg
        });
        continue;
      }

      // Skip loop detection for continuation calls AND truncated tool calls
      // When we're continuing a large file, the tool calls may look similar but are intentional
      // When tool calls are truncated, they look identical but aren't real loops
      let skipLoopDetection = false;
      if (toolId === 'write') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const filePath = args.file_path;
          if (filePath && this.continuationHandler.isContinuationCall(filePath)) {
            skipLoopDetection = true;
            logger.info(`[MultiAgentOrchestrator] Skipping loop detection for continuation call: ${filePath}`);
          }
        } catch {
          // Can't parse - JSON is truncated/malformed
          // Skip loop detection since truncated calls look identical but aren't real loops
          skipLoopDetection = true;
          const extraction = extractPartialContent(toolCall.function.arguments);
          if (extraction.filePath) {
            logger.info(`[MultiAgentOrchestrator] Skipping loop detection for truncated tool call: ${extraction.filePath}`);
          } else {
            logger.info(`[MultiAgentOrchestrator] Skipping loop detection for unparseable tool call`);
          }
        }
      }

      // Loop detection - check for consecutive duplicate tool calls (skip for continuations and truncated calls)
      const currentSignature = this.getToolCallSignature(toolCall);
      if (!skipLoopDetection && this.lastToolCallSignature === currentSignature) {
        // Loop detected - increment counter
        this.duplicateToolCallCount++;
        logger.warn(`[MultiAgentOrchestrator] Loop detected: consecutive duplicate tool call #${this.duplicateToolCallCount} - ${currentSignature}`);

        // Get brief parameter summary for error message
        let paramSummary = '';
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const keys = Object.keys(args).slice(0, 3); // Show first 3 params
          paramSummary = keys.map(k => `${k}: ${JSON.stringify(args[k]).substring(0, 50)}`).join(', ');
          if (Object.keys(args).length > 3) paramSummary += '...';
        } catch {
          paramSummary = toolCall.function.arguments.substring(0, 100);
        }

        const interventionMessage = `❌ Loop detected: Duplicate tool call detected.

Tool: ${toolId}
Parameters: ${paramSummary}

The previous call returned a result, but you're calling it again with identical parameters.

💡 Next steps:
• Review the previous tool result - did it contain what you needed?
• If the result was incomplete or unexpected, try a different approach
• If you need additional data, modify your parameters or use a different tool
• Do NOT retry the exact same call

Please revise your approach.`;

        results.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: interventionMessage
        });

        // Update tool status to failed
        this.onProgress?.('tool_status', {
          toolIndex,
          status: 'failed',
          error: `Loop detected - duplicate tool call #${this.duplicateToolCallCount}`
        });

        // Terminate if we've seen 3 consecutive duplicates
        if (this.duplicateToolCallCount >= 3) {
          throw new Error(`Execution terminated: Too many consecutive duplicate tool calls (${this.duplicateToolCallCount}). The model appears stuck in a loop.`);
        }

        // Skip executing this duplicate call
        continue;
      }

      // Reset duplicate counter on any non-duplicate call
      this.duplicateToolCallCount = 0;

      // Update last tool call signature
      this.lastToolCallSignature = currentSignature;

      // Emit tool execution start
      this.onProgress?.('tool_status', {
        toolIndex,
        toolName: toolId,
        status: 'executing',
        args: toolCall.function.arguments
      });

      // Build execution context
      const context: ToolExecutionContext = {
        agentType: agent.type,
        isReadOnly: this.chatMode || agent.isReadOnly, // Chat mode forces read-only for all agents
        onProgress: this.onProgress
      };

      try {
        // Check if this is a continuation response for write tool
        let filePath: string | undefined;
        if (toolId === 'write') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            filePath = args.file_path;
          } catch {
            // If we can't parse, try to extract from truncated JSON
            const extraction = extractPartialContent(toolCall.function.arguments);
            filePath = extraction.filePath;
          }
        }

        // If there's an active continuation and this is a continuation response
        if (filePath && this.continuationHandler.hasContinuation(filePath)) {
          // This is a continuation response - we need to handle it specially
          // Check if response was truncated again
          if (wasTruncated) {
            const extraction = extractPartialContent(toolCall.function.arguments);
            if (extraction.success && extraction.content) {
              // Still truncated - buffer and continue
              if (this.continuationHandler.hasExceededMaxAttempts(filePath)) {
                this.continuationHandler.abortContinuation(filePath);
                results.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: `Error: File operation for "${filePath}" failed after max continuation attempts.`
                });
                this.onProgress?.('tool_status', {
                  toolIndex,
                  status: 'failed',
                  error: `Max continuation attempts exceeded for ${filePath}`
                });
                continue;
              }

              this.continuationHandler.bufferContent(filePath, extraction.content, toolCall.id);
              continuationNeeded = true;
              continuationFilePath = filePath;

              results.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: `Continuation chunk buffered for "${filePath}". More content needed...`
              });

              this.onProgress?.('tool_status', {
                toolIndex,
                status: 'continuing',
                message: `Additional chunk buffered for ${filePath}`
              });

              break; // Wait for next continuation
            }
          } else {
            // Not truncated - this chunk completes the file
            // Extract the content from this final chunk
            try {
              const args = JSON.parse(toolCall.function.arguments);
              if (args.operations?.[0]?.type === 'rewrite' && args.operations[0].content) {
                // Append final content to buffer
                const existingContent = this.continuationHandler.getBufferedContent(filePath) || '';
                const finalContent = existingContent + args.operations[0].content;

                // Finalize the continuation
                const finalized = this.continuationHandler.finalizeFile(filePath);

                // Write the complete file using VFS
                // Check if file exists to determine create vs update
                let fileExists = false;
                try {
                  await vfs.readFile(this.projectId, filePath);
                  fileExists = true;
                } catch {
                  fileExists = false;
                }

                if (fileExists) {
                  await vfs.updateFile(this.projectId, filePath, finalContent);
                } else {
                  await vfs.createFile(this.projectId, filePath, finalContent);
                }

                results.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: `File "${filePath}" written successfully (assembled from ${finalized?.totalChunks || 1} chunks)`
                });

                this.onProgress?.('tool_status', {
                  toolIndex,
                  status: 'completed',
                  result: `File assembled from ${finalized?.totalChunks || 1} chunks`
                });

                continue;
              }
            } catch {
              // Fall through to normal execution
            }
          }
        }

        // Execute tool normally
        const result = await toolRegistry.execute(toolCall, this.projectId, context);

        // Capture evaluation result if this was an evaluation tool call
        if (toolId === 'evaluation') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            // Handle should_continue - LLM sometimes sends as string "true"/"false"
            let shouldContinue = true; // Default to true
            if (typeof args.should_continue === 'boolean') {
              shouldContinue = args.should_continue;
            } else if (typeof args.should_continue === 'string') {
              shouldContinue = args.should_continue.toLowerCase() === 'true' || args.should_continue === '1';
            } else if (args.should_continue !== undefined) {
              shouldContinue = Boolean(args.should_continue);
            }
            this.lastEvaluationResult = {
              should_continue: shouldContinue
            };
            logger.info(`[MultiAgentOrchestrator] Captured evaluation result: should_continue=${this.lastEvaluationResult.should_continue}`);
          } catch (error) {
            logger.error('[MultiAgentOrchestrator] Failed to parse evaluation arguments:', error);
          }
        }

        // Check if result indicates an error
        const isError = result.startsWith('Error:');

        results.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        });

        // Emit tool status based on result
        this.onProgress?.('tool_status', {
          toolIndex,
          toolName: toolId,
          status: isError ? 'failed' : 'completed',
          result,
          ...(isError && { error: result })
        });

        track('tool_call', extractToolAnalytics(toolCall.function.name, toolCall.function.arguments, !isError));

        // Also emit tool_result for backward compatibility
        this.onProgress?.('tool_result', {
          toolIndex,
          result
        });

        // Note: Checkpoint creation after each tool removed to reduce checkpoint frequency
        // Checkpoints are now only created at task completion boundaries
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check if this is a truncation error that we can continue from
        if (wasTruncated && toolCall.function.name === 'write') {
          const { needsContinuation, extraction } = this.continuationHandler.detectNeedsContinuation(
            toolCall,
            true,
            error instanceof Error ? error : new Error(errorMessage)
          );

          if (needsContinuation && extraction?.success && extraction.content && extraction.filePath) {
            // Check if we've exceeded max attempts
            if (this.continuationHandler.hasExceededMaxAttempts(extraction.filePath)) {
              this.continuationHandler.abortContinuation(extraction.filePath);
              results.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: `Error: File operation for "${extraction.filePath}" failed after max continuation attempts. ${errorMessage}`
              });
              this.onProgress?.('tool_status', {
                toolIndex,
                status: 'failed',
                error: `Max continuation attempts exceeded for ${extraction.filePath}`
              });
            } else {
              // Buffer the partial content
              this.continuationHandler.bufferContent(extraction.filePath, extraction.content, toolCall.id);

              // Signal that continuation is needed
              continuationNeeded = true;
              continuationFilePath = extraction.filePath;

              results.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: `Partial content buffered for "${extraction.filePath}". Continuation in progress...`
              });

              this.onProgress?.('tool_status', {
                toolIndex,
                status: 'continuing',
                message: `Buffering content for ${extraction.filePath}, requesting continuation...`
              });

              // Don't process more tool calls in this batch - wait for continuation
              break;
            }
            continue;
          } else if (extraction?.filePath) {
            // We have a file path but couldn't extract content - truncation was too severe
            // Provide helpful guidance to retry with smaller operations
            const filePath = extraction.filePath;
            results.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Error: Tool call for "${filePath}" was truncated before content could be captured (max_tokens limit hit).

⚠️ IMPORTANT: Your response was cut off at the token limit. The write tool call was incomplete.

To fix this, please:
1. Use ONLY ONE tool call per response (don't batch multiple file operations)
2. For large files like CSS, split into multiple smaller operations:
   - First: Create file with basic structure
   - Then: Add sections incrementally with UPDATE operations
3. Keep each operation under 2000 characters

Example approach for ${filePath}:
\`\`\`
// Step 1: Create skeleton
write: { "file_path": "${filePath}", "operations": [{"type": "rewrite", "content": "/* Base styles */\\n\\n/* Layout */\\n\\n/* Components */\\n\\n/* Utilities */"}]}

// Step 2: Fill in sections with UPDATE operations
\`\`\``
            });
            this.onProgress?.('tool_status', {
              toolIndex,
              status: 'failed',
              error: `Tool call truncated for ${filePath} - retry with smaller operations`
            });
            continue;
          }
        }

        results.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: `Error: ${errorMessage}`
        });

        // Emit tool failure with error
        this.onProgress?.('tool_status', {
          toolIndex,
          status: 'failed',
          error: errorMessage
        });

        track('tool_call', extractToolAnalytics(toolCall.function.name, toolCall.function.arguments, false));
      }
    }

    return { results, continuationNeeded, continuationFilePath };
  }

  /**
   * Stream LLM response (reusing existing logic from original orchestrator)
   */
  private async streamLLMResponse(
    messages: AgentMessage[],
    agent: Agent
  ): Promise<{ content?: string; toolCalls?: ToolCall[]; usage?: UsageInfo; wasTruncated?: boolean; finishReason?: string; reasoningDetails?: ReasoningDetail[] }> {
    let { provider, apiKey, model } = this.getProviderConfig();

    // Refresh Codex OAuth token if needed before making the API call
    if (provider === 'openai-codex') {
      const { ensureValidCodexToken } = await import('@/lib/auth/codex-auth');
      apiKey = await ensureValidCodexToken();
    }

    await this.ensurePricing(provider, model);

    const tools = toolRegistry.getDefinitions(agent.tools);

    const apiUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/api/generate`
      : '/api/generate';

    // Strip ui_metadata from messages
    let sanitizedMessages = messages.map(msg => {
      const { ui_metadata, ...rest } = msg;
      return rest;
    });

    // If model has been failing to use function calling, inject a reminder into the system message
    if (this.totalMalformedToolCalls >= this.malformedThresholdForReminder && sanitizedMessages.length > 0) {
      sanitizedMessages = sanitizedMessages.map((msg, idx) => {
        if (idx === 0 && msg.role === 'system') {
          return {
            ...msg,
            content: msg.content + MALFORMED_TOOL_CALL_PERSISTENT_REMINDER
          };
        }
        return msg;
      });
    }

    // Check if reasoning is enabled for this model
    const reasoningEnabled = configManager.getReasoningEnabled(model);

    const requestBody = {
      messages: sanitizedMessages,
      apiKey,
      model,
      provider,
      tools,
      max_tokens: 16384,
      ...(tools && tools.length > 0 && { tool_choice: 'auto' }),
      ...(reasoningEnabled && { reasoning: { enabled: true } })
    };

    const response = await this.fetchWithRetry(
      apiUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      },
      3,
      this.handleRetry.bind(this)
    );

    if (!response.ok) {
      const status = response.status;
      let errorType = 'unknown';
      if (status === 429) errorType = 'rate_limit';
      else if (status === 401 || status === 403) errorType = 'auth';
      else if (status >= 500) errorType = 'server';
      else if (status === 400) errorType = 'invalid_request';

      track('api_error', { provider, model, error_type: errorType, status_code: status });

      let errorMessage = `API call failed: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = typeof errorData.error === 'string'
            ? errorData.error
            : (errorData.error.message || JSON.stringify(errorData.error));
        }
      } catch {}
      throw new Error(errorMessage);
    }

    return this.parseStreamingResponseWithTracking(response, provider, model);
  }

  /**
   * Create a new conversation node
   */
  private createConversation(agentType: AgentType): string {
    const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const conversation: ConversationNode = {
      id,
      agent_type: agentType,
      messages: [],
      metadata: {
        started_at: Date.now(),
        cost: 0,
        status: 'running'
      }
    };

    this.conversations.set(id, conversation);
    return id;
  }

  /**
   * Record auto checkpoint
   */
  private async recordAutoCheckpoint(description: string): Promise<Checkpoint> {
    const checkpoint = await checkpointManager.createCheckpoint(this.projectId, description, {
      kind: 'auto',
      baseRevisionId: saveManager.getSavedCheckpointId(this.projectId)
    });
    // Emit checkpoint created event
    this.onProgress?.('checkpoint_created', {
      checkpointId: checkpoint.id,
      description,
      timestamp: checkpoint.timestamp
    });

    return checkpoint;
  }

  /**
   * Get provider configuration
   */
  private getProviderConfig() {
    const provider = configManager.getSelectedProvider();
    const providerConfig = getProvider(provider);
    const apiKey = configManager.getProviderApiKey(provider);
    const model = this.model || configManager.getProviderModel(provider) || undefined;

    if (providerConfig.apiKeyRequired && !apiKey && !providerConfig.usesOAuth) {
      throw new Error(`API key not configured for provider: ${provider}`);
    }

    return {
      provider,
      providerConfig,
      apiKey: apiKey || '',
      model: model || 'default-model'
    };
  }

  /**
   * Handle retry notifications
   */
  private handleRetry(attempt: number, delay: number) {
    const message = `Rate limited. Retry attempt ${attempt} in ${delay/1000}s...`;
    logger.warn(message);

    // Emit retry event for debug panel
    this.onProgress?.('retry', {
      attempt,
      delay,
      reason: 'Rate limited',
      message
    });

    toast.info(message, {
      duration: delay > 2000 ? delay - 500 : 2000,
      description: 'Waiting for rate limit to reset'
    });
  }

  /**
   * Ensure pricing data is available
   */
  private async ensurePricing(provider: string, model: string): Promise<void> {
    const key = `${provider}:${model}`;
    if (this.pricingEnsured.has(key)) {
      return;
    }

    if (provider !== 'openrouter') {
      this.pricingEnsured.add(key);
      return;
    }

    if (configManager.getModelPricing('openrouter', model)) {
      this.pricingEnsured.add(key);
      return;
    }

    const cachedModels = configManager.getCachedModels('openrouter');
    if (cachedModels?.models?.length) {
      registerPricingFromProviderModels('openrouter', cachedModels.models);
      if (configManager.getModelPricing('openrouter', model)) {
        this.pricingEnsured.add(key);
        return;
      }
    }

    try {
      const models = await fetchAvailableModels();
      registerOpenRouterPricingFromApi(models);
      if (configManager.getModelPricing('openrouter', model)) {
        this.pricingEnsured.add(key);
      }
    } catch (error) {
      logger.warn('[MultiAgentOrchestrator] Failed to fetch pricing metadata', error);
    }
  }

  /**
   * Retry logic for HTTP requests
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 3,
    onRetry?: (attempt: number, delay: number) => void
  ): Promise<Response> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await fetch(url, options);

      if (response.status !== 429) {
        return response;
      }

      if (attempt === maxRetries) {
        return response;
      }

      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;

      onRetry?.(attempt + 1, delay);
      await sleep(delay);
    }

    throw new Error('Unexpected end of retry loop');
  }

  /**
   * Parse streaming response using helper
   */
  private async parseStreamingResponseWithTracking(
    response: Response,
    provider: string,
    model: string
  ): Promise<{ content?: string; toolCalls?: ToolCall[]; usage?: UsageInfo; wasTruncated?: boolean; finishReason?: string; reasoningDetails?: ReasoningDetail[] }> {
    const result = await parseStreamingResponse(response, {
      provider,
      model,
      onProgress: this.onProgress
    });

    // Update cost tracking
    if (result.usage) {
      const usage = result.usage;
      if (!usage.provider) usage.provider = provider;
      if (!usage.model) usage.model = model;

      const cost = CostCalculator.calculateCost(usage, provider, model, true);
      usage.cost = cost;

      this.totalUsage.promptTokens += usage.promptTokens;
      this.totalUsage.completionTokens += usage.completionTokens;
      this.totalUsage.totalTokens += usage.totalTokens;
      this.totalCost += cost;

      configManager.updateSessionCost(usage, cost);

      const sessionId = configManager.getCurrentSession()?.sessionId;
      if (!this.projectId.startsWith('test-')) {
        vfs.updateProjectCost(this.projectId, {
          cost,
          provider: usage.provider || provider || 'unknown',
          tokenUsage: {
            input: usage.promptTokens,
            output: usage.completionTokens
          },
          sessionId,
          mode: 'absolute'
        }).catch(err => logger.error('Failed to update project cost:', err));
      }

      this.onProgress?.('usage', { usage, totalCost: this.totalCost });
    }

    return result;
  }


  /**
   * Generate a normalized signature for a tool call to detect duplicates
   */
  private getToolCallSignature(toolCall: ToolCall): string {
    const toolName = toolCall.function?.name || 'unknown';

    try {
      const args = JSON.parse(toolCall.function.arguments);

      // Normalize the arguments for comparison
      if (toolName === 'shell') {
        // Normalize cmd to string format for consistent comparison
        const cmd = Array.isArray(args.cmd)
          ? args.cmd.join(' ')
          : String(args.cmd || '');
        return `shell:${cmd}`;
      }

      // For write, create signature from file_path + hashed operations
      if (toolName === 'write') {
        const filePath = args.file_path || '';
        // Hash entire operations parameter (string, array, or missing)
        const opsHash = this.hashString(JSON.stringify(args.operations || null));
        return `write:${filePath}:${opsHash}`;
      }

      // For other tools, use stable JSON stringify with recursive key sorting
      const sortedArgs = this.stableStringify(args);
      return `${toolName}:${sortedArgs}`;
    } catch {
      // If we can't parse arguments, use raw arguments string
      return `${toolName}:${toolCall.function.arguments}`;
    }
  }

  /**
   * Create a stable hash of a string
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Stable JSON stringify that sorts object keys recursively
   */
  private stableStringify(obj: any): string {
    return JSON.stringify(obj, (key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value).sort().reduce((sorted: any, k) => {
          sorted[k] = value[k];
          return sorted;
        }, {});
      }
      return value;
    });
  }

}
