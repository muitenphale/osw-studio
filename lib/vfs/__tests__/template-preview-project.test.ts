import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTemplatePreviewProject,
  discardTemplatePreviewProject,
  isTemplatePreviewProject,
  markTemplatePreviewInUse,
  releaseTemplatePreview,
  sweepTemplatePreviewProjects,
  templatePreviewUnavailableReason,
} from '@/lib/vfs/templates/preview-project';
import type { CustomTemplate } from '@/lib/vfs/types';

/**
 * A VFS just real enough for these: it records what a preview writes, and lets the sweep see
 * projects the filtered `listProjects` would hide.
 */
function fakeVfs() {
  const projects = new Map<string, { id: string; name: string; settings: Record<string, unknown> }>();
  const files = new Map<string, string[]>();
  return {
    projects,
    files,
    async createProject(name: string, _description?: string, id?: string) {
      const project = { id: id ?? `generated-${projects.size}`, name, settings: {} };
      projects.set(project.id, project);
      files.set(project.id, []);
      return project;
    },
    async getProject(id: string) {
      return projects.get(id);
    },
    async updateProject(project: { id: string; name: string; settings: Record<string, unknown> }) {
      projects.set(project.id, project);
    },
    async deleteProject(id: string) {
      if (!projects.has(id)) throw new Error('no such project');
      projects.delete(id);
      files.delete(id);
    },
    // The real one filters previews out; the sweep opts back in, so this honours the flag.
    async listProjects(options?: { includeTemplatePreviews?: boolean }) {
      const all = [...projects.values()];
      return options?.includeTemplatePreviews
        ? all
        : all.filter((p) => !isTemplatePreviewProject(p.id));
    },
    async createFile(projectId: string, path: string) {
      files.get(projectId)!.push(path);
      return { path };
    },
    async createDirectory() {},
    async writeFile(projectId: string, path: string) {
      files.get(projectId)!.push(path);
    },
    async getFileTree() {
      return null;
    },
    async listFiles(projectId: string) {
      return (files.get(projectId) ?? []).map((path) => ({ path }));
    },
  };
}

describe('templatePreviewUnavailableReason', () => {
  it('has nothing to show for a runtime whose output is console text', () => {
    // The signal is the runtime's preview mode, not a missing entry point: Python and Lua write to
    // the Console, so there is no page for an iframe to render.
    expect(templatePreviewUnavailableReason('python')).toBeTruthy();
    expect(templatePreviewUnavailableReason('lua')).toBeTruthy();
  });

  it('shows every runtime that renders a page', () => {
    // Including 'static', which the Spring Boot kit uses for its project overview: OSWS cannot build
    // that project, but the page it ships is an ordinary one and worth seeing.
    for (const runtime of ['static', 'handlebars', 'react', 'preact', 'svelte', 'vue'] as const) {
      expect(templatePreviewUnavailableReason(runtime), runtime).toBeNull();
    }
  });
});

