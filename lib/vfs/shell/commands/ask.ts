import type { ShellEnv, ShellResult } from '../types';

/** `ask` — ask the user a question and wait. */
export async function askCommand(env: ShellEnv): Promise<ShellResult> {
  const { args, ctx } = env;

  // ask [--prompt "Question"] "Option A" "Option B" "Option C"
  // Presents tappable chip options to the user. The orchestrator detects
  // exitReason='awaiting_user' and pauses the loop until the user picks.
  let askPrompt: string | undefined;
  const options: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--prompt' && args[i + 1] !== undefined) {
      askPrompt = args[++i];
    } else if (a) {
      options.push(a);
    }
  }
  if (options.length < 2) {
    return {
      stdout: '',
      stderr: 'Usage: ask [--prompt "Question"] "Option A" "Option B" ["Option C" ...]\nNeed at least two options.',
      exitCode: 1
    };
  }
  ctx?.onProgress?.('ask', { prompt: askPrompt, options });
  return {
    stdout: `Awaiting user selection. Options presented: ${options.map(o => `"${o}"`).join(', ')}`,
    stderr: '',
    exitCode: 0,
    exitReason: 'awaiting_user'
  };
}
