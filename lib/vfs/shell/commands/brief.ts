import type { ShellEnv, ShellResult } from '../types';

/** `brief` — summarise the work for the user. */
export async function briefCommand(env: ShellEnv): Promise<ShellResult> {
  const { args, stdin, ctx } = env;

  // brief --merge << 'EOF' { ...JSON... } EOF
  // Merges a JSON object into the project brief. The body comes via stdin.
  const mode = args[0];
  if (mode !== '--merge') {
    return {
      stdout: '',
      stderr: 'Usage: brief --merge << \'EOF\'\n{ ...JSON... }\nEOF',
      exitCode: 1
    };
  }
  if (!stdin || !stdin.trim()) {
    return {
      stdout: '',
      stderr: 'brief --merge: expected JSON body via heredoc (<< \'EOF\' ... EOF).',
      exitCode: 1
    };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(stdin.trim());
  } catch (err: any) {
    return {
      stdout: '',
      stderr: `brief --merge: invalid JSON — ${err.message}`,
      exitCode: 1
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      stdout: '',
      stderr: 'brief --merge: body must be a JSON object.',
      exitCode: 1
    };
  }
  ctx?.onProgress?.('brief_update', { brief: parsed });
  const fields = Object.keys(parsed);
  return {
    stdout: fields.length > 0 ? `Brief updated: ${fields.join(', ')}` : 'Brief unchanged.',
    stderr: '',
    exitCode: 0
  };
}
