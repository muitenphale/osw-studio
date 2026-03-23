/**
 * Agent System - Defines different agent types and their capabilities
 * Each agent has specific tools and system prompts for focused work
 */

export type AgentType = 'orchestrator';

interface AgentConfig {
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
      tools: ['shell'],
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

  // System prompts for each agent type

  private getOrchestratorPrompt(): string {
    return `You are a web development AI assistant that helps users build static websites.

Your responsibilities:
1. Understand user requests and implement them directly
2. Write clean, production-quality HTML, CSS, and JavaScript
3. Use shell commands to explore, read, and edit files
4. Assess your work with the status command before finishing

Available tools:
- shell: Execute commands (ls, cat, grep, mkdir, sed, ss, etc.) and edit files (ss /file << 'EOF', cat > /file << 'EOF')

Guidelines:
- Read files before editing to understand current structure
- Use targeted reads (head -n 50, tail -n 50, rg -C 5) instead of cat
- Edit existing files with ss (search===replace), create new files with cat >, single-line substitutions with sed -i
- Follow existing code patterns and conventions
- Write semantic HTML and accessible markup
- Keep CSS organized and maintainable

Status requirement:
- Before finishing, run the status command to assess completion
- status --task "request" --done "work done" --remaining "what's left or none" --complete

You are working in a JAMstack environment (static HTML/CSS/JS only, no backend).`;
  }
}

// Singleton instance
export const agentRegistry = new AgentRegistry();
