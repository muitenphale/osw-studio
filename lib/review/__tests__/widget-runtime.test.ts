// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { REVIEW_RUNTIME_JS, REVIEW_RUNTIME_EXPORTS } from '../widget-runtime';

/**
 * These tests evaluate the runtime source that is published, not a parallel TypeScript copy of it.
 * The widget ships as injected script and cannot import a module, so the source text is the only
 * implementation there is — see the header of widget-runtime.ts.
 */

interface Thread {
  id: string;
  comment: Wireish;
  replies: Wireish[];
  number: number;
}

interface Wireish {
  id: string;
  parent_id: string | null;
  status: string;
  page_path: string;
  body?: string;
}

interface Runtime {
  oswIsSafeIdent(value: unknown): boolean;
  oswChildIndex(node: Element): number;
  oswSelectorFor(el: Element | null, host: Element | null): string | null;
  oswResolveSelector(selector: string | null, host: Element | null): Element | null;
  oswResolveAnchor(
    selector: string | null,
    host: Element | null
  ): { anchored: boolean; element: Element | null };
  oswAnchorText(el: Element | null, limit?: number): string;
  oswDescribeElement(el: Element | null): string;
  oswPagePath(pathname: string, deploymentId: string): string;
  oswBuildThreads(comments: Wireish[]): Thread[];
  oswFilterThreads(threads: Thread[], filter: string, pagePath?: string): Thread[];
  oswDeepLinkedComment(search: string | null | undefined): string | null;
  oswThreadForComment(threads: Thread[] | null, commentId: string | null): Thread | null;
}

function loadRuntime(): Runtime {
  const names = REVIEW_RUNTIME_EXPORTS.join(', ');
  const factory = new Function(`${REVIEW_RUNTIME_JS}\nreturn { ${names} };`);
  return factory() as Runtime;
}

const runtime = loadRuntime();

/** The widget host as it is actually mounted: last child of body, and never a comment target. */
function mountHost(): HTMLElement {
  const host = document.createElement('div');
  host.setAttribute('data-osw-review-widget', 'dep-1');
  host.appendChild(document.createElement('span'));
  document.body.appendChild(host);
  return host;
}

