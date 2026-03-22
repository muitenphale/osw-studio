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
import { drainRuntimeErrors, formatRuntimeErrors, resetRuntimeErrors } from '@/lib/preview/runtime-errors';
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
                               /```(?:shell|bash|sh)\s*\n[\s\S]*?\n```\s*$/.test(trimmed);

  return endsWithToolPattern;
}

const MALFORMED_TOOL_CALL_ERROR = `⛔ CRITICAL ERROR: You wrote a tool call as TEXT instead of invoking it.

This is WRONG - you wrote text like:
  shell{"cmd": "..."}
  \`\`\`shell
  command
  \`\`\`

This is RIGHT - invoke tools directly via function calling:
  Call shell tool with parameter cmd="your command"

You MUST use function calling. DO NOT write tool syntax as text.
STOP writing text. START invoking tools. Try again NOW.`;

const MALFORMED_TOOL_CALL_PERSISTENT_REMINDER = `

⚠️ REMINDER: You have been writing tool calls as text instead of invoking them.
EVERY time you want to use a tool, you MUST invoke it via function calling.
DO NOT write shell{"cmd":...} as text - INVOKE the tools directly.`;

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
  private recentToolSignatures: string[] = []; // Window for pattern loop detection
  private readonly patternWindowSize = 8; // How many recent calls to track (max cycle 4 * threshold 2)
  private readonly patternRepeatThreshold = 2; // How many repeats of a pattern to trigger termination
  private nudgeCount = 0; // Track how many times we've nudged for status
  private readonly maxNudges = 3; // Max nudge attempts before giving up
  private lastStatusResult: { task: string; done: string; remaining: string; complete: boolean; hasExplicitFlag: boolean } | null = null; // Track status result
  private malformedToolCallRetries = 0; // Track consecutive retries for malformed tool call detection
  private totalMalformedToolCalls = 0; // Track total malformed calls in session (doesn't reset)
  private readonly maxMalformedRetries = 2; // Max consecutive retries before allowing through
  private readonly malformedThresholdForReminder = 3; // After this many total failures, add persistent reminder
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
    this.recentToolSignatures = [];
    this.nudgeCount = 0;
    this.lastStatusResult = null;

    try {
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
    let lastIteration = 0;

    // Clear runtime error state so previous generation errors don't leak in
    resetRuntimeErrors();

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      lastIteration = iteration;
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
            nudgeCount: this.nudgeCount,
            iteration
          });
        }

        if (hasContent) {
          this.addMessage(conversationId, {
            role: 'assistant',
            content: response.content!
          });
        }

        // Check structured status result
        if (this.lastStatusResult) {
          if (this.lastStatusResult.complete) {
            // Gate: check for runtime errors before allowing completion
            await new Promise(resolve => setTimeout(resolve, 400));
            const runtimeErrors = drainRuntimeErrors();
            if (runtimeErrors.length > 0) {
              logger.info(`[MultiAgentOrchestrator] Completion blocked: ${runtimeErrors.length} runtime error(s)`);
              this.addMessage(conversationId, {
                role: 'user',
                content: formatRuntimeErrors(runtimeErrors),
                ui_metadata: { isSyntheticError: true }
              });
              this.lastStatusResult = null;
              continue;
            }
            logger.info('[MultiAgentOrchestrator] Exit: status --complete flag');
            this.onProgress?.('exit_reason', { reason: 'status_complete', iteration });
            break;
          } else if (this.lastStatusResult.hasExplicitFlag) {
            logger.info('[MultiAgentOrchestrator] Status --incomplete flag, continuing');
            this.lastStatusResult = null;
            this.nudgeCount = 0;
            continue;
          } else {
            // No flag — fall back to remaining field
            const rem = this.lastStatusResult.remaining.trim().toLowerCase();
            if (!rem || rem === 'none' || rem === 'n/a' || rem === 'nothing') {
              // Gate: check for runtime errors before allowing completion
              await new Promise(resolve => setTimeout(resolve, 400));
              const runtimeErrors = drainRuntimeErrors();
              if (runtimeErrors.length > 0) {
                logger.info(`[MultiAgentOrchestrator] Completion blocked: ${runtimeErrors.length} runtime error(s)`);
                this.addMessage(conversationId, {
                  role: 'user',
                  content: formatRuntimeErrors(runtimeErrors),
                  ui_metadata: { isSyntheticError: true }
                });
                this.lastStatusResult = null;
                continue;
              }
              logger.info('[MultiAgentOrchestrator] Exit: status remaining empty/none (fallback)');
              this.onProgress?.('exit_reason', { reason: 'status_remaining_empty', iteration });
              break;
            } else {
              logger.info('[MultiAgentOrchestrator] Status remaining has content, continuing');
              this.lastStatusResult = null;
              this.nudgeCount = 0;
              continue;
            }
          }
        }

        // No status yet - nudge (up to maxNudges times)
        if (this.nudgeCount < this.maxNudges) {
          this.nudgeCount++;
          logger.info(`[MultiAgentOrchestrator] Nudge ${this.nudgeCount}/${this.maxNudges}`);
          this.onProgress?.('nudge', { attempt: this.nudgeCount, max: this.maxNudges });
          const nudgeMessage = 'Before finishing, run the status command:\n  status --task "..." --done "..." --remaining "..." --complete';
          this.addMessage(conversationId, {
            role: 'user',
            content: nudgeMessage
          });
          continue;
        }

        // Exhausted all nudge attempts - finish without status
        logger.warn(`[MultiAgentOrchestrator] Exit: nudge exhaustion (${this.maxNudges} nudges)`);
        this.onProgress?.('exit_reason', { reason: 'nudge_exhaustion', nudges: this.maxNudges, iteration });
        break;
      }

      // Execute tool calls
      const toolResults = await this.executeToolCalls(
        response.toolCalls,
        agent
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

      // Check status result immediately after tool execution
      if (this.lastStatusResult) {
        const isDone = this.lastStatusResult.complete || (
          !this.lastStatusResult.hasExplicitFlag &&
          (!this.lastStatusResult.remaining.trim() ||
            ['none', 'n/a', 'nothing'].includes(this.lastStatusResult.remaining.trim().toLowerCase()))
        );
        if (isDone) {
          // Gate: check for runtime errors before allowing completion.
          // Wait for the latest compilation to settle, then drain.
          await new Promise(resolve => setTimeout(resolve, 400));
          const runtimeErrors = drainRuntimeErrors();
          if (runtimeErrors.length > 0) {
            logger.info(`[MultiAgentOrchestrator] Completion blocked: ${runtimeErrors.length} runtime error(s)`);
            this.addMessage(conversationId, {
              role: 'user',
              content: formatRuntimeErrors(runtimeErrors),
              ui_metadata: { isSyntheticError: true }
            });
            this.lastStatusResult = null;
            continue;
          }

          const reason = this.lastStatusResult.complete ? 'status_complete_post_tool' : 'status_remaining_empty_post_tool';
          logger.info(`[MultiAgentOrchestrator] Exit: ${reason}`);
          this.onProgress?.('exit_reason', { reason, iteration });
          break;
        }
      }
    }

    // Check if loop exhausted max iterations
    if (lastIteration >= maxIterations - 1 && !this.stopped) {
      logger.warn(`[MultiAgentOrchestrator] Exit: max iterations reached (${maxIterations})`);
      this.onProgress?.('exit_reason', { reason: 'max_iterations', maxIterations, iteration: lastIteration });
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
    agent: Agent
  ): Promise<AgentMessage[]> {
    const results: AgentMessage[] = [];

    for (let toolIndex = 0; toolIndex < toolCalls.length; toolIndex++) {
      const toolCall = toolCalls[toolIndex];

      if (this.stopped) break;

      // Sanitize tool name: strip <|...|> tokens that some models emit (e.g. shell<|channel|>)
      const rawToolId = toolCall.function?.name;
      const toolId = rawToolId?.replace(/<\|[^|]*\|>[a-z]*/gi, '').trim();

      if (!toolId) {
        results.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: 'Error: Tool call has no function name. Available tools: shell.'
        });
        this.onProgress?.('tool_status', { toolIndex, status: 'failed', toolName: '(empty)', args: toolCall.function?.arguments });
        continue;
      }

      // Check if agent has access to this tool
      if (!agent.hasTool(toolId)) {
        const knownShellCommands = new Set([
          'ls', 'tree', 'cat', 'head', 'tail', 'rg', 'grep', 'find',
          'mkdir', 'touch', 'rm', 'mv', 'cp', 'echo', 'sed', 'wc',
          'sort', 'uniq', 'tr', 'curl', 'sqlite3', 'build', 'status'
        ]);
        let errorMsg: string;
        if (knownShellCommands.has(toolId)) {
          // Model hallucinated a shell command as a tool name
          errorMsg = `Error: "${toolId}" is not a tool — it is a shell command. Use the shell tool to run it:\n\n  shell({ cmd: "${toolId} ..." })`;
        } else {
          // Completely unknown tool — list available tools and commands
          errorMsg = `Error: Unknown tool "${toolId}". Available tools: shell.\n\nThe shell tool supports these commands: ls, tree, cat, head, tail, rg, grep, find, mkdir, touch, rm, mv, cp, echo, sed, wc, sort, uniq, tr, curl, sqlite3, build, status`;
        }
        results.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: errorMsg
        });
        this.onProgress?.('tool_status', {
          toolIndex,
          status: 'failed',
          toolName: toolId,
          args: toolCall.function?.arguments
        });
        continue;
      }

      // Loop detection - check for consecutive duplicate tool calls
      const currentSignature = this.getToolCallSignature(toolCall);
      if (this.lastToolCallSignature === currentSignature) {
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

      // Pattern loop detection — track recent signatures in a sliding window
      this.recentToolSignatures.push(currentSignature);
      if (this.recentToolSignatures.length > this.patternWindowSize) {
        this.recentToolSignatures.shift();
      }
      if (this.recentToolSignatures.length === this.patternWindowSize) {
        const repeatingPattern = this.detectRepeatingPattern(this.recentToolSignatures);
        if (repeatingPattern) {
          logger.error(`[MultiAgentOrchestrator] Repeating pattern detected (cycle length ${repeatingPattern}), terminating`);
          throw new Error(`Execution terminated: Repeating tool call pattern detected. The model appears stuck in a loop.`);
        }
      }

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
        // Execute tool
        const result = await toolRegistry.execute(toolCall, this.projectId, context);

        // Detect `status --task ... --done ... --remaining ...` in shell commands
        if (toolId === 'shell' && !this.lastStatusResult) {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const cmd = typeof args.cmd === 'string' ? args.cmd : '';
            const statusResult = this.extractStatusResult(cmd, result);
            if (statusResult) {
              this.lastStatusResult = statusResult;
              logger.info(`[MultiAgentOrchestrator] Captured status result: remaining="${statusResult.remaining}"`);
            }
          } catch {
            // Ignore parse errors
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

        this.onProgress?.('tool_result', {
          toolIndex,
          result
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

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

    return results;
  }

  /**
   * Stream LLM response
   */
  private async streamLLMResponse(
    messages: AgentMessage[],
    agent: Agent
  ): Promise<{ content?: string; toolCalls?: ToolCall[]; usage?: UsageInfo; reasoningDetails?: ReasoningDetail[] }> {
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
  ): Promise<{ content?: string; toolCalls?: ToolCall[]; usage?: UsageInfo; reasoningDetails?: ReasoningDetail[] }> {
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
   * Extract status result from a shell command or its output.
   * Detects: `status --task "..." --done "..." --remaining "..." --complete`
   */
  private extractStatusResult(cmd: string, output: string): { task: string; done: string; remaining: string; complete: boolean; hasExplicitFlag: boolean } | null {
    // 1. Check the command itself for `status --task ... --done ... --remaining ...`
    if (/^\s*status\b/i.test(cmd)) {
      const taskMatch = cmd.match(/--task\s+"([^"]*)"/) || cmd.match(/--task\s+'([^']*)'/) || cmd.match(/--task\s+(\S+)/);
      const doneMatch = cmd.match(/--done\s+"([^"]*)"/) || cmd.match(/--done\s+'([^']*)'/) || cmd.match(/--done\s+(\S+)/);
      const remainingMatch = cmd.match(/--remaining\s+"([^"]*)"/) || cmd.match(/--remaining\s+'([^']*)'/) || cmd.match(/--remaining\s+(\S+)/);
      const hasComplete = /--complete\b/.test(cmd);
      const hasIncomplete = /--incomplete\b/.test(cmd);
      if (taskMatch && doneMatch) {
        return {
          task: taskMatch[1],
          done: doneMatch[1],
          remaining: remainingMatch ? remainingMatch[1] : 'none',
          complete: hasComplete && !hasIncomplete,
          hasExplicitFlag: hasComplete || hasIncomplete
        };
      }
    }

    // 2. Check shell output for Task:/Done:/Remaining:/Complete: lines (from cli-shell status handler)
    if (output) {
      const taskLine = output.match(/^Task:\s*(.+)/im);
      const doneLine = output.match(/^Done:\s*(.+)/im);
      const remainingLine = output.match(/^Remaining:\s*(.*)/im);
      const completeLine = output.match(/^Complete:\s*(yes|no)/im);
      if (taskLine && doneLine) {
        return {
          task: taskLine[1].trim(),
          done: doneLine[1].trim(),
          remaining: remainingLine ? remainingLine[1].trim() : 'none',
          complete: completeLine ? completeLine[1].toLowerCase() === 'yes' : false,
          hasExplicitFlag: !!completeLine
        };
      }
    }

    return null;
  }

  /**
   * Detect repeating patterns in a window of tool call signatures.
   * Checks for cycles of length 1-4 that repeat at least patternRepeatThreshold times.
   * e.g. [A,B,A,B,A,B,A,B,A,B,A,B] → cycle length 2, repeated 6 times.
   * Returns the cycle length if found, null otherwise.
   */
  private detectRepeatingPattern(signatures: string[]): number | null {
    const len = signatures.length;
    // Check cycle lengths 2 through 4 (length 1 handled by consecutive duplicate check)
    for (let cycleLen = 2; cycleLen <= 4; cycleLen++) {
      if (len < cycleLen * this.patternRepeatThreshold) continue;
      // Check if the last N entries are all repetitions of the same cycle
      const checkLen = cycleLen * this.patternRepeatThreshold;
      const tail = signatures.slice(len - checkLen);
      const cycle = tail.slice(0, cycleLen);
      let isRepeating = true;
      for (let i = cycleLen; i < checkLen; i++) {
        if (tail[i] !== cycle[i % cycleLen]) {
          isRepeating = false;
          break;
        }
      }
      if (isRepeating) return cycleLen;
    }
    return null;
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

      // Fallback for unknown tool names: use stable JSON stringify
      const sortedArgs = this.stableStringify(args);
      return `${toolName}:${sortedArgs}`;
    } catch {
      // If we can't parse arguments, use raw arguments string
      return `${toolName}:${toolCall.function.arguments}`;
    }
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
