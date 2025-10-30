/**
 * Multi-Agent Orchestrator - Manages agent execution and tool orchestration
 * Handles conversation state, checkpointing, and event streaming
 */

import { Agent, AgentType, agentRegistry } from './agent';
import { toolRegistry, ToolExecutionContext } from './tool-registry';
import { vfs, VirtualFile } from '@/lib/vfs';
import { checkpointManager, Checkpoint } from '@/lib/vfs/checkpoint';
import { saveManager } from '@/lib/vfs/save-manager';
import { configManager } from '@/lib/config/storage';
import { getProvider } from '@/lib/llm/providers/registry';
import { CostCalculator } from './cost-calculator';
import { ToolCall, UsageInfo } from './types';
import { GenerationAPIService, GenerationUsage } from './generation-api';
import { logger } from '@/lib/utils';
import { toast } from 'sonner';
import { registerOpenRouterPricingFromApi, registerPricingFromProviderModels } from './pricing-cache';
import { fetchAvailableModels } from './models-api';
import { parseStreamingResponse, buildFileTree } from './streaming-parser';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  // UI metadata for session recovery
  ui_metadata?: {
    checkpointId?: string;
    cost?: number;
    usage?: UsageInfo;
  };
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
  private lastCheckpointId: string | null = null;
  private chatMode: boolean;
  private model?: string;
  private lastToolCallSignature: string | null = null; // Loop detection
  private duplicateToolCallCount: number = 0; // Track consecutive duplicates
  private evaluationRequested = false; // Track if we requested evaluation
  private lastEvaluationResult: { should_continue: boolean } | null = null; // Track evaluation result

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
   * Execute user prompt
   */
  async execute(userPrompt: string): Promise<MultiAgentResult> {
    logger.info('[MultiAgentOrchestrator] Starting execution', { agent: this.rootAgent.type });

    // Reset loop detection for new execution
    this.lastToolCallSignature = null;
    this.duplicateToolCallCount = 0;

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

      // Build system prompt
      let systemPrompt = this.rootAgent.systemPrompt;
      if (fileTreeStr) {
        systemPrompt += `\n\n${fileTreeStr}`;
      }

      // Initialize conversation with system prompt
      this.addMessage(this.currentConversationId, {
        role: 'system',
        content: systemPrompt
      });

      // Add user prompt
      this.addMessage(this.currentConversationId, {
        role: 'user',
        content: userPrompt
      });

      // Run agent loop
      await this.runAgentLoop(this.currentConversationId, this.rootAgent);

      // Create final checkpoint
      await this.recordAutoCheckpoint(`After: ${userPrompt.substring(0, 60)}`);

      return {
        success: true,
        summary: this.generateSummary(),
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

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (this.stopped) {
        logger.info('[MultiAgentOrchestrator] Loop stopped by user');
        break;
      }

      // Notify progress
      this.onProgress?.('iteration', {
        current: iteration + 1,
        max: maxIterations,
        agent: agent.type
      });

      // Get LLM response
      this.onProgress?.('thinking', {});

      const response = await this.streamLLMResponse(
        conversation.messages,
        agent
      );

      // No tool calls - LLM wants to finish
      if (!response.toolCalls || response.toolCalls.length === 0) {
        if (response.content && response.content.trim()) {
          this.addMessage(conversationId, {
            role: 'assistant',
            content: response.content
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

      // Execute tool calls
      const toolResults = await this.executeToolCalls(
        response.toolCalls,
        conversationId,
        agent
      );

      // Add assistant message with tool calls
      this.addMessage(conversationId, {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls
      });

      // Add tool results
      for (const result of toolResults) {
        this.addMessage(conversationId, result);
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
    agent: Agent
  ): Promise<AgentMessage[]> {
    const results: AgentMessage[] = [];
    const conversation = this.conversations.get(conversationId)!;

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

      // Emit tool execution start
      this.onProgress?.('tool_status', {
        toolIndex,
        status: 'executing'
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

        // Capture evaluation result if this was an evaluation tool call
        if (toolId === 'evaluation') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            this.lastEvaluationResult = {
              should_continue: args.should_continue !== false // Default to true if not specified
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
          status: isError ? 'failed' : 'completed',
          result,
          ...(isError && { error: result })
        });

        // Also emit tool_result for backward compatibility
        this.onProgress?.('tool_result', {
          toolIndex,
          result
        });

        // Note: Checkpoint creation after each tool removed to reduce checkpoint frequency
        // Checkpoints are now only created at task completion boundaries
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
      }
    }

    return results;
  }

  /**
   * Stream LLM response (reusing existing logic from original orchestrator)
   */
  private async streamLLMResponse(
    messages: AgentMessage[],
    agent: Agent
  ): Promise<{ content?: string; toolCalls?: ToolCall[]; usage?: UsageInfo }> {
    const { provider, apiKey, model } = this.getProviderConfig();
    await this.ensurePricing(provider, model);

    const tools = toolRegistry.getDefinitions(agent.tools);

    const apiUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/api/generate`
      : '/api/generate';

    // Strip ui_metadata from messages
    const sanitizedMessages = messages.map(msg => {
      const { ui_metadata, ...rest } = msg;
      return rest;
    });

    const requestBody = {
      messages: sanitizedMessages,
      apiKey,
      model,
      provider,
      tools,
      ...(tools && tools.length > 0 && { tool_choice: 'auto' })
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
      let errorMessage = `API call failed: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {}
      throw new Error(errorMessage);
    }

    return this.parseStreamingResponseWithTracking(response, provider, model);
  }

  // Copy helper methods from original orchestrator
  // (parseStreamingResponse, fetchWithRetry, ensurePricing, etc.)
  // ... [These would be copied from orchestrator-v1.ts in the archive]

  /**
   * Create a new conversation node
   */
  private createConversation(agentType: AgentType, parentId?: string): string {
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
    this.lastCheckpointId = checkpoint.id;

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

    if (providerConfig.apiKeyRequired && !apiKey) {
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
  ): Promise<{ content?: string; toolCalls?: ToolCall[]; usage?: UsageInfo }> {
    const result = await parseStreamingResponse(response, {
      provider,
      model,
      projectId: this.projectId,
      onProgress: this.onProgress,
      onCostUpdate: (cost, usage) => {
        this.totalCost += cost;
        this.totalUsage.promptTokens += usage.promptTokens;
        this.totalUsage.completionTokens += usage.completionTokens;
        this.totalUsage.totalTokens += usage.totalTokens;

        // Update session and project costs
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

      // For json_patch, create signature from file_path + hashed operations
      if (toolName === 'json_patch') {
        const filePath = args.file_path || '';
        // Hash entire operations parameter (string, array, or missing)
        const opsHash = this.hashString(JSON.stringify(args.operations || null));
        return `json_patch:${filePath}:${opsHash}`;
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
        return Object.keys(value).sort().reduce((sorted: any, key) => {
          sorted[key] = value[key];
          return sorted;
        }, {});
      }
      return value;
    });
  }

  /**
   * Generate a summary of the task completion
   */
  private generateSummary(): string {
    return 'Task completed';
  }
}