function comment(id: string, extra: Partial<Wireish> = {}): Wireish {
  return { id, parent_id: null, status: 'open', page_path: '/index.html', ...extra };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('selector generation', () => {
  it('generates a selector that resolves back to the element it came from', () => {
    document.body.innerHTML = `
      <header><nav><a href="#">Home</a><a href="#">Menu</a></nav></header>
      <main>
        <h2>Bread, baked before dawn.</h2>
        <div class="cards">
          <div><h3>Sourdough</h3></div>
          <div><h3>Pastry</h3></div>
          <div><h3>Rye</h3></div>
        </div>
      </main>
    `;
    const host = mountHost();

    const targets = Array.from(document.body.querySelectorAll('*')).filter(
      el => el !== host && !host.contains(el)
    );
    expect(targets.length).toBeGreaterThan(8);

    for (const target of targets) {
      const selector = runtime.oswSelectorFor(target, host);
      expect(selector, `no selector for ${target.tagName}`).toBeTruthy();
      expect(document.querySelector(selector as string), `selector ${selector}`).toBe(target);
    }
  });

  it('terminates on a unique id rather than walking to the root', () => {
    document.body.innerHTML = '<div><section id="pricing"><p>Plans</p></section></div>';
    const host = mountHost();

    const selector = runtime.oswSelectorFor(document.querySelector('#pricing p'), host);
    expect(selector).toBe('#pricing > p:nth-child(1)');
    expect(document.querySelector(selector as string)).toBe(document.querySelector('#pricing p'));
  });

  it('does not use an id that is duplicated in the document', () => {
    document.body.innerHTML = '<div id="dup"><b>a</b></div><div id="dup"><b>b</b></div>';
    const host = mountHost();

    const second = document.querySelectorAll('div[id="dup"]')[1].querySelector('b');
    const selector = runtime.oswSelectorFor(second, host);

    expect(selector).not.toContain('#dup');
    expect(document.querySelector(selector as string)).toBe(second);
  });

  it('refuses to address the widget host or anything inside it', () => {
    const host = mountHost();

    expect(runtime.oswSelectorFor(host, host)).toBeNull();
    expect(runtime.oswSelectorFor(host.firstElementChild, host)).toBeNull();
  });

  it('returns null for a detached element', () => {
    const host = mountHost();
    expect(runtime.oswSelectorFor(document.createElement('div'), host)).toBeNull();
  });
});

describe('nth-child counting around the host', () => {
  it("a sibling's selector is unaffected by the host being present", () => {
    document.body.innerHTML = '<p>one</p><p>two</p><p>three</p>';
    const third = document.querySelectorAll('p')[2];

    const withoutHost = runtime.oswSelectorFor(third, null);

    const host = mountHost();
    const withHost = runtime.oswSelectorFor(third, host);

    expect(withHost).toBe(withoutHost);
    expect(withHost).toBe('body > p:nth-child(3)');
  });

  it('never anchors to a neighbour when elements arrive after the host', () => {
    // The host is appended once, at init. A modal portal, a toast container or a lazily loaded
    // third-party widget lands after it and stays there, so its siblings are real comment targets.
    document.body.innerHTML = '<p>one</p>';
    const host = mountHost();

    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.appendChild(first);
    document.body.appendChild(second);

    const selector = runtime.oswSelectorFor(second, host) as string;
    const result = runtime.oswResolveAnchor(selector, host);

    // Unanchored is an acceptable answer; a different element never is.
    if (result.anchored) expect(result.element).toBe(second);
    else expect(result.element).toBeNull();
    expect(result.element).not.toBe(first);
  });

  it('a selector generated with the widget mounted resolves in a document without it', () => {
    document.body.innerHTML = '<section><span>a</span><span>b</span></section>';
    const host = mountHost();
    const target = document.querySelectorAll('span')[1];

    const selector = runtime.oswSelectorFor(target, host) as string;

    // The published page the studio inbox loads carries no widget at all.
    host.remove();
    expect(document.querySelector(selector)).toBe(document.querySelectorAll('span')[1]);
  });
});

describe('selector resolution', () => {
  it('resolves a selector that still matches', () => {
    document.body.innerHTML = '<div><em>hi</em></div>';
    const result = runtime.oswResolveAnchor('body > div:nth-child(1) > em:nth-child(1)', null);

    expect(result.anchored).toBe(true);
    expect(result.element).toBe(document.querySelector('em'));
  });

  it('yields the unanchored state when the element has moved, not a wrong element', () => {
    document.body.innerHTML = '<div><h2>Old headline</h2></div>';
    const selector = runtime.oswSelectorFor(document.querySelector('h2'), null) as string;

    // A republish rewrites the page: the h2 is gone and something else occupies that position.
    document.body.innerHTML = '<div><p>Replacement paragraph</p></div>';

    const result = runtime.oswResolveAnchor(selector, null);
    expect(result.anchored).toBe(false);
    expect(result.element).toBeNull();
  });

  it('treats an unparseable selector as unanchored rather than throwing', () => {
    document.body.innerHTML = '<div></div>';
    expect(() => runtime.oswResolveAnchor('div::)(', null)).not.toThrow();
    expect(runtime.oswResolveAnchor('div::)(', null).anchored).toBe(false);
  });

  it('treats an empty or missing selector as unanchored', () => {
    expect(runtime.oswResolveAnchor('', null).anchored).toBe(false);
    expect(runtime.oswResolveAnchor(null, null).anchored).toBe(false);
  });

  it('never resolves to the widget itself', () => {
    const host = mountHost();
    expect(runtime.oswResolveAnchor('[data-osw-review-widget]', host).anchored).toBe(false);
    expect(runtime.oswResolveAnchor('[data-osw-review-widget] span', host).anchored).toBe(false);
  });
});

describe('anchor text and description', () => {
  it('collapses whitespace and caps the snippet', () => {
    document.body.innerHTML = '<p>  Bread,\n   baked   before dawn.  </p>';
    expect(runtime.oswAnchorText(document.querySelector('p'))).toBe('Bread, baked before dawn.');
    expect(runtime.oswAnchorText(document.querySelector('p'), 6)).toBe('Bread,');
  });

  it('describes an element by tag and first class', () => {
    document.body.innerHTML = '<a class="cta primary">Order</a><h2>Title</h2>';
    expect(runtime.oswDescribeElement(document.querySelector('a'))).toBe('a.cta');
    expect(runtime.oswDescribeElement(document.querySelector('h2'))).toBe('h2');
  });
});

describe('page path', () => {
  it('strips the review mount point so comments name the published page', () => {
    expect(runtime.oswPagePath('/review/dep-1/index.html', 'dep-1')).toBe('/index.html');
    expect(runtime.oswPagePath('/review/dep-1/', 'dep-1')).toBe('/');
    expect(runtime.oswPagePath('/review/dep-1', 'dep-1')).toBe('/');
  });

  it('leaves a path that is not under the mount point alone', () => {
    expect(runtime.oswPagePath('/index.html', 'dep-1')).toBe('/index.html');
    expect(runtime.oswPagePath('/review/other/index.html', 'dep-1')).toBe(
      '/review/other/index.html'
    );
  });
});

describe('thread assembly', () => {
  it('nests replies under their root and numbers roots in order', () => {
    const threads = runtime.oswBuildThreads([
      comment('a'),
      comment('b'),
      comment('r1', { parent_id: 'a' }),
      comment('r2', { parent_id: 'a' }),
    ]);

    expect(threads.map(t => t.id)).toEqual(['a', 'b']);
    expect(threads.map(t => t.number)).toEqual([1, 2]);
    expect(threads[0].replies.map(r => r.id)).toEqual(['r1', 'r2']);
    expect(threads[1].replies).toEqual([]);
  });

  it('flattens a reply to a reply onto the root, which owns the anchor', () => {
    const threads = runtime.oswBuildThreads([
      comment('a'),
      comment('r1', { parent_id: 'a' }),
      comment('r2', { parent_id: 'r1' }),
    ]);

    expect(threads).toHaveLength(1);
    expect(threads[0].replies.map(r => r.id)).toEqual(['r1', 'r2']);
  });

  it('keeps a reply whose parent is missing as its own thread', () => {
    const threads = runtime.oswBuildThreads([comment('a'), comment('orphan', { parent_id: 'gone' })]);

    expect(threads.map(t => t.id)).toEqual(['a', 'orphan']);
  });

  it('survives a parent cycle', () => {
    const threads = runtime.oswBuildThreads([
      comment('x', { parent_id: 'y' }),
      comment('y', { parent_id: 'x' }),
    ]);

    expect(threads.length).toBeGreaterThan(0);
  });
});

describe('thread filtering', () => {
  const threads = () =>
    runtime.oswBuildThreads([
      comment('a', { status: 'open', page_path: '/index.html' }),
      comment('b', { status: 'resolved', page_path: '/index.html' }),
      comment('c', { status: 'open', page_path: '/menu.html' }),
      comment('reply', { parent_id: 'b', status: 'open', page_path: '/index.html' }),
    ]);

  it('all keeps every thread', () => {
    expect(runtime.oswFilterThreads(threads(), 'all', '/index.html').map(t => t.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('open excludes resolved roots', () => {
    expect(runtime.oswFilterThreads(threads(), 'open', '/index.html').map(t => t.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('a later reply does not reopen a resolved thread', () => {
    expect(runtime.oswFilterThreads(threads(), 'resolved', '/index.html').map(t => t.id)).toEqual([
      'b',
    ]);
  });

  it('this page filters on the root comment path', () => {
    expect(runtime.oswFilterThreads(threads(), 'page', '/menu.html').map(t => t.id)).toEqual(['c']);
  });
});

describe('safe identifiers', () => {
  it('accepts a plain id and rejects one that would need quoting', () => {
    expect(runtime.oswIsSafeIdent('pricing')).toBe(true);
    expect(runtime.oswIsSafeIdent('pricing-2_a')).toBe(true);
    expect(runtime.oswIsSafeIdent('2cols')).toBe(false);
    expect(runtime.oswIsSafeIdent('has space')).toBe(false);
    expect(runtime.oswIsSafeIdent('has.dot')).toBe(false);
    expect(runtime.oswIsSafeIdent('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Deep links from the studio to one comment
// ---------------------------------------------------------------------------

describe('oswDeepLinkedComment', () => {
  it('reads the id out of a query string, wherever the parameter sits', () => {
    expect(runtime.oswDeepLinkedComment('?osw-comment=abc')).toBe('abc');
    expect(runtime.oswDeepLinkedComment('?page=2&osw-comment=abc')).toBe('abc');
    expect(runtime.oswDeepLinkedComment('?osw-comment=abc&page=2')).toBe('abc');
  });

  it('decodes the value, because the studio encodes it', () => {
    expect(runtime.oswDeepLinkedComment('?osw-comment=a%2Fb')).toBe('a/b');
  });

  it('is null when there is nothing to focus', () => {
    expect(runtime.oswDeepLinkedComment('')).toBeNull();
    expect(runtime.oswDeepLinkedComment(null)).toBeNull();
    expect(runtime.oswDeepLinkedComment('?other=1')).toBeNull();
    expect(runtime.oswDeepLinkedComment('?osw-comment=')).toBeNull();
  });

  it('does not match a parameter that merely ends in the name', () => {
    // `?not-osw-comment=x` is a different parameter, and treating it as this one would open a
    // thread nobody linked to.
    expect(runtime.oswDeepLinkedComment('?not-osw-comment=x')).toBeNull();
  });

  it('returns null rather than throwing on a malformed escape', () => {
    // The query string is whatever is in the address bar. A throw here would happen during the
    // widget's boot, after the comments have loaded, and would leave the page without its pins.
    expect(runtime.oswDeepLinkedComment('?osw-comment=%')).toBeNull();
  });
});

describe('oswThreadForComment', () => {
  const threads = (): Thread[] =>
    runtime.oswBuildThreads([
      { id: 'root-1', parent_id: null, status: 'open', page_path: '/' },
      { id: 'reply-1', parent_id: 'root-1', status: 'open', page_path: '/' },
      { id: 'root-2', parent_id: null, status: 'open', page_path: '/' },
    ]);

  it('finds a thread by its root id', () => {
    expect(runtime.oswThreadForComment(threads(), 'root-2')?.id).toBe('root-2');
  });

  it('finds the thread a reply belongs to', () => {
    // The studio lists a reply's id as readily as a root's, and a reply is not addressable alone.
    expect(runtime.oswThreadForComment(threads(), 'reply-1')?.id).toBe('root-1');
  });

  it('is null for an id that is not here, so a stale link opens nothing', () => {
    expect(runtime.oswThreadForComment(threads(), 'gone')).toBeNull();
    expect(runtime.oswThreadForComment(threads(), null)).toBeNull();
    expect(runtime.oswThreadForComment(null, 'root-1')).toBeNull();
  });
});
