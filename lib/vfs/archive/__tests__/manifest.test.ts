import { describe, it, expect } from 'vitest';
import { buildManifest, parseManifest, serializeManifest } from '../manifest';
import type { ProjectManifest } from '../types';

const project = {
  id: 'p1',
  name: 'Sweet Candies',
  description: 'A shop',
  createdAt: new Date(),
  updatedAt: new Date(),
  settings: { runtime: 'handlebars' as const, previewEntryPoint: '/home.html' },
  previewImage: 'data:image/png;base64,AAAA',
} as any;

describe('buildManifest', () => {
  it('carries settings but never volatile or machine-local fields', () => {
    const m = buildManifest(project, []);
    expect(m).toMatchObject({
      formatVersion: 1,
      name: 'Sweet Candies',
      runtime: 'handlebars',
      entryPoint: '/home.html',
    });
    const asJson = JSON.stringify(m);
    expect(asJson).not.toContain('previewImage');
    expect(asJson).not.toContain('createdAt');
    expect(asJson).not.toContain('"id"');
  });

  it('records only files whose stored shape disagrees with their extension', () => {
    const files = [
      // An extension nobody enumerates infers binary, so text stored under one is the
      // disagreement the manifest exists to record. (.yaml was this case until the text
      // extension list grew to cover it.)
      { path: '/report.customfmt', content: 'plain text' },
      { path: '/notes.md', content: '# hi' },             // agrees, omitted
      { path: '/logo.png', content: new ArrayBuffer(4) }, // agrees, omitted
    ] as any[];
    const m = buildManifest(project, files);
    expect(m.encoding).toEqual({ '/report.customfmt': 'text' });
  });

  it('omits encoding entirely when nothing disagrees', () => {
    const m = buildManifest(project, [{ path: '/a.md', content: 'x' }] as any[]);
    expect(m.encoding).toBeUndefined();
  });
});

describe('serializeManifest', () => {
  it('is byte-identical across calls for the same input', () => {
    const files = [{ path: '/b.yaml', content: 'x' }, { path: '/a.yaml', content: 'y' }] as any[];
    const a = serializeManifest(buildManifest(project, files));
    const b = serializeManifest(buildManifest(project, [...files].reverse()));
    expect(a).toBe(b);
  });
});

describe('serializeManifest canonical form', () => {
  it('emits a fixed key order whatever order the object was built in', () => {
    const wrongOrder = {
      encoding: { '/a.yaml': 'text' },
      name: 'x',
      runtime: 'static',
      formatVersion: 1,
    } as ProjectManifest;
    expect(Object.keys(JSON.parse(serializeManifest(wrongOrder))))
      .toEqual(['formatVersion', 'name', 'runtime', 'encoding']);
  });

  it('drops a key that is not part of the format', () => {
    const withExtra = { formatVersion: 1, name: 'x', sneaky: 'value' } as unknown as ProjectManifest;
    expect(serializeManifest(withExtra)).not.toContain('sneaky');
  });

  it('emits every field buildManifest can produce — a field missing from the key order is lost', () => {
    const full = buildManifest(
      {
        ...project,
        settings: {
          runtime: 'handlebars',
          previewEntryPoint: '/home.html',
          globalStyles: '/theme.css',
        },
      } as any,
      [{ path: '/config.yaml', content: 'a: 1' }] as any[]
    );
    const built = Object.keys(full).filter((k) => full[k as keyof ProjectManifest] !== undefined);
    expect(Object.keys(JSON.parse(serializeManifest(full))).sort()).toEqual(built.sort());
  });

  it('sorts the encoding map on serialize, not just on build', () => {
    // A hand-edited manifest arrives with its keys in whatever order the author typed them.
    const handEdited = JSON.stringify({
      formatVersion: 1,
      name: 'x',
      encoding: { '/z.yaml': 'text', '/a.yaml': 'text' },
    });
    const out = JSON.parse(serializeManifest(parseManifest(handEdited)));
    expect(Object.keys(out.encoding)).toEqual(['/a.yaml', '/z.yaml']);
  });
});

describe('parseManifest', () => {
  it('round-trips', () => {
    const m = buildManifest(project, []);
    expect(parseManifest(serializeManifest(m))).toEqual(m);
  });

  it('rejects a manifest from a newer format version', () => {
    expect(() => parseManifest(JSON.stringify({ formatVersion: 99, name: 'x' })))
      .toThrow(/newer version/i);
  });

  it('rejects malformed JSON with a readable message', () => {
    expect(() => parseManifest('{oops')).toThrow(/could not be read/i);
  });

  it('names the file it was given — export renames the manifest when the project owns that path', () => {
    expect(() => parseManifest('{oops', 'osw-project.json')).toThrow(/osw-project\.json/);
    expect(() => parseManifest('{}', 'osw-project.json')).toThrow(/osw-project\.json/);
  });
});
