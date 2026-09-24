import { describe, it, expect } from 'vitest';
import { commandLineWrites } from '@/lib/llm/write-scope';

/**
 * Which scope the MCP `bash` tool demands, and whether it announces a change afterwards, both
 * hang on this answer. It previously came from `classifyCommand`, a display grouping, so a write
 * reached through a pipe asked only for `projects:read` and fired no notification.
 */
describe('does an MCP bash command line write', () => {
  it.each([
    'rm /index.html',
    'ls / | rm /index.html',
    'ls / | mv /a /b',
    "cat /a | sed -i 's/x/y/' /a",
    'ls / | touch /new',
    'ls / ; rm /index.html',
    'ls / && rm /index.html',
    'cat /a > /b',
    'ls / | grep x > /out',
    'curl -o /logo.png https://example.com/x.png',
    'ls /\nrm /index.html',
  ])('yes: %s', (command) => expect(commandLineWrites(command)).toBe(true));

  it.each([
    'ls /',
    'cat /index.html',
    'ls / | grep html | wc -l',
    'rg -n pattern /',
    'curl localhost/',
    "sed 's/a/b/' /index.html",
  ])('no: %s', (command) => expect(commandLineWrites(command)).toBe(false));
});
