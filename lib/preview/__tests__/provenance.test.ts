import { describe, it, expect } from 'vitest';
import Handlebars from 'handlebars';
import { injectProvenance, stripProvenance, STRIP_PROVENANCE_JS } from '../provenance';

describe('injectProvenance', () => {
  it('tags an open tag with the index of its "<"', () => {
    expect(injectProvenance('<div>hello</div>', '/index.html')).toBe(
      '<div data-osw-src="/index.html:0">hello</div>'
    );
  });

  it('uses each tag\'s own index, not a running counter', () => {
    // Leading content matters: with a fixture starting at the first tag, index 0 is also what a
    // running counter emits for the first element, so half the assertion would not discriminate.
    const src = 'intro <p>a</p><p>b</p>';
    const out = injectProvenance(src, '/i.html');
    expect(src.indexOf('<p>')).toBe(6);
    expect(out).toContain(`<p data-osw-src="/i.html:${src.indexOf('<p>')}">`);
    expect(out).toContain(`<p data-osw-src="/i.html:${src.lastIndexOf('<p>')}">`);
  });

  it('inserts after the tag name, before author attributes', () => {
    expect(injectProvenance('<a href="/x">y</a>', '/i.html')).toBe(
      '<a data-osw-src="/i.html:0" href="/x">y</a>'
    );
  });

  it('leaves closing tags alone', () => {
    expect(injectProvenance('<div></div>', '/i.html').match(/data-osw-src/g)).toHaveLength(1);
  });
});

describe('injectProvenance — structural exclusions', () => {
  it('never tags html, head or body, and tags everything else', () => {
    const src = '<html><head><title>t</title></head><body><p>x</p></body></html>';
    const out = injectProvenance(src, '/i.html');
    expect(out).toContain('<html>');
    expect(out).toContain('<head>');
    expect(out).toContain('<body>');
    expect(out).toContain('<title>');
    expect(out.match(/data-osw-src/g)).toHaveLength(1); // the <p>, and only the <p>
  });

  it('keeps a realistic page matching the literal "<head>" test used downstream', () => {
    // multipage-preview.tsx and inject-vfs-blob-map.ts both do html.includes('<head>').
    // If that fails they prepend the blob map before the doctype and the preview renders
    // in quirks mode.
    const src = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>T</title>\n</head>\n<body><main><p>x</p></main></body>\n</html>';
    const out = injectProvenance(src, '/i.html');
    expect(out.includes('<head>')).toBe(true);
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out.match(/data-osw-src/g)).toHaveLength(2); // main, p
  });
});

describe('injectProvenance — Handlebars', () => {
  it('does not end a tag early on a mustache in an attribute value', () => {
    const src = '<div class="{{#if a}}on>off{{/if}}">x</div>';
    expect(injectProvenance(src, '/i.hbs'))
      .toBe('<div data-osw-src="/i.hbs:0" class="{{#if a}}on>off{{/if}}">x</div>');
  });

  it('is not fooled by a block comment containing a mustache', () => {
    // A naive skipper stops at the inner {{x}}'s `}}` and scans the comment's tail as markup, so
    // the fixture must carry a tag inside the comment and after the inner mustache. Without the
    // <div>, the remaining ' --}}' holds no tag and the naive version passes too.
    const src = '{{!-- {{x}} <div>hidden</div> --}}<p>y</p>';
    const out = injectProvenance(src, '/i.hbs');
    expect(out.match(/data-osw-src/g)).toHaveLength(1);
    expect(out).toContain(`<p data-osw-src="/i.hbs:${src.indexOf('<p>')}">`);
    expect(out).toContain('<div>hidden</div>');
  });

  it('gives every rendered instance of a loop the same source index', () => {
    // The scanner tags the single source tag once; Handlebars then copies that tag per iteration.
    // Asserting only "one tag in, one attribute out" would hold for any index the scanner emits,
    // including a wrong one, so render the template and assert on what the browser would see.
    const tpl = '{{#each posts}}<article>{{title}}</article>{{/each}}';
    const html = Handlebars.compile(injectProvenance(tpl, '/i.hbs'))({
      posts: Array.from({ length: 6 }, (_, k) => ({ title: `post ${k}` })),
    });
    const matches = html.match(/<article data-osw-src="[^"]+"/g) ?? [];
    expect(matches).toHaveLength(6);
    expect(new Set(matches).size).toBe(1);
    expect(matches[0]).toBe(`<article data-osw-src="/i.hbs:${tpl.indexOf('<article>')}"`);
  });

  it('does not end a tag early on a mustache holding ">" outside quotes', () => {
    // `{{> partial}}` puts a `>` one character into the mustache. Without the mustache branch in
    // findTagEnd the open tag ends there, and the scan resumes *inside* the tag — where the top
    // level, which has no quote handling, finds the <b> in the title attribute and tags it.
    const src = '<div {{> attrsPartial}} title="a<b>c">x</div>';
    const out = injectProvenance(src, '/i.html');
    expect(out.match(/data-osw-src/g)).toHaveLength(1);
    expect(out).toContain('title="a<b>c"');
  });

  it('handles an unquoted mustache attribute value', () => {
    expect(injectProvenance('<a href={{url}}>x</a>', '/i.html'))
      .toBe('<a data-osw-src="/i.html:0" href={{url}}>x</a>');
  });

  it('handles an unquoted triple-mustache attribute value', () => {
    expect(injectProvenance('<div style={{{raw}}}>x</div>', '/i.html'))
      .toBe('<div data-osw-src="/i.html:0" style={{{raw}}}>x</div>');
  });
});

