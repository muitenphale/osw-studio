/**
 * Agent System - Defines different agent types and their capabilities
 */

export type AgentType = 'orchestrator' | 'explore' | 'task' | 'plan' | 'setup';

interface AgentConfig {
  type: AgentType;
  tools: string[]; // Tool IDs from registry
  maxIterations: number;
  isReadOnly?: boolean; // If true, only allow read operations
}

/**
 * Agent class - Represents a specialized AI agent with specific capabilities
 */
export class Agent {
  public readonly type: AgentType;
  public readonly tools: string[];
  public readonly maxIterations: number;
  public readonly isReadOnly: boolean;

  constructor(config: AgentConfig) {
    this.type = config.type;
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
    this.register(new Agent({
      type: 'orchestrator',
      tools: ['shell'],
      maxIterations: 100
    }));

    this.register(new Agent({
      type: 'explore',
      tools: ['shell'],
      maxIterations: 5,
      isReadOnly: true
    }));

    this.register(new Agent({
      type: 'task',
      tools: ['shell'],
      maxIterations: 30
    }));

    this.register(new Agent({
      type: 'plan',
      tools: ['shell'],
      maxIterations: 10,
      isReadOnly: true
    }));

    this.register(new Agent({
      type: 'setup',
      tools: ['shell'],
      maxIterations: 20
    }));
  }

  private register(agent: Agent): void {
    this.agents.set(agent.type, agent);
  }

  get(type: AgentType): Agent | undefined {
    return this.agents.get(type);
  }
}

// Singleton instance
export const agentRegistry = new AgentRegistry();
