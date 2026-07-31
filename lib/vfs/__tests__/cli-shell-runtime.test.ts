import { describe, it, expect, vi } from 'vitest';
import { importWithRetry } from '../import-retry';

const mockVfs = {
  init: vi.fn(),
  readFile: vi.fn().mockRejectedValue(new Error('File not found: /.PROMPT.md')),
  writeFile: vi.fn(),
  createFile: vi.fn().mockResolvedValue(undefined),
  updateFile: vi.fn().mockResolvedValue(undefined),
  listFiles: vi.fn().mockResolvedValue([]),
  listDirectories: vi.fn().mockResolvedValue([]),
  deleteFile: vi.fn(),
  renameFile: vi.fn(),
  getFileTree: vi.fn().mockResolvedValue([]),
  getProject: vi.fn().mockResolvedValue({ id: 'test-project', settings: { runtime: 'static' } }),
  updateProject: vi.fn().mockResolvedValue(undefined),
  scheduleAutoSync: vi.fn(),
};

vi.mock('@/lib/vfs', () => ({
  getActiveVFS: () => mockVfs,
  vfs: mockVfs,
}));

vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/vfs/import-retry', () => ({
  importWithRetry: vi.fn((importer: () => Promise<unknown>) => importer()),
}));

vi.mock('@/lib/llm/prompts', () => ({
  getDomainPrompt: () => 'DOMAIN PROMPT',
  isDefaultDomainPrompt: () => true,
}));

describe('cli-shell runtime command', () => {
  it('changes the runtime and loads the domain prompt through the HMR-safe retry import', async () => {
    const { vfsShell } = await import('../cli-shell');

    const result = await vfsShell.execute('test-project', ['runtime', 'react']);

    expect(result.success).toBe(true);
    expect(result.stdout).toContain('Runtime changed to react');
    expect(mockVfs.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ runtime: 'react' }) }),
    );
    // The runtime lives in project settings, which the server stores — so the change is queued
    // for push rather than left as silent local drift.
    expect(mockVfs.scheduleAutoSync).toHaveBeenCalledWith('test-project');
    // .PROMPT.md didn't exist — created with the new runtime's domain prompt
    expect(mockVfs.createFile).toHaveBeenCalledWith('test-project', '/.PROMPT.md', 'DOMAIN PROMPT');
    // The prompts module was loaded via the chunk-retry helper
    expect(vi.mocked(importWithRetry)).toHaveBeenCalledTimes(1);
  });
});
