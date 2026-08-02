import type { ShellEnv, ShellResult } from '../types';

/** `sleep` — pause briefly. */
export async function sleepCommand(_env: ShellEnv): Promise<ShellResult> {
  // No-op — LLMs reflexively use sleep between commands.
  // Parse the duration to avoid "command not found" errors but don't actually wait.
  return { stdout: '', stderr: '', exitCode: 0 };
}
