/**
 * Tool Registry - Central registry for all available tools
 * Replaces if/else chains with declarative tool definitions and handlers
 */

import { ToolDefinition, ToolCall } from './types';
import { vfs } from '@/lib/vfs';
import { vfsShell } from '@/lib/vfs/cli-shell';
import { logger } from '../utils';
import {
  isJSONTruncationError,
  attemptJSONRepair,
} from './json-repair';
import { scriptRunner } from '@/lib/scripting/script-runner';
import type { ScriptRuntime } from '@/lib/scripting/types';

export type ToolId = 'shell';

interface ToolExecutor {
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

interface RegisteredTool {
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
        description: `Run shell commands in the virtual file system.

Commands: cat, head, tail, ls, tree, grep, rg, find, mkdir, mv, cp, rm, touch, sed, ss, echo, wc, sort, uniq, tr, curl, sqlite3, python, python3, lua, preview, build, status, delegate, runtime.
Pipes (cmd1 | cmd2), redirects (> file, >> file), heredocs (<< 'EOF'), chaining (&&, ||, ;), and brace expansion ({a,b,c}) are supported.
Run scripts: python <file>, lua <file>. Show output in preview: preview <path>.

Edit existing files: ss /file << 'EOF'\\nsearch\\n===\\nreplacement\\nEOF
Create new files: cat > /file << 'EOF'\\ncontent\\nEOF

One command at a time as a single string.`,
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

          // Extract heredoc content if present
          // Supports both orderings:
          //   cat > file << 'EOF'\ncontent\nEOF   (standard)
          //   cat << 'EOF' > file\ncontent\nEOF   (reversed — common with Gemini models)
          // Also handles chained commands after the heredoc (e.g., ... EOF\npython file.py)
          let heredocStdin: string | undefined;
          let cmdString = unescapeHtmlEntities(args.cmd);
          let trailingCommands: string | undefined;
          const heredocMatch = cmdString.match(/<<-?\s*['"]?(\w+)['"]?([^\n]*)\n([\s\S]*)\n\1(?:[ \t]*\n([\s\S]+))?\s*$/);
          if (heredocMatch) {
            heredocStdin = heredocMatch[3];
            cmdString = cmdString.slice(0, heredocMatch.index!).trim();
            // Append any content after the delimiter but before the newline
            // (e.g., " > file" from "cat << 'EOF' > file")
            const afterDelimiter = (heredocMatch[2] || '').trim();
            if (afterDelimiter) {
              cmdString = cmdString + ' ' + afterDelimiter;
            }
            if (heredocMatch[4]) {
              trailingCommands = heredocMatch[4].trim();
            }
          }

          // Handle newline-chained commands (e.g., "ls -la\ncat file\ngrep pattern")
          // Some models chain commands with \n instead of && or ;
          // Only applies when no heredoc was extracted (heredoc content has its own \n handling)
          if (!heredocStdin && cmdString.includes('\n')) {
            const multiCmds = splitNewlineCommands(cmdString);
            if (multiCmds.length > 1) {
              const outputs: string[] = [];
              for (const singleCmd of multiCmds) {
                // Each command may itself contain a heredoc — recurse through the full executor
                const lineResult = await this.get('shell')!.executor.execute(projectId, { cmd: singleCmd }, context);
                if (lineResult && lineResult !== 'Command succeeded with no output') {
                  outputs.push(lineResult);
                }
                // Stop on error (same as && semantics)
                if (lineResult.startsWith('Error')) break;
              }
              return outputs.length > 0 ? outputs.join('\n') : 'Command succeeded with no output';
            }
          }

          // Parse command string into array
          const cmdArray = parseShellCommand(cmdString);

          // Check for && / || / ; chain operators — handle at this level so
          // python/lua/preview/cd work when chained (e.g., "python main.py && preview /output/chart.html")
          if (cmdArray.some(t => t === '&&' || t === '||' || t === ';')) {
            const segments = splitChainOperators(cmdArray);
            const outputs: string[] = [];

            for (let i = 0; i < segments.length; i++) {
              if (i > 0) {
                const prevOp = segments[i - 1].nextOp;
                const prevResult = outputs[outputs.length - 1] || '';
                const prevSuccess = !prevResult.startsWith('Error');
                if (prevOp === '&&' && !prevSuccess) break;
                if (prevOp === '||' && prevSuccess) continue;
                // ';' — always proceed to next command
              }

              const segResult = await executeShellSegment(
                projectId, segments[i].args, context,
                i === segments.length - 1 ? heredocStdin : undefined
              );
              if (segResult) outputs.push(segResult);
            }

            const combined = outputs.join('\n').trim();
            return combined || 'Command succeeded with no output';
          }

          // Single command (no chaining)
          const mainResult = await executeShellSegment(projectId, cmdArray, context, heredocStdin);

          // If there are trailing commands after a heredoc (e.g., EOF\npython file.py),
          // execute them sequentially as a chained && command.
          if (trailingCommands) {
            const outputs: string[] = [];
            if (mainResult.startsWith('Error')) {
              return mainResult;
            }
            if (mainResult) outputs.push(mainResult);

            const lines = trailingCommands.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
              const trailArray = parseShellCommand(line);
              if (trailArray.length === 0) continue;

              const trailResult = await executeShellSegment(projectId, trailArray, context);
              if (trailResult.startsWith('Error')) {
                return outputs.length > 0
                  ? outputs.join('\n') + '\n' + trailResult
                  : trailResult;
              }
              if (trailResult) outputs.push(trailResult);
            }

            return outputs.length > 0 ? outputs.join('\n') : 'Command succeeded with no output';
          }

          return mainResult || 'Command succeeded with no output';
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
   * Get all tool definitions for a list of tool IDs.
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
      const shellCommands = ['ls', 'tree', 'cat', 'head', 'tail', 'grep', 'rg', 'find', 'mkdir', 'touch', 'rm', 'mv', 'cp', 'echo', 'sed', 'ss', 'wc', 'curl', 'sqlite3', 'python', 'python3', 'lua', 'preview', 'build', 'status', 'delegate', 'runtime'];

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
          // Shell tool: repaired JSON with a cmd field is safe to execute.
          // A truncated heredoc writes truncated content, which the model can detect and continue.
          if (toolId === 'shell' && typeof repairResult.repaired?.cmd === 'string') {
            logger.warn(`[ToolRegistry] Repaired shell JSON, executing truncated command`);
            return await tool.executor.execute(projectId, repairResult.repaired, context);
          }
          logger.warn(`[ToolRegistry] Repaired ${toolId} but safety unknown, not executing`);
          return `Error: ${errorMessage}\n\nNote: JSON repair succeeded but operation type is unclear. Please split into smaller operations.`;
        }

