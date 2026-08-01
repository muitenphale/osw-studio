import { describe, it, expect } from 'vitest';
import { toBrowsableTemplates, runtimeForTemplate } from '../index';
import { BUILT_IN_TEMPLATES } from '@/lib/vfs/templates/registry';
import { getProjectRuntimes } from '@/lib/runtimes/registry';
import type { CustomTemplate } from '@/lib/vfs/types';

/**
 * Project creation no longer asks for a runtime: the chosen template supplies it. That only holds
 * if every runtime is reachable through some template, and if each template reports the runtime it
 * will actually give the project.
 */

/** No cast: if CustomTemplate gains a required field, this stops compiling rather than drifting. */
function customTemplate(overrides: Partial<CustomTemplate> = {}): CustomTemplate {
  const base: CustomTemplate = {
    id: 'c1',
    name: 'My template',
    description: 'a custom one',
    version: '1.0.0',
    files: [],
    directories: [],
    metadata: { license: 'personal' },
    importedAt: new Date('2026-08-01T00:00:00.000Z'),
  };
  return { ...base, ...overrides };
}

describe('runtime coverage', () => {
  // Dropping the runtime picker strands a runtime the moment its last template goes away.
  it('every runtime is reachable through at least one built-in template', () => {
    const covered = new Set(BUILT_IN_TEMPLATES.map((t) => t.runtime));
    const missing = getProjectRuntimes()
      .map((r) => r.value)
      .filter((runtime) => !covered.has(runtime));

    expect(missing).toEqual([]);
  });
});

describe('runtimeForTemplate', () => {
  it('reports the runtime a built-in template will apply', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      expect(runtimeForTemplate(template.id, [])).toBe(template.runtime);
    }
  });

  it('reads the runtime off a custom template', () => {
    const templates = [customTemplate({ id: 'c1', runtime: 'svelte' })];

    expect(runtimeForTemplate('custom:c1', templates)).toBe('svelte');
  });

  // Custom templates predate the runtime field; those saved before it are Handlebars, which is the
  // same fallback the old runtime-filtered picker used.
  it('treats a custom template without a runtime as handlebars', () => {
    const templates = [customTemplate({ id: 'c1', runtime: undefined })];

    expect(runtimeForTemplate('custom:c1', templates)).toBe('handlebars');
  });

  // A selection can outlive the template it names — a custom one deleted from the manager, or a
  // built-in id from an older build. Each side keeps its own fallback.
  it('falls back to handlebars for a custom template that no longer exists', () => {
    expect(runtimeForTemplate('custom:deleted', [])).toBe('handlebars');
  });

  it('falls back to static for an unknown built-in id', () => {
    expect(runtimeForTemplate('no-such-template', [])).toBe('static');
  });
});

describe('toBrowsableTemplates', () => {
  it('lists built-in and custom templates together', () => {
    const rows = toBrowsableTemplates([customTemplate({ id: 'c1', name: 'Mine' })]);

    expect(rows).toHaveLength(BUILT_IN_TEMPLATES.length + 1);
    expect(rows.filter((r) => !r.isBuiltIn).map((r) => r.name)).toEqual(['Mine']);
  });

  it('namespaces custom template values so ids cannot collide with built-ins', () => {
    const rows = toBrowsableTemplates([customTemplate({ id: 'blank', name: 'Not the built-in' })]);
    const values = rows.map((r) => r.value);

    expect(values).toContain('blank');
    expect(values).toContain('custom:blank');
    expect(new Set(values).size).toBe(values.length);
  });

  it('carries the thumbnail through for templates that have one', () => {
    const rows = toBrowsableTemplates([
      customTemplate({ id: 'c1', metadata: { license: 'mit', thumbnail: 'data:image/png;base64,AA' } }),
    ]);

    expect(rows.find((r) => r.value === 'custom:c1')!.thumbnail).toBe('data:image/png;base64,AA');
  });

  it('flags templates that bring backend features', () => {
    const withBackend = customTemplate({
      id: 'c1',
      backendFeatures: { edgeFunctions: [{ name: 'f', method: 'GET', code: '' }] },
    });
    const withEmpty = customTemplate({ id: 'c2', backendFeatures: { edgeFunctions: [] } });

    const rows = toBrowsableTemplates([withBackend, withEmpty]);

    expect(rows.find((r) => r.value === 'custom:c1')!.hasBackendFeatures).toBe(true);
    expect(rows.find((r) => r.value === 'custom:c2')!.hasBackendFeatures).toBe(false);
  });
});
