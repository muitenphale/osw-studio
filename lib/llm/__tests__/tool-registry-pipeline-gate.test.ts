import { describe, it, expect, vi } from 'vitest';
import type { ToolCall } from '../types';

/**
 * The read-only gate and the write-scope guard run on a command before the shell executes it.
 * A pipeline is one command to them but several to the shell, which splits on `|` and runs each
 * stage in turn. Checking only the first stage let `ls / | rm /file` delete through a grant that
 * was never given write access, and let a scoped agent write outside its directory the same way.
 */

const mockVfs = {
  init: vi.fn(),
  createFile: vi.fn().mockResolvedValue({}),
  updateFile: vi.fn().mockResolvedValue({}),
  deleteFile: vi.fn().mockResolvedValue({}),
  readFile: vi.fn().mockResolvedValue({ content: '' }),
  listFiles: vi.fn().mockResolvedValue([]),
  getFile: vi.fn().mockResolvedValue(null),
  getAllFilesAndDirectories: vi.fn().mockResolvedValue([]),
  getRuntimeDeploymentId: vi.fn().mockReturnValue(null),
};

vi.mock('@/lib/vfs', () => ({ getActiveVFS: () => mockVfs, vfs: mockVfs }));
vi.mock('@/lib/utils', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function bash(command: string): ToolCall {
  return { id: 't', type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command }) } };
}

const readOnly = { agentType: 'orchestrator' as const, isReadOnly: true };
const scoped = { agentType: 'interview' as const, isReadOnly: false, writeScope: '/.interviews/' };

describe('read-only mode and pipelines', () => {
  it.each([
    ['rm after a pipe',        'ls / | rm /index.html'],
    ['mv after a pipe',        'ls / | mv /index.html /gone.html'],
    ['sed -i after a pipe',    "cat /index.html | sed -i 's/a/b/' /index.html"],
    ['touch after a pipe',     'ls / | touch /new.html'],
    ['redirect after a pipe',  'cat /index.html | grep x > /out.html'],
    ['write in the middle',    'ls / | rm /index.html | wc -l'],
  ])('refuses a write reached through a pipe: %s', async (_label, command) => {
    const { toolRegistry } = await import('../tool-registry');
    const result = await toolRegistry.execute(bash(command), 'p', readOnly);
    expect(result).toContain('read-only mode');
  });

  it('still refuses a plain write', async () => {
    const { toolRegistry } = await import('../tool-registry');
    expect(await toolRegistry.execute(bash('rm /index.html'), 'p', readOnly)).toContain('read-only mode');
  });

  it('still allows a read-only pipeline', async () => {
    const { toolRegistry } = await import('../tool-registry');
    const result = await toolRegistry.execute(bash('ls / | grep html | wc -l'), 'p', readOnly);
    expect(result).not.toContain('read-only mode');
  });
});

describe('write scope and pipelines', () => {
  it('refuses a write outside the scope reached through a pipe', async () => {
    const { toolRegistry } = await import('../tool-registry');
    const result = await toolRegistry.execute(bash('ls / | rm /index.html'), 'p', scoped);
    expect(result).toContain('/.interviews/');
  });

  it('still allows an in-scope write after a pipe', async () => {
    const { toolRegistry } = await import('../tool-registry');
    const result = await toolRegistry.execute(bash('ls / | touch /.interviews/notes.md'), 'p', scoped);
    expect(result).not.toContain('may only write within');
  });
});