        logger.error(`[ToolRegistry] JSON repair failed for ${toolId}:`, repairResult.error);
        return `Error: ${errorMessage}\n\nJSON repair failed. The tool call was likely truncated due to max_tokens limit. Split into smaller operations.`;
      }

      // Not a truncation error - return regular error
      logger.error(`Tool execution error (${toolId}):`, errorMessage);
      return `Error: ${errorMessage}`;
    }
  }

}

/**
 * Execute a single shell command segment (no && / || chaining).
 * Handles cd, python/lua, preview, server commands, and VFS shell fallthrough.
 * Returns empty string for success-no-output, 'Error: ...' for failures.
 */
async function executeShellSegment(
  projectId: string,
  cmdArray: string[],
  context: ToolExecutionContext,
  heredocStdin?: string
): Promise<string> {
  const command = cmdArray[0];
  if (!command) return 'Error: empty command';

  // Block write operations in read-only mode
  if (context.isReadOnly && isWriteOperation(cmdArray)) {
    return `Error: Write operations are disabled in read-only mode. "${command}" is not allowed.`;
  }

  // cd — no-op (VFS has no working directory concept)
  if (command === 'cd') {
    return '';
  }

  // Script execution commands (python, python3, lua)
  if (command === 'python' || command === 'python3' || command === 'lua') {
    const sr: ScriptRuntime = command === 'lua' ? 'lua' : 'python';
    const filePath = cmdArray[1];
    if (!filePath) return `Error: Usage: ${command} <file>`;

    const normalizedPath = filePath.startsWith('/') ? filePath : '/' + filePath;

    return new Promise<string>((resolve) => {
      const output: string[] = [];
      let resolved = false;

      const unsubscribe = scriptRunner.onOutput((msg) => {
        switch (msg.type) {
          case 'stdout': output.push(msg.data); break;
          case 'stderr': output.push(`[stderr] ${msg.data}`); break;
          case 'error': output.push(`[error] ${msg.data}`); break;
          case 'complete':
            unsubscribe();
            resolved = true;
            const text = output.join('\n').trim();
            resolve(msg.exitCode === 0
              ? (text || 'Script completed with no output')
              : `Error (exit ${msg.exitCode}):\n${text}`);
            break;
        }
      });

      scriptRunner.execute(projectId, sr, normalizedPath).catch((err) => {
        if (!resolved) {
          unsubscribe();
          resolve(`Error: ${err}`);
        }
      });
    });
  }

  // Preview navigation command
  if (command === 'preview') {
    const targetPath = cmdArray[1] || '/';
    const normalizedPath = targetPath.startsWith('/') ? targetPath : '/' + targetPath;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('showPreview'));
      window.dispatchEvent(new CustomEvent('previewNavigate', { detail: { path: normalizedPath } }));
    }

    return `Preview navigated to ${normalizedPath}`;
  }

  // Server-side execution (sqlite3)
  const serverCommands = ['sqlite3'];
  const deploymentId = vfs.getRuntimeDeploymentId();

  if (serverCommands.includes(command) && deploymentId) {
    try {
      // Use workspace-scoped URL if workspace cookie is set
      const wsMatch = typeof document !== 'undefined' && document.cookie.match(/osw_workspace=([^;]+)/);
      const shellUrl = wsMatch ? `/api/w/${wsMatch[1]}/shell/execute` : '/api/shell/execute';
      const response = await fetch(shellUrl, {
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
        return result.stdout && result.stdout.trim().length > 0 ? result.stdout : '';
      } else {
        return `Error: ${result.stderr || 'Command failed'}`;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Server request failed';
      return `Error: ${message}`;
    }
  }

  // Delegate — handled at orchestrator level, never reaches here in normal flow.
  // Safety net: if it does, return an error directing to proper usage.
  if (command === 'delegate') {
    return 'Error: delegate requires a type. Usage: shell({ cmd: "delegate explore|task|plan \'prompt\'" })';
  }

  // VFS shell fallthrough (handles pipes, redirects, etc.)
  const result = await vfsShell.execute(projectId, cmdArray, heredocStdin);

  // Refresh server context if shell command modified .server/ files
  if (isWriteOperation(cmdArray) && cmdArray.some(a => a.includes('/.server/'))) {
    if (vfs.hasServerContext()) {
      await vfs.refreshServerContext();
    }
  }

  if (!result.success) {
    const message = result.stderr && result.stderr.trim().length > 0 ? result.stderr : 'Command failed';
    return `Error: ${message}`;
  }

  return result.stdout && result.stdout.trim().length > 0 ? result.stdout : '';
}

/**
 * Split a parsed command array by && and || chain operators into segments.
 */
function splitChainOperators(cmdArray: string[]): { args: string[]; nextOp: '&&' | '||' | ';' | null }[] {
  const segments: { args: string[]; nextOp: '&&' | '||' | ';' | null }[] = [];
  let current: string[] = [];

  for (const token of cmdArray) {
    if (token === '&&' || token === '||' || token === ';') {
      if (current.length > 0) {
        segments.push({ args: current, nextOp: token as '&&' | '||' | ';' });
        current = [];
      }
    } else {
      current.push(token);
    }
  }

  if (current.length > 0) {
    segments.push({ args: current, nextOp: null });
  }

  return segments;
}

/**
 * Unescape HTML entities that models sometimes emit in tool call arguments.
 * These are never valid in shell commands, so unescaping is always safe.
 */
function unescapeHtmlEntities(cmd: string): string {
  if (!cmd.includes('&')) return cmd;
  return cmd
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
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

    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      } else if (quoteChar === '"' && char === '\\') {
        // Double quotes: backslash escapes the next character
        escaped = true;
        continue;
      } else {
        // Single quotes: everything is literal (including backslashes)
        current += char;
      }
    } else {
      if (char === '\\') {
        escaped = true;
        continue;
      }
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

  const writeCommands = ['mkdir', 'rm', 'rmdir', 'mv', 'cp', 'touch', 'ss'];

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

/**
 * Check if a string has unbalanced quotes (i.e., we're inside an open quote).
 * Respects escape sequences in double quotes (\" is not a closing quote).
 * In single quotes, backslash is literal (no escaping) per POSIX.
 */
function hasUnbalancedQuotes(text: string): boolean {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && inDouble) { i++; continue; }
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
  }
  return inSingle || inDouble;
}

