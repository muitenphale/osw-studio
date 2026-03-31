/**
 * Safe extraction of analytics properties from tool call arguments.
 * Only whitelisted, enumerated values are emitted — no file paths, contents, or user text.
 */

const SHELL_COMMAND_WHITELIST = new Set([
  'cat', 'head', 'tail', 'nl', 'ls', 'tree', 'grep', 'rg', 'find',
  'mkdir', 'mv', 'cp', 'rm', 'rmdir', 'touch', 'sed', 'ss', 'echo', 'wc',
  'sort', 'uniq', 'tr', 'curl', 'sleep', 'sqlite3', 'build', 'status', 'delegate',
  'preview', 'python', 'python3', 'lua', 'runtime'
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

  if (toolName === 'shell') {
    return { ...base, ...extractShellAnalytics(args) };
  }
  return base;
}