describe('injectProvenance — tag names', () => {
  it('does not truncate a tag name at an underscore', () => {
    // Truncating splices the attribute into the middle of the name: the browser then sees a <my>
    // element with an `_el` attribute, so `my_el` selectors match in the published site but not in
    // the preview — the exact divergence this mechanism exists to avoid.
    expect(injectProvenance('<my_el class="x">hi</my_el>', '/i.html'))
      .toBe('<my_el data-osw-src="/i.html:0" class="x">hi</my_el>');
  });

  it('does not truncate a tag name at a dot', () => {
    expect(injectProvenance('<a.b>x</a.b>', '/i.html'))
      .toBe('<a.b data-osw-src="/i.html:0">x</a.b>');
  });

  it('does not mistake <style_guide> for <style>', () => {
    // A truncated name is what gets looked up in EXCLUDED_TAGS and RAW_TEXT_TAGS, so this element
    // would be treated as excluded *and* raw-text and its whole subtree would lose provenance.
    const src = '<style_guide><p>x</p></style_guide><h1>t</h1>';
    const out = injectProvenance(src, '/i.html');
    expect(out.match(/data-osw-src/g)).toHaveLength(3);
    expect(out).toContain(`<style_guide data-osw-src="/i.html:${src.indexOf('<style_guide>')}">`);
    expect(out).toContain(`<p data-osw-src="/i.html:${src.indexOf('<p>')}">`);
  });

  it('still treats a real script element as raw text', () => {
    expect(injectProvenance('<script>const s = "<div>";</script><p>x</p>', '/i.html')
      .match(/data-osw-src/g)).toHaveLength(1);
  });

  it('does not run a tag name to end of file on malformed markup', () => {
    const out = injectProvenance('<p>a <b</p>', '/i.html');
    expect(out).toContain('<p data-osw-src="/i.html:0">');
    expect(out).toContain('<b data-osw-src="/i.html:5"');
  });
});

describe('injectProvenance — raw text and comments', () => {
  it('does not tag markup inside a script', () => {
    const src = '<script>const s = "<div>";</script><p>x</p>';
    const out = injectProvenance(src, '/i.html');
    expect(out.match(/data-osw-src/g)).toHaveLength(1);
    expect(out).toContain('const s = "<div>";');
  });

  it('does not tag markup inside a style', () => {
    expect(injectProvenance('<style>a::before{content:"<b>"}</style><p>x</p>', '/i.html')
      .match(/data-osw-src/g)).toHaveLength(1);
  });

  it('does not tag markup inside title or textarea (RCDATA)', () => {
    const out = injectProvenance('<title>a<div>b</div></title><textarea><p>c</p></textarea>', '/i.html');
    // textarea itself is tagged; nothing inside either element is.
    expect(out.match(/data-osw-src/g)).toHaveLength(1);
    expect(out).toContain('<textarea data-osw-src=');
  });

  it('does not tag markup inside an HTML comment', () => {
    expect(injectProvenance('<!-- <div>c</div> --><p>x</p>', '/i.html')
      .match(/data-osw-src/g)).toHaveLength(1);
  });

  it('keeps scanning after an abrupt-closing empty comment', () => {
    // `<!-->` and `<!--->` are legal empty comments. Searching for `-->` from past their
    // terminator finds nothing and silently disables provenance for the rest of the file.
    expect(injectProvenance('<!--><p>x</p>', '/i.html')).toContain('<p data-osw-src=');
    expect(injectProvenance('<!---><p>x</p>', '/i.html')).toContain('<p data-osw-src=');
  });
});

