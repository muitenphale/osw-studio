import { describe, it, expect, vi, beforeEach } from 'vitest';

const hub = vi.hoisted(() => ({
  repoExists: vi.fn(),
  createRepo: vi.fn(),
  commit: vi.fn(),
}));
vi.mock('@huggingface/hub', () => hub);
vi.mock('@/lib/publishing/compile-static-site', () => ({
  compileStaticSite: vi.fn().mockResolvedValue({
    files: [{ path: 'index.html', content: '<body>hi</body>' }],
    runtime: 'static',
  }),
  TerminalRuntimeError: class extends Error {},
}));

import { publishToSpace } from '@/lib/publishing/hf-space-publisher';

beforeEach(() => {
  hub.repoExists.mockReset();
  hub.createRepo.mockReset().mockResolvedValue({ repoUrl: 'x', id: 'alice/my-site' });
  hub.commit.mockReset().mockResolvedValue({ commit: { oid: 'abc', url: 'u' } });
});

const base = {
  accessToken: 'hf_x', username: 'alice', slug: 'my-site',
  isPrivate: false, description: 'd', includeFooter: true, mode: 'new' as const,
};

describe('publishToSpace', () => {
  it('creates a static Space under <username>/<slug> then commits files + README', async () => {
    hub.repoExists.mockResolvedValue(false);
    const res = await publishToSpace({} as any, 'p1', base);
    expect(hub.createRepo).toHaveBeenCalledWith(expect.objectContaining({
      repo: { type: 'space', name: 'alice/my-site' }, sdk: 'static', private: false, accessToken: 'hf_x',
    }));
    const commitArg = hub.commit.mock.calls[0][0];
    expect(commitArg.repo).toEqual({ type: 'space', name: 'alice/my-site' });
    const paths = commitArg.operations.map((o: any) => o.path);
    expect(paths).toContain('index.html');
    expect(paths).toContain('README.md');
    expect(commitArg.operations[0].content).toBeInstanceOf(Blob);
    const indexOp = commitArg.operations.find((o: any) => o.path === 'index.html');
    const html = await indexOp.content.text();
    expect(html).toContain('data-osw-credit');
    expect(res).toEqual({ repoId: 'alice/my-site', url: 'https://huggingface.co/spaces/alice/my-site' });
  });

  it('injects the footer only when includeFooter is true', async () => {
    hub.repoExists.mockResolvedValue(false);
    await publishToSpace({} as any, 'p1', { ...base, includeFooter: false });
    const op = hub.commit.mock.calls[0][0].operations.find((o: any) => o.path === 'index.html');
    const text = await op.content.text();
    expect(text).not.toContain('data-osw-credit');
  });

  it('in update mode does not create, just commits', async () => {
    await publishToSpace({} as any, 'p1', { ...base, mode: 'update' });
    expect(hub.createRepo).not.toHaveBeenCalled();
    expect(hub.commit).toHaveBeenCalled();
  });

  it('surfaces a name-taken error from createRepo', async () => {
    hub.repoExists.mockResolvedValue(true);
    await expect(publishToSpace({} as any, 'p1', base)).rejects.toThrow(/taken|exists/i);
  });
});
