import { describe, it, expect, vi, beforeEach } from 'vitest';

// Captures the (projectId, cmdArray, stdin, ctx) passed to the underlying shell so we can
// assert how the bash tool splits a heredoc command from its body.
const mockVfsShellExecute = vi.fn();

vi.mock('@/lib/vfs', () => ({
  getActiveVFS: () => ({
    init: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    listFiles: vi.fn().mockResolvedValue([]),
    listDirectories: vi.fn().mockResolvedValue([]),
    hasServerContext: () => false,
    getRuntimeDeploymentId: () => null,
    refreshServerContext: vi.fn(),
  }),
}));

vi.mock('@/lib/vfs/cli-shell', () => ({
  vfsShell: { execute: (...args: any[]) => mockVfsShellExecute(...args) },
}));

vi.mock('@/lib/scripting/script-runner', () => ({
  scriptRunner: { execute: vi.fn() },
}));

vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function bashToolCall(command: string, id = 'tc-1') {
  return {
    id,
    type: 'function' as const,
    function: { name: 'bash', arguments: JSON.stringify({ command }) },
  };
}

describe('bash tool — HTML entity handling around heredocs', () => {
  let registry: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVfsShellExecute.mockResolvedValue({ success: true, stdout: '' });
    const mod = await import('../tool-registry');
    registry = new mod.ToolRegistry();
  });

  it('preserves HTML entities inside a heredoc body (does not unescape file content)', async () => {
    // Regression: the whole command used to be HTML-unescaped, collapsing an escapeHtml()
    // implementation's `&amp;`/`&lt;` literals and turning the function into a no-op.
    const body = [
      'function escapeHtml(s) {',
      "  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');",
      '}',
    ].join('\n');

    await registry.execute(
      bashToolCall(`cat > /esc.js << 'EOF'\n${body}\nEOF`),
      'test-project',
      {},
    );

    expect(mockVfsShellExecute).toHaveBeenCalledTimes(1);
    const [, cmdArray, stdin] = mockVfsShellExecute.mock.calls[0];
    // Command portion parsed correctly...
    expect(cmdArray.slice(0, 2)).toEqual(['cat', '>']);
    // ...and the body reached the shell verbatim — entities intact.
    expect(stdin).toContain("'&amp;'");
    expect(stdin).toContain("'&lt;'");
    expect(stdin).toContain("'&gt;'");
    expect(stdin).not.toContain("/g, '&')");
  });

  it('still unescapes entities in the command portion (outside any heredoc)', async () => {
    // Models sometimes emit `&gt;` for a redirect or `&amp;&amp;` for chaining; the command
    // line (not a heredoc body) should still be unescaped so it parses as shell.
    await registry.execute(
      bashToolCall('echo hello &gt; /out.txt'),
      'test-project',
      {},
    );

    expect(mockVfsShellExecute).toHaveBeenCalledTimes(1);
    const [, cmdArray] = mockVfsShellExecute.mock.calls[0];
    expect(cmdArray).toContain('>');
    expect(cmdArray).not.toContain('&gt;');
  });
});

describe('bash tool — heredoc bodies vs control operators', () => {
  let registry: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockVfsShellExecute.mockResolvedValue({ success: true, stdout: '' });
    const mod = await import('../tool-registry');
    registry = new mod.ToolRegistry();
  });

  // The tokenizer splits unquoted ; && || | so operators written without spaces are recognised.
  // The heredoc body must never reach it: splitting there would rewrite the file being written.
  it('writes a body containing ; and | verbatim', async () => {
    const body = [
      'const parts = raw.split(";");',
      'if (a || b) { run(a|b); }',
      'const re = /foo|bar/;',
    ].join('\n');

    await registry.execute(
      bashToolCall(`cat > /ops.js << 'EOF'\n${body}\nEOF`),
      'test-project',
      {},
    );

    const [, cmdArray, stdin] = mockVfsShellExecute.mock.calls[0];
    expect(cmdArray.slice(0, 2)).toEqual(['cat', '>']);
    expect(stdin).toBe(body);
  });
});
