/**
 * Tool Registry - Central registry for all available tools
 * Replaces if/else chains with declarative tool definitions and handlers
 */

import { ToolDefinition, ToolCall } from './types';
import { vfs } from '@/lib/vfs';
import { vfsShell } from '@/lib/vfs/cli-shell';
import { execStringPatch } from './string-patch';
import { logger } from '../utils';
import {
  isJSONTruncationError,
  attemptJSONRepair,
  extractPartialContent,
  analyzeOperationType,
  generateContinuationMessage,
  generateUnsafeOperationError
} from './json-repair';

export type ToolId = 'shell' | 'write' | 'evaluation';

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
        description: `Execute shell commands in the virtual file system.

Commands: cat, head, tail, ls, tree, grep, rg, find, mkdir, mv, cp, rm, touch, sed, echo, wc, curl, sqlite3.
Pipes (cmd1 | cmd2), redirects (> file, >> file), heredocs (<< 'EOF'), and brace expansion ({a,b,c}) are supported.

For large file writes, use heredoc: cat > /file << 'EOF'\\ncontent\\nEOF

Execute ONE command at a time as a single string.`,
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

          // Extract heredoc content if present (e.g., cat > file << 'EOF'\ncontent\nEOF)
          let heredocStdin: string | undefined;
          let cmdString = args.cmd;
          const heredocMatch = cmdString.match(/<<-?\s*['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\1\s*$/);
          if (heredocMatch) {
            heredocStdin = heredocMatch[2];
            cmdString = cmdString.slice(0, heredocMatch.index!).trim();
          }

          // Parse command string into array
          const cmdArray = parseShellCommand(cmdString);
          const command = cmdArray[0];

          // Block write operations in read-only mode
          if (context.isReadOnly && isWriteOperation(cmdArray)) {
            return `Error: Write operations are disabled in read-only mode. "${cmdArray[0]}" is not allowed.`;
          }

          // Check if this command requires server-side execution
          const serverCommands = ['sqlite3'];
          const deploymentId = vfs.getRuntimeDeploymentId();

          if (serverCommands.includes(command) && deploymentId) {
            // Proxy to server API for server-side execution
            try {
              const response = await fetch('/api/shell/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deploymentId, cmd: cmdArray })
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return `Error: ${errorData.stderr || 'Server request failed'}`;
              }

              const result = await response.json();

              if (result.exitCode === 0) {
                return result.stdout && result.stdout.trim().length > 0
                  ? result.stdout
                  : 'Command succeeded with no output';
              } else {
                return `Error: ${result.stderr || 'Command failed'}`;
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Server request failed';
              return `Error: ${message}`;
            }
          }

          // Execute command via browser-side VFS shell
          const result = await vfsShell.execute(projectId, cmdArray, heredocStdin);

          // Refresh server context if shell command modified .server/ files
          if (isWriteOperation(cmdArray) && cmdArray.some(a => a.includes('/.server/'))) {
            if (vfs.hasServerContext()) {
              await vfs.refreshServerContext();
            }
          }

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

    // Write tool - Write and edit files using structured operations
    this.register({
      id: 'write',
      definition: {
        name: 'write',
        description: `Write and edit files using structured operations.

operations must be a direct array, not a JSON string.

Operation types:
- UPDATE: {"type": "update", "oldStr": "exact text", "newStr": "replacement"} — oldStr must be unique
- REWRITE: {"type": "rewrite", "content": "complete file content"}
- REPLACE_ENTITY: {"type": "replace_entity", "selector": "opening pattern", "replacement": "new content"}`,
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
            let parsed = false;

            // Try 1: Direct parse
            try {
              args.operations = JSON.parse(args.operations);
              parsed = true;
            } catch {
              // Try 2: Fix literal newlines/tabs inside the JSON string
              try {
                const healed = args.operations
                  .replace(/\r\n/g, '\\n')
                  .replace(/\r/g, '\\n')
                  .replace(/\n/g, '\\n')
                  .replace(/\t/g, '\\t');
                args.operations = JSON.parse(healed);
                parsed = true;
              } catch {
                // Try 3: JSON structure repair (close truncated brackets)
                const repairResult = attemptJSONRepair(args.operations);
                if (repairResult.success) {
                  args.operations = repairResult.repaired;
                  parsed = true;
                } else {
                  // Try 4: Extract content for rewrite operations via regex
                  const extraction = extractPartialContent(args.operations);
                  if (extraction.success && extraction.content) {
                    args.file_path = extraction.filePath || args.file_path;
                    args.operations = [{ type: 'rewrite', content: extraction.content }];
                    parsed = true;
                  }
                }
              }
            }

            if (!parsed) {
              return `Error: operations parameter is a stringified JSON array that could not be parsed or healed.

Tip: Pass operations as a direct array, not a JSON string.
❌ Wrong: "operations": "[{...}]" (stringified)
✅ Correct: "operations": [{...}] (direct array)

For large file rewrites, use the shell tool with heredoc:
cat > /path/to/file << 'EOF'
file content here
EOF`;
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

          await vfs.init();

          const result = await execStringPatch(vfs, projectId, args.file_path, args.operations);

          // Refresh server context if write tool modified .server/ files
          if (result.applied && args.file_path?.startsWith('/.server/')) {
            if (vfs.hasServerContext()) {
              await vfs.refreshServerContext();
            }
          }

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
        description: 'Track progress on complex tasks. Not needed for simple tasks.',
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

          // Handle remaining_work - LLM sometimes sends as string "[]" instead of array
          let remainingWork: string[] = [];
          if (Array.isArray(args.remaining_work)) {
            remainingWork = args.remaining_work;
          } else if (typeof args.remaining_work === 'string') {
            try {
              const parsed = JSON.parse(args.remaining_work);
              if (Array.isArray(parsed)) remainingWork = parsed;
            } catch {
              // Not valid JSON, treat as single item if non-empty
              if (args.remaining_work.trim()) remainingWork = [args.remaining_work];
            }
          }

          // Handle blockers similarly
          let blockers: string[] = [];
          if (Array.isArray(args.blockers)) {
            blockers = args.blockers;
          } else if (typeof args.blockers === 'string') {
            try {
              const parsed = JSON.parse(args.blockers);
              if (Array.isArray(parsed)) blockers = parsed;
            } catch {
              if (args.blockers.trim()) blockers = [args.blockers];
            }
          }

          // Handle boolean fields - LLM sometimes sends as string "true"/"false"
          const parseBool = (val: any): boolean => {
            if (typeof val === 'boolean') return val;
            if (typeof val === 'string') {
              return val.toLowerCase() === 'true' || val === '1';
            }
            return Boolean(val);
          };

          const goalAchieved = parseBool(args.goal_achieved);
          const shouldContinue = parseBool(args.should_continue);

          const summary = [
            `Goal achieved: ${goalAchieved ? 'Yes' : 'No'}`,
            `Progress: ${args.progress_summary}`,
            remainingWork.length > 0 ? `Remaining: ${remainingWork.join(', ')}` : '',
            blockers.length > 0 ? `Blockers: ${blockers.join(', ')}` : '',
            `Should continue: ${shouldContinue ? 'Yes' : 'No'}`
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
      // Auto-route known shell commands called as standalone tools
      // LLMs sometimes call "cat", "curl", "grep" etc. as tool names instead of using shell
      const shellCommands = ['ls', 'tree', 'cat', 'head', 'tail', 'grep', 'rg', 'find', 'mkdir', 'touch', 'rm', 'mv', 'cp', 'echo', 'sed', 'wc', 'curl', 'sqlite3'];

      // Map common "read file" tool names to cat
      const readAliases: Record<string, string> = {
        'read': 'cat', 'read_file': 'cat', 'file_read': 'cat',
        'view': 'cat', 'view_file': 'cat',
      };

      const resolvedCommand = readAliases[toolId] || toolId;

      if (shellCommands.includes(resolvedCommand)) {
        const shellTool = this.get('shell');
        if (shellTool) {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const cmd = reconstructShellCommand(resolvedCommand, args);
            return await shellTool.executor.execute(projectId, { cmd }, context);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return `Error: ${msg}`;
          }
        }
      }
      return `Error: Unknown tool "${toolId}"`;
    }

    try {
      const args = JSON.parse(toolCall.function.arguments);
      return await tool.executor.execute(projectId, args, context);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if this is a JSON truncation error - attempt smart repair
      if (isJSONTruncationError(error)) {
        logger.warn(`[ToolRegistry] JSON truncation detected for ${toolId}, attempting repair...`);

        const repairResult = attemptJSONRepair(toolCall.function.arguments);

        if (repairResult.success) {
          // Successfully repaired JSON - check if it's safe to execute
          if (toolId === 'write') {
            const operations = repairResult.repaired?.operations;

            if (Array.isArray(operations) && operations.length > 0) {
              const safety = analyzeOperationType(operations);

              if (safety === 'safe') {
                // Safe to execute - these are rewrite operations that can be continued
                logger.info(`[ToolRegistry] Auto-executing repaired ${toolId} (safe operations)`);

                try {
                  const result = await tool.executor.execute(projectId, repairResult.repaired, context);

                  // Return success with continuation message
                  return generateContinuationMessage(
                    result,
                    repairResult.repaired.file_path || 'unknown',
                    operations,
                    repairResult.originalLength
                  );
                } catch (execError) {
                  const execMessage = execError instanceof Error ? execError.message : String(execError);
                  logger.error(`[ToolRegistry] Repaired ${toolId} execution failed:`, execMessage);
                  return `Error: Repaired JSON execution failed: ${execMessage}`;
                }
              } else if (safety === 'unsafe') {
                // Unsafe operations - don't execute, provide helpful error
                logger.warn(`[ToolRegistry] Repaired ${toolId} contains unsafe operations, not executing`);
                return generateUnsafeOperationError(operations, repairResult.originalLength);
              }
            }
          }

          // For other tools or unknown safety, log but don't execute
          logger.warn(`[ToolRegistry] Repaired ${toolId} but safety unknown, not executing`);
          return `Error: ${errorMessage}\n\nNote: JSON repair succeeded but operation type is unclear. Please split into smaller operations.`;
        } else {
          // Repair failed - provide helpful error message
          logger.error(`[ToolRegistry] JSON repair failed for ${toolId}:`, repairResult.error);
          return `Error: ${errorMessage}

JSON repair attempt failed. The tool call was likely truncated due to max_tokens limit.

💡 Solution: Split into smaller operations
• Each operation should be <2KB (~500 tokens)
• Use multiple sequential tool calls
• For large files, break into logical sections`;
        }
      }

      // Not a truncation error - return regular error
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

  // sed -i is a write operation (in-place edit), sed without -i is read-only (stdout)
  if (cmd[0] === 'sed' && cmd.includes('-i')) {
    return true;
  }

  // curl -o/--output writes to a file; plain curl is read-only
  if (cmd[0] === 'curl' && (cmd.includes('-o') || cmd.includes('--output'))) {
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

/**
 * Reconstruct a shell command string when the LLM calls a shell command as a standalone tool.
 * Handles various arg shapes: { cmd: "..." }, { url: "..." }, { file: "..." }, { path: "..." }, etc.
 */
function reconstructShellCommand(command: string, args: any): string {
  // If args already has a cmd string, prepend the command name if not already there
  if (typeof args.cmd === 'string') {
    const cmd = args.cmd.trim();
    return cmd.startsWith(command) ? cmd : `${command} ${cmd}`;
  }

  // Collect meaningful string values from args
  const parts: string[] = [command];

  // Common arg names LLMs use, in priority order
  const knownKeys = ['url', 'file', 'path', 'file_path', 'pattern', 'query', 'expression', 'text', 'content', 'args'];
  const flags = args.flags || args.options;

  // Add flags first if present
  if (typeof flags === 'string') {
    parts.push(flags);
  } else if (Array.isArray(flags)) {
    parts.push(...flags.filter((f: any) => typeof f === 'string'));
  }

  // Add known keys
  for (const key of knownKeys) {
    if (typeof args[key] === 'string' && args[key].trim()) {
      parts.push(args[key].trim());
    }
  }

  // If we only have the command name (no recognized args), try all string values
  if (parts.length === 1) {
    for (const [key, val] of Object.entries(args)) {
      if (typeof val === 'string' && val.trim() && key !== 'description') {
        parts.push(val.trim());
      }
    }
  }

  return parts.join(' ');
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
