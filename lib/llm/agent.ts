/**
 * Agent System - Defines different agent types and their capabilities
 * Each agent has specific tools and system prompts for focused work
 */

export type AgentType = 'orchestrator';

export interface AgentConfig {
  type: AgentType;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[]; // Tool IDs from registry
  maxIterations: number;
  isReadOnly?: boolean; // If true, only allow read operations
}

/**
 * Agent class - Represents a specialized AI agent with specific capabilities
 */
export class Agent {
  public readonly type: AgentType;
  public readonly name: string;
  public readonly description: string;
  public readonly systemPrompt: string;
  public readonly tools: string[];
  public readonly maxIterations: number;
  public readonly isReadOnly: boolean;

  constructor(config: AgentConfig) {
    this.type = config.type;
    this.name = config.name;
    this.description = config.description;
    this.systemPrompt = config.systemPrompt;
    this.tools = config.tools;
    this.maxIterations = config.maxIterations;
    this.isReadOnly = config.isReadOnly ?? false;
  }

  /**
   * Check if this agent has access to a specific tool
   */
  hasTool(toolId: string): boolean {
    return this.tools.includes(toolId);
  }
}

/**
 * Agent Registry - Manages available agent types
 */
export class AgentRegistry {
  private agents: Map<AgentType, Agent> = new Map();

  constructor() {
    this.registerBuiltInAgents();
  }

  /**
   * Register all built-in agent types
   */
  private registerBuiltInAgents(): void {
    // Orchestrator - Top-level coordinator
    this.register(new Agent({
      type: 'orchestrator',
      name: 'Orchestrator',
      description: 'Direct execution agent for web development tasks',
      systemPrompt: this.getOrchestratorPrompt(),
      tools: ['shell', 'write', 'evaluation'],
      maxIterations: 100
    }));
  }

  /**
   * Register a new agent type
   */
  register(agent: Agent): void {
    this.agents.set(agent.type, agent);
  }

  /**
   * Get an agent by type
   */
  get(type: AgentType): Agent | undefined {
    return this.agents.get(type);
  }

  /**
   * Get all registered agents
   */
  getAll(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Check if an agent type exists
   */
  has(type: AgentType): boolean {
    return this.agents.has(type);
  }

  // System prompts for each agent type

  private getOrchestratorPrompt(): string {
    return `You are a web development AI assistant that helps users build static websites.

Your responsibilities:
1. Understand user requests and implement them directly
2. Write clean, production-quality HTML, CSS, and JavaScript
3. Use shell commands to explore and read files
4. Use write tool to edit files precisely
5. Evaluate your work before finishing

Available tools:
- shell: Execute commands (ls, cat, grep, mkdir, etc.)
- write: Edit files using structured operations
- evaluation: Required before finishing - assess whether the task is complete

Guidelines:
- Read files before editing to understand current structure
- Use targeted reads (head -n 50, tail -n 50, rg -C 5) instead of cat
- Make precise edits with write tool (ensure oldStr is unique)
- Follow existing code patterns and conventions
- Write semantic HTML and accessible markup
- Keep CSS organized and maintainable

Evaluation requirement:
- Before finishing, you MUST call the evaluation tool
- Assess whether the user's request has been fully completed
- If work remains (should_continue: true), you will continue working
- If complete (should_continue: false), the task will finish

You are working in a JAMstack environment (static HTML/CSS/JS only, no backend).`;
  }
}

// Singleton instance
export const agentRegistry = new AgentRegistry();
