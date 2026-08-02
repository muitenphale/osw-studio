import type { ShellEnv, ShellResult } from '../types';

/** `spec` — record the agreed specification. */
export async function specCommand(env: ShellEnv): Promise<ShellResult> {
  const { args, stdin, ctx } = env;

  // spec --append "Section heading" << 'EOF'
  // prose content
  // EOF
  const mode = args[0];
  if (mode !== '--append') {
    return {
      stdout: '',
      stderr: 'Usage: spec --append "Section heading" << \'EOF\'\nprose\nEOF',
      exitCode: 1
    };
  }
  const section = args[1];
  if (!section || typeof section !== 'string' || !section.trim()) {
    return {
      stdout: '',
      stderr: 'spec --append: section heading required as second argument.',
      exitCode: 1
    };
  }
  if (!stdin || !stdin.trim()) {
    return {
      stdout: '',
      stderr: 'spec --append: expected prose body via heredoc (<< \'EOF\' ... EOF).',
      exitCode: 1
    };
  }
  ctx?.onProgress?.('spec_update', {
    section: section.trim(),
    content: stdin.trim()
  });
  return {
    stdout: `Spec updated: ${section.trim()}`,
    stderr: '',
    exitCode: 0
  };
}