describe('injectProvenance — index correctness', () => {
  it('reports UTF-16 code-unit indices, not byte offsets', () => {
    const src = '<p>a — b</p><span>t</span>';
    expect(injectProvenance(src, '/i.html'))
      .toContain(`<span data-osw-src="/i.html:${src.indexOf('<span>')}">`);
  });

  it('reports an index that slices back to the original tag', () => {
    const src = '<div>\n  <p class="x">hello</p>\n</div>';
    const out = injectProvenance(src, '/i.html');
    const index = Number(out.match(/<p data-osw-src="\/i\.html:(\d+)"/)![1]);
    expect(src.slice(index, index + 2)).toBe('<p');
  });

  it('handles an emoji before the target tag', () => {
    const src = '<p>⚠️</p><b>t</b>';
    expect(injectProvenance(src, '/i.html'))
      .toContain(`<b data-osw-src="/i.html:${src.indexOf('<b>')}">`);
  });

  it('reports code-unit indices across a surrogate pair', () => {
    // The other fixtures use BMP characters, where code units and code points agree — neither
    // discriminates the headline claim. 😀 is one code point but two code units, so here the two
    // schemes disagree and only the code-unit answer slices back to the tag.
    const src = '<p>😀</p><b>t</b>';
    expect(src.indexOf('<b>')).toBe(9);
    expect(Array.from(src).slice(0, 8).join('')).toBe('<p>😀</p>');
    expect(injectProvenance(src, '/i.html')).toContain('<b data-osw-src="/i.html:9">');
    expect(src.slice(9, 11)).toBe('<b');
  });
});

describe('injectProvenance — tag shapes', () => {
  it('tags a self-closing tag', () => {
    expect(injectProvenance('<img src="/a.png" />', '/i.html'))
      .toBe('<img data-osw-src="/i.html:0" src="/a.png" />');
  });

  it('tags a void tag', () => {
    expect(injectProvenance('<br>', '/i.html')).toBe('<br data-osw-src="/i.html:0">');
  });

  it('handles an unquoted attribute value', () => {
    expect(injectProvenance('<div id=x>y</div>', '/i.html'))
      .toBe('<div data-osw-src="/i.html:0" id=x>y</div>');
  });

  it('handles an attribute value containing ">"', () => {
    expect(injectProvenance('<div title="a > b">y</div>', '/i.html'))
      .toBe('<div data-osw-src="/i.html:0" title="a > b">y</div>');
  });

  it('handles SVG camelCase tag names', () => {
    expect(injectProvenance('<svg><linearGradient id="g"/></svg>', '/i.html'))
      .toContain('<linearGradient data-osw-src=');
  });
});

describe('stripProvenance', () => {
  it('removes the attribute and the space before it', () => {
    expect(stripProvenance('<a data-osw-src="/i.html:0" href="/x">y</a>'))
      .toBe('<a href="/x">y</a>');
  });

  it('leaves an untagged string untouched', () => {
    const s = '<a href="/x">y</a>';
    expect(stripProvenance(s)).toBe(s);
  });

  it('round-trips with injectProvenance', () => {
    const src = '<div class="a"><p>x</p><img src="/i.png"><textarea>t</textarea></div>';
    expect(stripProvenance(injectProvenance(src, '/i.html'))).toBe(src);
  });

  it('does not touch a data-osw-id marker', () => {
    expect(stripProvenance('<p data-osw-src="/i.html:0" data-osw-id="h7x2m4qp">x</p>'))
      .toBe('<p data-osw-id="h7x2m4qp">x</p>');
  });

  it('leaves author prose that merely mentions the attribute', () => {
    // curl -o writes the stripped result back into project source, so a false positive here is
    // data loss. Requiring the ":<digits>" suffix is what saves this case.
    const s = '<code>data-osw-src="mine"</code>';
    expect(stripProvenance(s)).toBe(s);
  });

  it('still removes an emitted attribute whose path contains a colon', () => {
    expect(stripProvenance('<p data-osw-src="/a:b.html:12">x</p>')).toBe('<p>x</p>');
  });
});

describe('STRIP_PROVENANCE_JS', () => {
  it('emits a working stripper, with the backslash surviving into the emitted source', () => {
    // The constant is interpolated into iframe script template literals. If `\s` were authored
    // singly it would collapse to a literal `s` before ever being emitted — the live bug at
    // multipage-preview.tsx:370. Assert on the emitted text, then on its behaviour.
    expect(STRIP_PROVENANCE_JS).toContain('\\s?data-osw-src="[^"]*:\\d+"');

    const fn = new Function(`${STRIP_PROVENANCE_JS} return __oswStripProv;`)() as (h: string) => string;
    const src = '<div class="a"><p>x</p></div>';
    expect(fn(injectProvenance(src, '/i.html'))).toBe(src);
  });

  it('matches stripProvenance exactly', () => {
    const fn = new Function(`${STRIP_PROVENANCE_JS} return __oswStripProv;`)() as (h: string) => string;
    const tagged = injectProvenance('<main><a href="/x">y</a><br></main>', '/p.html');
    expect(fn(tagged)).toBe(stripProvenance(tagged));
  });
});
