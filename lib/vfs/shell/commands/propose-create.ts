import type { ShellEnv, ShellResult } from '../types';

/** `propose-create` — propose creating a project from the discussion. */
export async function proposecreateCommand(env: ShellEnv): Promise<ShellResult> {
  const { ctx } = env;

  // propose-create — signals project is ready to create (user confirms via button).
  // The accumulated brief is held client-side; this command just flips the
  // "ready" flag. The orchestrator detects this and ends the setup loop.
  ctx?.onProgress?.('project_ready', {});
  return {
    stdout: 'Project ready to create. The user can review the brief and click "Create now" to confirm.',
    stderr: '',
    exitCode: 0,
    exitReason: 'setup_propose_create'
  };
}
