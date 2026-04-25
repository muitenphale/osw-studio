export type TestAssertion =
  | { type: 'file_exists'; path: string; description: string }
  | { type: 'file_not_exists'; path: string; description: string }
  | { type: 'file_contains'; path: string; value: string; description: string }
  | { type: 'file_not_contains'; path: string; value: string; description: string }
  | { type: 'file_matches'; path: string; pattern: string; description: string }
  | { type: 'file_matches_any'; paths: string[]; pattern: string; description: string }
  | { type: 'valid_json'; path: string; description: string }
  | { type: 'tool_used'; toolName: string; description: string }
  | { type: 'tool_args_match'; toolName: string; pattern: string; description: string }
  | { type: 'output_matches'; pattern: string; description: string }
  | { type: 'tool_output_matches'; toolName: string; pattern: string; description: string }
  | { type: 'judge'; criteria: string; description: string };

export interface AssertionResult {
  assertion: TestAssertion;
  passed: boolean;
  actual?: string;
}

export interface TestScenario {
  id: string;
  name: string;
  category: 'shell-read' | 'shell-write' | 'shell-search' | 'shell-text' | 'shell-preview' | 'file-editing' | 'status' | 'multi-tool' | 'delegate' | 'compaction' | 'setup';
  prompt: string;
  setupFiles?: Record<string, string>;
  assertions?: TestAssertion[];
  timeout?: number;
  /** Agent type to use (defaults to 'orchestrator'). */
  agentType?: import('@/lib/llm/agent').AgentType;
  /** If true, skip VFS project creation (e.g. setup agent tests). */
  skipProjectSetup?: boolean;
}

export interface TestTrack {
  id: string;
  name: string;
  description: string;
  scenarioIds: string[];
}

