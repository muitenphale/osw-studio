import type { ShellEnv, ShellResult } from '../types';

/** `status` — report task progress and completion. */
export async function statusCommand(env: ShellEnv): Promise<ShellResult> {
  const { args } = env;

  // Status pseudo-command
  // Usage: status --task "..." --done "..." --remaining "..." --complete
  const flags: Record<string, string> = {};
  let currentFlag: string | null = null;
  const tokens: string[] = [];
  let isComplete = false;
  let isIncomplete = false;
  for (const arg of args) {
    if (arg === '--complete') {
      if (currentFlag && tokens.length > 0) {
        flags[currentFlag] = tokens.join(' ');
        tokens.length = 0;
      }
      currentFlag = null;
      isComplete = true;
    } else if (arg === '--incomplete') {
      if (currentFlag && tokens.length > 0) {
        flags[currentFlag] = tokens.join(' ');
        tokens.length = 0;
      }
      currentFlag = null;
      isIncomplete = true;
    } else if (arg === '--task' || arg === '--done' || arg === '--remaining') {
      if (currentFlag && tokens.length > 0) {
        flags[currentFlag] = tokens.join(' ');
        tokens.length = 0;
      }
      currentFlag = arg.slice(2); // strip '--'
    } else if (currentFlag) {
      tokens.push(arg);
    }
  }
  if (currentFlag && tokens.length > 0) {
    flags[currentFlag] = tokens.join(' ');
  }

  if (!flags.task || !flags.done) {
    return {
      stdout: '',
      stderr: 'Usage: status --task "what was asked" --done "what I accomplished" --remaining "what\'s left or none" --complete',
      exitCode: 1
    };
  }
  const remaining = flags.remaining || 'none';
  // --complete wins over --incomplete if both present; neither = incomplete
  const complete = isComplete && !isIncomplete;
  // Terse ack — don't echo task/done back (pure token duplication; the
  // values are already in the command). Remaining/Complete lines stay:
  // the loop's completion detection reads them.
  return {
    stdout: `Status recorded.\nRemaining: ${remaining}\nComplete: ${complete ? 'yes' : 'no'}`,
    stderr: '',
    exitCode: 0
  };
}