/**
 * Split a newline-separated command string into individual commands,
 * preserving heredoc blocks and multiline quoted strings as part of their parent command.
 * E.g., "mkdir -p dir\ncat > file << 'EOF'\ncontent\nEOF\nls" → 3 commands
 */
function splitNewlineCommands(cmdStr: string): string[] {
  const lines = cmdStr.split('\n');
  const commands: string[] = [];
  let current = '';
  let heredocDelimiter: string | null = null;

  for (const line of lines) {
    if (heredocDelimiter) {
      // Inside a heredoc — accumulate until we hit the end delimiter
      current += '\n' + line;
      if (line.trim() === heredocDelimiter) {
        heredocDelimiter = null;
      }
      continue;
    }

    // Inside an unclosed quote — accumulate until quotes balance
    if (current && hasUnbalancedQuotes(current)) {
      current += '\n' + line;
      continue;
    }

    // Check if this line starts a heredoc
    const heredocStart = line.match(/<<-?\s*['"]?(\w+)['"]?/);
    if (heredocStart) {
      if (current) {
        const trimmed = current.trim();
        if (trimmed && !trimmed.startsWith('#')) commands.push(trimmed);
        current = '';
      }
      current = line;
      heredocDelimiter = heredocStart[1];
      continue;
    }

    // Regular line — accumulate in current buffer
    // (don't push directly — next iteration's unbalanced quote check needs to see it)
    if (current) {
      const prevTrimmed = current.trim();
      if (prevTrimmed && !prevTrimmed.startsWith('#')) commands.push(prevTrimmed);
    }
    current = line;
  }

  // Flush remaining
  if (current) {
    const trimmed = current.trim();
    if (trimmed && !trimmed.startsWith('#')) commands.push(trimmed);
  }

  return commands;
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
