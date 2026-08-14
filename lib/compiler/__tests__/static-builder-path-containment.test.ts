import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Publishing must not write outside the deployment's output directory.
 *
 * A project's file paths belong to whoever pushed it, and publishing joins them onto that
 * directory. A path such as `/assets/../../../../x` resolves above it and lands wherever the server
 * process can write, which on a multi-tenant instance includes other workspaces' databases and the
 * application's own files. The sync routes reject these on the way in; this is the second layer,
 * covering a row that reached the database by any other route.
 */

vi.mock('server-only', () => ({}));

let dir: string;
const WS = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const DEPLOYMENT = 'ffffffff-1111-2222-3333-444444444444';
const PROJECT = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-contain-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  vi.stubEnv('DEPLOYMENTS_DIR', path.join(dir, 'deployments'));
  vi.stubEnv('DEPLOYMENTS_STATIC_DIR', path.join(dir, 'public', 'deployments'));
  fs.mkdirSync(path.join(dir, 'deployments'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'data', 'workspaces', WS), { recursive: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

function walk(target: string): string[] {
  if (!fs.existsSync(target)) return [];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(target, entry.name)) : [path.join(target, entry.name)]
  );
}

describe('publishing a project that contains a traversing file path', () => {
  it('writes nothing outside the deployment output directory', async () => {
    const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    const adapter = getWorkspaceAdapter(WS);
    await adapter.init();

    await adapter.createProject({
      id: PROJECT, name: 'P', createdAt: new Date(), updatedAt: new Date(),
      settings: { runtime: 'static' },
    } as never);
    await adapter.createDeployment!({
      id: DEPLOYMENT, projectId: PROJECT, name: 'D', enabled: true,
      createdAt: new Date(), updatedAt: new Date(),
    } as never);

    const files: Array<[string, string]> = [
      ['/index.html', '<html><body>ok</body></html>'],
      // A benign first segment: a leading `..` is excluded from publishing by the dot-prefix rule,
      // so it never reached the write and hid this.
      ['/assets/../../../../ESCAPED.txt', 'ESCAPED-MARKER'],
    ];
    for (const [filePath, content] of files) {
      await adapter.createFile({
        id: `id-${filePath}`, projectId: PROJECT, path: filePath, name: path.basename(filePath),
        type: 'file', content, mimeType: 'text/plain', size: content.length,
        createdAt: new Date(), updatedAt: new Date(),
      } as never);
    }

    const { buildStaticDeployment } = await import('../static-builder');
    const result = await buildStaticDeployment(DEPLOYMENT, WS);

    expect(result.success).toBe(true);

    const outputDir = path.join(dir, 'public', 'deployments', DEPLOYMENT);
    const escaped = walk(dir).filter((file) => !file.startsWith(outputDir) && file.includes('ESCAPED'));
    expect(escaped).toEqual([]);

    // The safe file still published, so the guard rejects a path rather than the whole build.
    expect(fs.existsSync(path.join(outputDir, 'index.html'))).toBe(true);
  });
});
