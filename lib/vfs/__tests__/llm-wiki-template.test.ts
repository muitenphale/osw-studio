// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { LLM_WIKI_PROJECT_TEMPLATE } from '@/lib/vfs/templates/llm-wiki';

/**
 * The template ships JavaScript and Markdown as strings inside a TypeScript module, so a stray
 * escape produces a file that is wrong only once it reaches a browser. These run the shipped
 * modules against the shipped wiki, which is the cheapest place to catch that.
 *
 * The wiki content gets the same treatment as the code, because in this template the content is
 * load-bearing: a link to a page that does not exist, or a page missing from the index, is the
 * failure the pattern is supposed to prevent rather than a typo.
 */

function file(path: string): string {
  const found = LLM_WIKI_PROJECT_TEMPLATE.files.find((f) => f.path === path);
  if (!found) throw new Error(`template has no ${path}`);
  return found.content;
}

const wikiPages = LLM_WIKI_PROJECT_TEMPLATE.files.filter((f) => f.path.startsWith('/wiki/'));


/**
 * Evaluates a shipped classic script and returns the namespace it attaches.
 *
 * The scripts are classic rather than ES modules because the preview cannot
 * resolve module imports between blob-served files, so the test runs them the
 * same way the page does: execute, then read what landed on `window`.
 */
function loadNamespace<T>(path: string, namespace: string): T {
  new Function(file(path))();
  return (window as unknown as Record<string, T>)[namespace];
}

interface Wiki {
  parseIndex: (md: string) => { path: string; title: string }[];
  parseFrontMatter: (md: string) => Record<string, string | string[]>;
  outboundLinks: (md: string) => string[];
  buildResolver: (paths: string[]) => (target: string) => string | null;
}

const wiki = () => loadNamespace<Wiki>('/src/lib/wiki.js', 'wikiData');

const renderer = () =>
  loadNamespace<{ render: (s: string) => string }>('/src/lib/markdown.js', 'wikiMarkdown');

describe('reading the catalogue', () => {
  it('finds every page index.md lists', () => {
    const pages = wiki().parseIndex(file('/wiki/index.md'));
    expect(pages.length).toBeGreaterThan(5);
    expect(pages.map((p) => p.path)).toContain('overview.md');
    expect(pages.map((p) => p.path)).toContain('concepts/canopy-cover.md');
  });

});

describe('front matter', () => {
  it('reads a title, a date and an inline tag list', () => {
    // Parsed from a fixture rather than a shipped page: this is a test of the parser, and reading
    // seed content would make it fail whenever someone edits the example wiki.
    const meta = wiki().parseFrontMatter(
      ['---', 'title: A page title', 'updated: 2026-04-11', 'tags: [synthesis, trees]', '---', '', '# Body'].join('\n')
    );

    expect(meta.title).toBe('A page title');
    expect(meta.updated).toBe('2026-04-11');
    expect(meta.tags).toEqual(['synthesis', 'trees']);
  });

  it('returns nothing for a page without any', () => {
    expect(wiki().parseFrontMatter('# Just a heading')).toEqual({});
  });

});

describe('the links between pages', () => {
  const paths = () => wikiPages.map((f) => f.path.replace(/^\/wiki\//, ''));

  it('resolves a link by full path and by bare name', () => {
    const resolve = wiki().buildResolver(paths());
    expect(resolve('concepts/canopy-cover')).toBe('concepts/canopy-cover.md');
    expect(resolve('canopy-cover')).toBe('concepts/canopy-cover.md');
    expect(resolve('concepts/canopy-cover.md')).toBe('concepts/canopy-cover.md');
  });

  it('refuses to guess when a bare name matches two pages', () => {
    // Guessing sends the reader to the wrong page and looks like it worked. A broken link is the
    // honest outcome, and the lint pass reports it.
    const resolve = wiki().buildResolver(['a/notes.md', 'b/notes.md', 'only.md']);
    expect(resolve('notes')).toBeNull();
    expect(resolve('a/notes')).toBe('a/notes.md');
    expect(resolve('only')).toBe('only.md');
  });

  it('reads the targets out of a page, ignoring the label', () => {
    const links = wiki().outboundLinks('See [[a/b|the thing]] and [[c]] and [[a/b]] again.');
    expect(links).toEqual(['a/b', 'c']);
  });

});

describe('rendering a page', () => {
  it('turns a wiki link into something the reader can intercept', () => {
    const html = renderer().render('See [[concepts/canopy-cover]].');
    expect(html).toContain('class="wikilink"');
    expect(html).toContain('data-page="concepts/canopy-cover"');
    expect(html).toContain('>concepts/canopy-cover</a>');
  });

  it('uses the label when one is given', () => {
    const html = renderer().render('See [[concepts/canopy-cover|canopy cover]].');
    expect(html).toContain('data-page="concepts/canopy-cover"');
    expect(html).toContain('>canopy cover</a>');
  });

  it('still renders ordinary markdown links', () => {
    expect(renderer().render('[a](https://example.com)')).toContain('href="https://example.com"');
  });

  it('escapes HTML in page text', () => {
    expect(renderer().render('<script>alert(1)</script>')).not.toContain('<script>');
  });

  it('shows a page title once, not twice', () => {
    // The reader prints the title from the front matter, so the page's own opening heading is
    // dropped. Without that every page opens with its name printed twice at two different sizes.
    const md = loadNamespace<{ render: (s: string) => string; stripLeadingTitle: (h: string) => string }>(
      '/src/lib/markdown.js',
      'wikiMarkdown'
    );
    const body = md.stripLeadingTitle(md.render(file('/wiki/overview.md')));

    expect(body).not.toContain('<h1>');
    expect(body).toContain('The current thesis');
  });

});

