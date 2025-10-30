/**
 * Tool Registry - Central registry for all available tools
 * Replaces if/else chains with declarative tool definitions and handlers
 */

import { ToolDefinition, ToolCall } from './types';
import { vfs, VirtualFileSystem } from '@/lib/vfs';
import { vfsShell } from '@/lib/vfs/cli-shell';
import { execStringPatch } from './string-patch';
import { logger } from '../utils';

export type ToolId = 'shell' | 'json_patch' | 'evaluation';

export interface ToolExecutor {
  /**
   * Execute the tool with given arguments
   * @param projectId - Current project ID
   * @param args - Tool arguments (parsed JSON)
   * @param context - Execution context (agent type, read-only mode, etc.)
   * @returns Tool execution result
   */
  execute(
    projectId: string,
    args: any,
    context: ToolExecutionContext
  ): Promise<string>;
}

export interface ToolExecutionContext {
  agentType?: string;
  isReadOnly?: boolean;
  onProgress?: (event: string, data?: any) => void;
}

export interface RegisteredTool {
  id: ToolId;
  definition: ToolDefinition;
  executor: ToolExecutor;
}

/**
 * Tool Registry - Manages all available tools
 */
export class ToolRegistry {
  private tools: Map<ToolId, RegisteredTool> = new Map();

  constructor() {
    this.registerBuiltInTools();
  }

