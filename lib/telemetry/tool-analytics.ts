/**
 * Safe extraction of analytics properties from tool call arguments.
 * Only whitelisted, enumerated values are emitted — no file paths, contents, or user text.
 */

const SHELL_COMMAND_WHITELIST = new Set([
  'cat', 'head', 'tail', 'nl', 'ls', 'tree', 'grep', 'rg', 'find',
  'mkdir', 'mv', 'cp', 'rm', 'rmdir', 'touch', 'sed', 'echo', 'sqlite3'
]);

const WRITE_OP_TYPE_WHITELIST = new Set([
  'update', 'rewrite', 'replace_entity'
]);

const FILE_EXT_WHITELIST = new Set([
  '.html', '.htm', '.css', '.js', '.ts', '.jsx', '.tsx',
  '.json', '.md', '.txt', '.svg', '.xml', '.yaml', '.yml',
  '.toml', '.hbs', '.handlebars', '.sql'
]);

function extractShellAnalytics(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const cmd = typeof args.cmd === 'string' ? args.cmd.trim() : '';
  if (cmd) {
    const firstWord = cmd.split(/\s+/)[0];
    result.command = SHELL_COMMAND_WHITELIST.has(firstWord) ? firstWord : 'other';
    result.has_pipe = cmd.includes(' | ');
    result.has_redirect = / >>? /.test(cmd);
  }
  return result;
}

function extractWriteAnalytics(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Extract file extension from file_path (never the path itself)
  if (typeof args.file_path === 'string') {
    const dotIndex = args.file_path.lastIndexOf('.');
    if (dotIndex !== -1) {
      const ext = args.file_path.slice(dotIndex).toLowerCase();
      result.file_ext = FILE_EXT_WHITELIST.has(ext) ? ext : 'other';
    }
  }

  // Extract operation types from operations array
  if (Array.isArray(args.operations)) {
    const types = new Set<string>();
    for (const op of args.operations) {
      if (op && typeof op === 'object' && typeof (op as Record<string, unknown>).type === 'string') {
        const t = (op as Record<string, unknown>).type as string;
        types.add(WRITE_OP_TYPE_WHITELIST.has(t) ? t : 'other');
      }
    }
    result.op_types = [...types];
    result.op_count = args.operations.length;
  }

  return result;
}

function extractEvaluationAnalytics(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (typeof args.goal_achieved === 'boolean') {
    result.goal_achieved = args.goal_achieved;
  }
  if (typeof args.should_continue === 'boolean') {
    result.should_continue = args.should_continue;
  }
  return result;
}

export function extractToolAnalytics(
  toolName: string,
  argsJson: string,
  success: boolean
): Record<string, unknown> {
  const base: Record<string, unknown> = { tool: toolName, success };

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsJson);
    if (!args || typeof args !== 'object' || Array.isArray(args)) return base;
  } catch {
    return base;
  }

  switch (toolName) {
    case 'shell':
      return { ...base, ...extractShellAnalytics(args) };
    case 'write':
      return { ...base, ...extractWriteAnalytics(args) };
    case 'evaluation':
      return { ...base, ...extractEvaluationAnalytics(args) };
    default:
      return base;
  }
}
