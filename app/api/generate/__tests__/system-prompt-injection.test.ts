import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { isKnownShellCommand } from '@/lib/vfs/shell-commands';

/**
 * The route carries a fallback agent system prompt, injected when a caller sends `messages`
 * without a system role.
 *
 * Two things had gone wrong with it. Its command list was written at v1.0.0 and never updated —
 * it named `nl` and `rmdir`, which the shell has never had, and omitted ss/rg/build/status. And
 * the only callers that reach the injection are single-shot utility calls (transcription, skill
 * evaluation), which send no tools and were being handed a shell manual they never asked for.
 */

const ROUTE = fs.readFileSync(
  path.join(process.cwd(), 'app/api/generate/route.ts'),
  'utf-8'
);

describe('generate route fallback system prompt', () => {
  it('derives its command list from the registry', () => {
    expect(ROUTE).toContain('- Supported commands: ${supportedCommandList()}');
  });

  it('names no command that does not exist', () => {
    // Anything still hardcoded in the prompt block would show up here.
    const listed = ROUTE.match(/^- Supported commands: (.+)$/m)?.[1] ?? '';
    const hardcoded = listed
      .replace(/\$\{[^}]+\}/g, '')
      .split(',')
      .map((c) => c.trim().split(/[\s[(]/)[0])
      // Keep only real command-shaped tokens; the line ends in a full stop.
      .filter((c) => /^[a-z][a-z0-9-]*$/.test(c));
    const unknown = hardcoded.filter((c) => !isKnownShellCommand(c));

    expect(unknown).toEqual([]);
  });

  it('only injects the agent prompt for requests that carry tools', () => {
    expect(ROUTE).toContain("if (messages && tools?.length && !messages.some(");
  });
});