  /**
   * Register all built-in tools
   */
  private registerBuiltInTools(): void {
    // Shell tool - Execute shell commands
    this.register({
      id: 'shell',
      definition: {
        name: 'shell',
        description: `Execute shell commands to interact with the file system.

Available commands:
- File reading: cat, head, tail, nl
- Directory listing: ls, tree
- Search: grep, rg (ripgrep), find
- File operations: mkdir, mv, cp, rm, rmdir, touch
- Other: echo

IMPORTANT: Execute ONE command at a time. Pass the complete command as a single string.

Brace Expansion Support:
The shell supports bash-style brace expansion - use {a,b,c} syntax to create multiple arguments.
- {"cmd": "mkdir templates/{layout,components,pages}"}  → Creates 3 directories
- {"cmd": "touch src/{index,app,utils}.js"}  → Creates 3 files

Multiple Arguments:
- mkdir, touch, rm, cat support multiple paths
- {"cmd": "mkdir dir1 dir2 dir3"}  → Creates 3 directories
- {"cmd": "touch file1.txt file2.txt file3.txt"}  → Creates 3 files

Examples:
- {"cmd": "ls -la /"}
- {"cmd": "cat /index.html /app.js /style.css"}  ← Multiple files
- {"cmd": "mkdir -p templates/components/{post,comment,user}"}  ← Brace expansion
- {"cmd": "touch file1.txt file2.txt"}  ← Multiple files
- {"cmd": "grep -r pattern /"}`,
        parameters: {
          type: 'object',
          properties: {
            cmd: {
              type: 'string',
              description: 'Single shell command to execute (complete command with all arguments as a string)'
            }
          },
          required: ['cmd']
        }
      },
      executor: {
        execute: async (projectId, args, context) => {
          // Validate command is a string
          if (typeof args.cmd !== 'string') {
            return 'Error: cmd must be a string. Pass the complete command as a single string (e.g., "ls -la /")';
          }

          // Parse command string into array
          const cmdArray = parseShellCommand(args.cmd);

          // Block write operations in read-only mode
          if (context.isReadOnly && isWriteOperation(cmdArray)) {
            return `Error: Write operations are disabled in read-only mode. "${cmdArray[0]}" is not allowed.`;
          }

          // Execute command
          const result = await vfsShell.execute(projectId, cmdArray);

          if (result.success) {
            return result.stdout && result.stdout.trim().length > 0
              ? result.stdout
              : 'Command succeeded with no output';
          } else {
            const message = result.stderr && result.stderr.trim().length > 0 ? result.stderr : 'Command failed';
            return `Error: ${message}`;
          }
        }
      }
    });

    // JSON Patch tool - Edit files using structured operations
    this.register({
      id: 'json_patch',
      definition: {
        name: 'json_patch',
        description: `Edit files using structured patch operations. Supports three operation types:

IMPORTANT: The 'operations' parameter must be a direct array, NOT a JSON string.
❌ Wrong: "operations": "[{...}]"
✅ Correct: "operations": [{...}]

1. UPDATE - Replace exact string (must be unique in file):
   {"type": "update", "oldStr": "exact text to find", "newStr": "replacement text"}

2. REWRITE - Replace entire file content:
   {"type": "rewrite", "content": "complete new file content"}

3. REPLACE_ENTITY - Replace code entity (function, CSS rule, HTML element) by opening pattern:
   {"type": "replace_entity", "selector": "opening pattern", "replacement": "new entity content"}

Examples:
{
  "file_path": "/index.html",
  "operations": [
    {"type": "update", "oldStr": "<title>Old Title</title>", "newStr": "<title>New Title</title>"}
  ]
}

{
  "file_path": "/style.css",
  "operations": [
    {"type": "rewrite", "content": "body { margin: 0; padding: 0; }"}
  ]
}

{
  "file_path": "/app.js",
  "operations": [
    {"type": "replace_entity", "selector": "function myFunc()", "replacement": "function myFunc() { return true; }"}
  ]
}`,
        parameters: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to file to edit (must start with /)'
            },
            operations: {
              type: 'array',
              description: 'Array of patch operations',
              items: {
                oneOf: [
                  {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['update'], description: 'Update operation type' },
                      oldStr: { type: 'string', description: 'Exact text to find (must be unique)' },
                      newStr: { type: 'string', description: 'Replacement text' }
                    },
                    required: ['type', 'oldStr', 'newStr']
                  },
                  {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['rewrite'], description: 'Rewrite operation type' },
                      content: { type: 'string', description: 'Complete new file content' }
                    },
                    required: ['type', 'content']
                  },
                  {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['replace_entity'], description: 'Replace entity operation type' },
                      selector: { type: 'string', description: 'Opening pattern to identify entity' },
                      replacement: { type: 'string', description: 'New entity content' },
                      entity_type: { type: 'string', description: 'Optional: html_element, function, css_rule, etc.' }
                    },
                    required: ['type', 'selector', 'replacement']
                  }
                ]
              } as any
            }
          },
          required: ['file_path', 'operations']
        }
      },
      executor: {
        execute: async (projectId, args, context) => {
          // Block in read-only mode
          if (context.isReadOnly) {
            return 'Error: File editing is disabled in read-only mode.';
          }

          // Check if operations itself is a string (the whole array was stringified)
          if (typeof args.operations === 'string') {
            try {
              args.operations = JSON.parse(args.operations);
            } catch (error) {
              const parseError = error instanceof Error ? error.message : String(error);
              return `Error: operations parameter appears to be a stringified JSON array, but parsing failed.

This usually means the JSON is malformed or truncated. Common causes:
1. Content string not properly escaped or too long
2. JSON syntax error in the operations array
3. Unclosed quotes or brackets

Parse error: ${parseError}

For large file rewrites, ensure:
- Content is properly escaped (use raw strings or escape quotes)
- JSON is complete and valid
- Consider breaking very large content into smaller operations

❌ Wrong: "operations": "[{...}]" (stringified)
✅ Correct: "operations": [{...}] (direct array)`;
            }
          }

          // Auto-parse double-encoded JSON (common LLM mistake)
          if (Array.isArray(args.operations)) {
            args.operations = args.operations.map((op: any) => {
              // If it's a string that looks like JSON (starts with { or [), try to parse it
              if (typeof op === 'string' && /^\s*[{\[]/.test(op)) {
                try {
                  return JSON.parse(op);
                } catch {
                  // Return as-is if parse fails - will trigger normal validation error
                  return op;
                }
              }
              return op;
            });
          }

          const vfs = new VirtualFileSystem();
          await vfs.init();

          const result = await execStringPatch(vfs, projectId, args.file_path, args.operations);

          let resultMessage = result.summary;
          if (result.warnings && result.warnings.length > 0) {
            resultMessage += '\n\nWarnings:\n' + result.warnings.map(w => `• ${w}`).join('\n');
          }

          // If no operations were applied, treat as error
          if (!result.applied) {
            return `Error: ${resultMessage}`;
          }

          return resultMessage;
        }
      }
    });

    // Evaluation tool - Self-assessment and progress tracking
    this.register({
      id: 'evaluation',
      definition: {
        name: 'evaluation',
        description: 'Assess whether the task has been completed successfully. Required before finishing work.',
        parameters: {
          type: 'object',
          properties: {
            goal_achieved: {
              type: 'boolean',
              description: 'Whether the original task/goal has been fully achieved'
            },
            progress_summary: {
              type: 'string',
              description: 'Brief summary of work completed so far'
            },
            remaining_work: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of specific tasks still needed. Empty array if goal_achieved is true.'
            },
            blockers: {
              type: 'array',
              items: { type: 'string' },
              description: 'Current blockers preventing progress. Empty array if no blockers.'
            },
            reasoning: {
              type: 'string',
              description: 'Detailed explanation of current status and next steps'
            },
            should_continue: {
              type: 'boolean',
              description: 'Whether to continue working (false if complete or permanently blocked)'
            }
          },
          required: ['goal_achieved', 'progress_summary', 'remaining_work', 'reasoning', 'should_continue']
        }
      },
      executor: {
        execute: async (projectId, args, context) => {
          // Evaluation is handled by orchestrator loop logic
          // This executor just formats the response for the LLM
          const summary = [
            `Goal achieved: ${args.goal_achieved ? 'Yes' : 'No'}`,
            `Progress: ${args.progress_summary}`,
            args.remaining_work.length > 0 ? `Remaining: ${args.remaining_work.join(', ')}` : '',
            args.blockers && args.blockers.length > 0 ? `Blockers: ${args.blockers.join(', ')}` : '',
            `Should continue: ${args.should_continue ? 'Yes' : 'No'}`
          ].filter(Boolean).join('\n');

          return summary;
        }
      }
    });
  }

  /**
   * Register a new tool
   */
  register(tool: RegisteredTool): void {
    this.tools.set(tool.id, tool);
  }

  /**
   * Get a tool by ID
   */
  get(id: ToolId): RegisteredTool | undefined {
    return this.tools.get(id);
  }

  /**
   * Get tool definition by ID
   */
  getDefinition(id: ToolId): ToolDefinition | undefined {
    return this.tools.get(id)?.definition;
  }

  /**
   * Get tool executor by ID
   */
  getExecutor(id: ToolId): ToolExecutor | undefined {
    return this.tools.get(id)?.executor;
  }

  /**
   * Get all tool definitions for a list of tool IDs
   */
  getDefinitions(toolIds: string[]): ToolDefinition[] {
    return toolIds
      .map(id => this.getDefinition(id as ToolId))
      .filter((def): def is ToolDefinition => def !== undefined);
  }

  /**
   * Execute a tool call
   */
  async execute(
    toolCall: ToolCall,
    projectId: string,
    context: ToolExecutionContext
  ): Promise<string> {
    const toolId = toolCall.function?.name as ToolId;
    const tool = this.get(toolId);

    if (!tool) {
      return `Error: Unknown tool "${toolId}"`;
    }

    try {
      const args = JSON.parse(toolCall.function.arguments);
      return await tool.executor.execute(projectId, args, context);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Tool execution error (${toolId}):`, errorMessage);
      return `Error: ${errorMessage}`;
    }
  }

  /**
   * Check if a tool exists
   */
  has(id: ToolId): boolean {
    return this.tools.has(id);
  }

  /**
   * Get all registered tools
   */
  getAll(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }
}

/**
 * Parse a shell command string into an array of arguments
 */
function parseShellCommand(cmdStr: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  let escaped = false;

  for (let i = 0; i < cmdStr.length; i++) {
    const char = cmdStr[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      } else {
        current += char;
      }
    } else {
      if (char === '"' || char === "'") {
        inQuotes = true;
        quoteChar = char;
      } else if (char === ' ' || char === '\t') {
        if (current.length > 0) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
  }

  if (current.length > 0) {
    args.push(current);
  }

  // Expand brace patterns like {a,b,c} (bash brace expansion)
  return expandBraces(args);
}

/**
 * Expand brace patterns in arguments (e.g., "file{1,2,3}.txt" -> ["file1.txt", "file2.txt", "file3.txt"])
 */
function expandBraces(args: string[]): string[] {
  const expanded: string[] = [];

  for (const arg of args) {
    // Check if arg contains brace expansion pattern
    const braceMatch = arg.match(/^(.+)\{([^}]+)\}(.*)$/);

    if (braceMatch) {
      const [, prefix, items, suffix] = braceMatch;
      const itemList = items.split(',').map(item => item.trim());
      for (const item of itemList) {
        expanded.push(prefix + item + suffix);
      }
    } else {
      expanded.push(arg);
    }
  }

  return expanded;
}

/**
 * Check if a command is a write operation
 */
function isWriteOperation(cmd: string[]): boolean {
  if (!cmd || cmd.length === 0) return false;

  const writeCommands = ['mkdir', 'rm', 'rmdir', 'mv', 'cp', 'touch'];

  // Check if the command is a known write operation
  if (writeCommands.includes(cmd[0])) {
    return true;
  }

  // Check for echo with redirection (echo > file or echo >> file)
  if (cmd[0] === 'echo') {
    // Look for > or >> in any argument
    return cmd.some(arg => arg === '>' || arg === '>>');
  }

  // Check for redirection operators in any command
  // This catches cases like: cat file > output.txt
  return cmd.some(arg => arg === '>' || arg === '>>');
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