describe('template preview projects', () => {
  beforeEach(() => {
    releaseTemplatePreview('anything');
  });

  it('takes the runtime from the template, not from the caller', async () => {
    // Without this the compiler assumes Handlebars, skips esbuild, and a React template's
    // hardcoded /bundle.js resolves against the app origin and 404s to a blank page.
    const vfs = fakeVfs();
    const created = await createTemplatePreviewProject(vfs, 'react-demo', []);

    expect(created?.runtime).toBe('react');
    expect(vfs.projects.get(created!.projectId)?.settings.runtime).toBe('react');
  });

  it('writes the template files into the scratch project', async () => {
    const vfs = fakeVfs();
    const created = await createTemplatePreviewProject(vfs, 'business-website', []);

    expect(vfs.files.get(created!.projectId)).toContain('/index.html');
  });

  it('marks the project so nothing else treats it as one of the user\'s', async () => {
    const vfs = fakeVfs();
    const created = await createTemplatePreviewProject(vfs, 'business-website', []);

    expect(isTemplatePreviewProject(created!.projectId)).toBe(true);
    expect(await vfs.listProjects()).toEqual([]);
  });

  it('gives every preview its own project', async () => {
    // Two previews opened in a row must not collide on an id, or closing the first would delete
    // the project the second is rendering from.
    const vfs = fakeVfs();
    const a = await createTemplatePreviewProject(vfs, 'business-website', []);
    const b = await createTemplatePreviewProject(vfs, 'business-website', []);

    expect(a!.projectId).not.toBe(b!.projectId);
  });

  it('resolves a custom template through its selection value', async () => {
    const vfs = fakeVfs();
    const custom = {
      id: 'abc',
      name: 'Mine',
      description: 'A saved template',
      runtime: 'handlebars',
      files: [{ path: '/index.html', content: '<p>hello</p>' }],
      directories: [],
      metadata: {},
    } as unknown as CustomTemplate;

    const created = await createTemplatePreviewProject(vfs, 'custom:abc', [custom]);

    expect(created?.runtime).toBe('handlebars');
    expect(vfs.files.get(created!.projectId)).toContain('/index.html');
  });

  it('returns nothing for a template that no longer exists', async () => {
    // A stale selection rather than a bug, so the dialog says so instead of throwing.
    const vfs = fakeVfs();
    expect(await createTemplatePreviewProject(vfs, 'template-that-was-removed', [])).toBeNull();
    expect(await createTemplatePreviewProject(vfs, 'custom:gone', [])).toBeNull();
    expect(vfs.projects.size).toBe(0);
  });

  it('deletes the project when the preview closes', async () => {
    const vfs = fakeVfs();
    const created = await createTemplatePreviewProject(vfs, 'business-website', []);
    await discardTemplatePreviewProject(vfs, created!.projectId);

    expect(vfs.projects.size).toBe(0);
  });

  it('refuses to delete anything that is not a scratch project', async () => {
    // The id is the only guard between this and a real project, so it is checked rather than
    // trusted from the caller.
    const vfs = fakeVfs();
    const real = await vfs.createProject('Real work', undefined, 'real-1');
    await discardTemplatePreviewProject(vfs, real.id);

    expect(vfs.projects.has('real-1')).toBe(true);
  });
});

describe('sweeping leftovers', () => {
  it('removes scratch projects a closed tab left behind, and nothing else', async () => {
    const vfs = fakeVfs();
    await vfs.createProject('Real work', undefined, 'real-1');
    const leftover = await createTemplatePreviewProject(vfs, 'business-website', []);
    releaseTemplatePreview(leftover!.projectId); // as if the tab had gone

    await sweepTemplatePreviewProjects(vfs);

    expect(vfs.projects.has('real-1')).toBe(true);
    expect(vfs.projects.has(leftover!.projectId)).toBe(false);
  });

  it('leaves a preview that is open right now', async () => {
    // The sweep runs when the project list loads, and the preview opens from a dialog inside that
    // list. Without this, a reload underneath an open preview deletes what it is rendering from.
    const vfs = fakeVfs();
    const open = await createTemplatePreviewProject(vfs, 'business-website', []);

    await sweepTemplatePreviewProjects(vfs);

    expect(vfs.projects.has(open!.projectId)).toBe(true);
  });

  it('honours an explicitly excepted project as well as the in-use set', async () => {
    const vfs = fakeVfs();
    const open = await createTemplatePreviewProject(vfs, 'business-website', []);
    releaseTemplatePreview(open!.projectId);

    await sweepTemplatePreviewProjects(vfs, open!.projectId);

    expect(vfs.projects.has(open!.projectId)).toBe(true);
  });

  it('never lets housekeeping stop the project list from loading', async () => {
    const broken = {
      async listProjects() {
        throw new Error('storage unavailable');
      },
    };
    await expect(sweepTemplatePreviewProjects(broken)).resolves.toBeUndefined();
  });

  it('releases the in-use mark when the project is discarded', async () => {
    // Otherwise the set grows for the life of the tab, and a reused id could never be swept.
    const vfs = fakeVfs();
    const created = await createTemplatePreviewProject(vfs, 'business-website', []);
    markTemplatePreviewInUse(created!.projectId);
    await discardTemplatePreviewProject(vfs, created!.projectId);

    const again = await vfs.createProject('x', undefined, created!.projectId);
    await sweepTemplatePreviewProjects(vfs);

    expect(vfs.projects.has(again.id)).toBe(false);
  });
});
