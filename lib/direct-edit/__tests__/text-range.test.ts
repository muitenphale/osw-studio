import { describe, it, expect } from 'vitest';
import { readTextRange, writeTextRange } from '../apply-text';

/**
 * The range reader and the writer, as one pair.
 *
 * **The round trip is the acceptance property.** Read the range, write back the identical text,
 * assert the file is byte-identical. One assertion catches an entity mangled, an indent eaten and
 * an off-by-one splice, and it is the property a plausible-looking implementation fails: a reader
 * that decodes `&amp;` and a writer that escapes `&` unconditionally produce `&amp;amp;` and both
 * halves look right in isolation.
 */

/** Where an element's open tag starts. Test-side only — the production path is handed the index. */
const at = (content: string, tag: string) => content.indexOf(tag);

function roundTrip(content: string, tag: string) {
  const range = readTextRange(content, at(content, tag));
  if (!range.ok) throw new Error(`expected a readable range, got ${range.reason}`);
  return { range, rewritten: writeTextRange(content, range, range.text) };
}

describe('readTextRange', () => {
  it('reads the run between the open tag and its close tag', () => {
    const content = '<body><h1>Hello there</h1></body>';

    const range = readTextRange(content, at(content, '<h1'));

    expect(range).toEqual({
      ok: true,
      start: content.indexOf('Hello'),
      end: content.indexOf('</h1>'),
      text: 'Hello there',
    });
  });

  it('reads the one index it was given, not the first tag that looks like it', () => {
    // The whole design. Seven identical paragraphs are seven indices, and no search is performed —
    // an implementation that reached for indexOf would return the first one every time.
    const content = '<div><p>Learn more</p><p>Learn more</p><p>Learn more</p></div>';
    const third = content.lastIndexOf('<p>');

    const range = readTextRange(content, third);

    expect(range.ok && range.start).toBe(third + '<p>'.length);
    expect(range.ok && range.end).toBe(content.lastIndexOf('</p>'));
  });

  it('counts nesting, so the inner close tag does not end the outer element', () => {
    // The outer `<div>` is never closed: its one `</div>` belongs to the inner one. A depth-blind
    // scan stops at that `</div>`, decides it has found the range, and reports `has-children` — a
    // confident answer about a range that does not exist. Depth counting is what tells them apart,
    // and this pair of reasons is the only place the difference is observable.
    const unclosed = '<section><div>a<div>b</div>c</section>';
    expect(readTextRange(unclosed, at(unclosed, '<div'))).toEqual({ ok: false, reason: 'unclosed' });

    const closed = '<section><div>a<div>b</div>c</div></section>';
    expect(readTextRange(closed, at(closed, '<div'))).toEqual({ ok: false, reason: 'has-children' });
  });

  it('is not ended early by a > inside a quoted attribute value', () => {
    const content = '<p title="a > b">Hi</p>';

    expect(readTextRange(content, 0)).toEqual({
      ok: true,
      start: content.indexOf('Hi'),
      end: content.indexOf('</p>'),
      text: 'Hi',
    });
  });

  it('refuses a range holding a child element', () => {
    const content = '<p>Hello <strong>you</strong></p>';
    expect(readTextRange(content, 0)).toEqual({ ok: false, reason: 'has-children' });
  });

  it('refuses a range holding a comment', () => {
    const content = '<p>Hello<!-- and goodbye --></p>';
    expect(readTextRange(content, 0)).toEqual({ ok: false, reason: 'has-children' });
  });

  it('refuses a range the template computes', () => {
    const content = '<h1>{{page.title}}</h1>';
    expect(readTextRange(content, 0)).toEqual({ ok: false, reason: 'has-expression' });
  });

  it('refuses a range with an expression beside the text', () => {
    const content = '<p>Hello {{name}}</p>';
    expect(readTextRange(content, 0)).toEqual({ ok: false, reason: 'has-expression' });
  });

  it('names the markup first when the range is wrong in both ways', () => {
    // "It contains a link" is something the user can see and act on; "it contains an expression" is
    // not, and reporting the invisible one about a range that visibly holds a tag reads as a
    // non-sequitur.
    const content = '<p>Hi {{name}} <b>x</b></p>';
    expect(readTextRange(content, 0)).toEqual({ ok: false, reason: 'has-children' });
  });

  it('refuses a void element', () => {
    const content = '<div><img src="/a.png"></div>';
    expect(readTextRange(content, at(content, '<img'))).toEqual({ ok: false, reason: 'void-element' });
  });

  it('refuses a self-closing tag, whose attribute value ends in a slash', () => {
    // `<a href="/about/">` must not read as self-closing — the `/` is inside the quotes.
    const open = '<a href="/about/">Home</a>';
    expect(readTextRange(open, 0)).toEqual({
      ok: true, start: open.indexOf('Home'), end: open.indexOf('</a>'), text: 'Home',
    });
    expect(readTextRange('<svg><circle r="4"/></svg>', 5)).toEqual({ ok: false, reason: 'void-element' });
  });

  it('refuses an element that is never closed', () => {
    expect(readTextRange('<div><p>dangling', 5)).toEqual({ ok: false, reason: 'unclosed' });
  });

  it('refuses an index that is not a tag', () => {
    expect(readTextRange('<p>Hi</p>', 1)).toEqual({ ok: false, reason: 'not-a-tag' });
  });

  it('reads a textarea as text, so markup inside it is not scanned as markup', () => {
    const content = '<textarea>Use &lt;div&gt; here</textarea>';
    expect(readTextRange(content, 0)).toEqual({
      ok: true,
      start: '<textarea>'.length,
      end: content.indexOf('</textarea>'),
      text: 'Use <div> here',
    });
  });

  it('trims the indentation off the text without trimming a non-breaking space', () => {
    const content = '<h1>\n    Hello there\n  </h1>';

    const range = readTextRange(content, 0);

    // The range is the whole content; the text is what the element says. `String.trim` would eat
    // the U+00A0 as well, which is exactly the character the spec says must not move.
    expect(range).toEqual({
      ok: true,
      start: 4,
      end: content.indexOf('</h1>'),
      text: 'Hello there',
    });
  });
});

describe('the round trip', () => {
  const CASES: Array<[string, string, string]> = [
    ['&amp; in the text', '<p>Ben &amp; Jerry</p>', '<p'],
    ['&nbsp; in the text', '<p>10&nbsp;kg</p>', '<p'],
    ['&shy; in the text', '<p>Fern&shy;seher</p>', '<p'],
    ['< as an entity', '<p>Use &lt;div&gt; for that</p>', '<p'],
    ['a multi-line indented run', '<body>\n  <h1>\n    One line\n    and another\n  </h1>\n</body>', '<h1'],
    ['leading and trailing whitespace', '<h1>   Spaced out \t </h1>', '<h1'],
    ['attributes containing > inside a quoted value', '<p data-q="a > b" title=\'c > d\'>Text</p>', '<p'],
    ['nested same-name tags around it', '<div><div>Inner</div></div>', '<div>Inner'],
    ['an entity the table does not know', '<p>I &hearts; this &#8212; a lot</p>', '<p'],
    ['a name that is a property of Object.prototype', '<p>a &constructor; b</p>', '<p'],
    ['no content at all', '<p></p>', '<p'],
  ];

  for (const [name, content, tag] of CASES) {
    it(`is byte-identical for ${name}`, () => {
      const { rewritten } = roundTrip(content, tag);
      expect(rewritten).toBe(content);
    });
  }

  it('hands back what the element says, decoded, for the entity cases', () => {
    // The other half of the property: byte-identity is also satisfied by a reader that returns the
    // raw source and a writer that splices it back unchanged, which would put `&amp;` in front of
    // the user.
    expect(roundTrip('<p>Ben &amp; Jerry</p>', '<p').range.text).toBe('Ben & Jerry');
    expect(roundTrip('<p>10&nbsp;kg</p>', '<p').range.text).toBe('10 kg');
    expect(roundTrip('<p>Use &lt;div&gt; for that</p>', '<p').range.text).toBe('Use <div> for that');
  });
});

describe('writeTextRange', () => {
  const range = (content: string, tag: string) => {
    const r = readTextRange(content, at(content, tag));
    if (!r.ok) throw new Error(r.reason);
    return r;
  };

  it('replaces the text and nothing else', () => {
    const content = '<body><h1 class="hero">Old words</h1></body>';
    expect(writeTextRange(content, range(content, '<h1'), 'New words'))
      .toBe('<body><h1 class="hero">New words</h1></body>');
  });

  it('keeps the file\'s own indentation when the text becomes one word', () => {
    const content = '<body>\n  <h1>\n    One line\n    and another\n  </h1>\n</body>';
    expect(writeTextRange(content, range(content, '<h1'), 'Short'))
      .toBe('<body>\n  <h1>\n    Short\n  </h1>\n</body>');
  });

  it('encodes what would otherwise be markup, and leaves the rest of the file alone', () => {
    const content = '<p>Hi</p><p>&copy; 2026</p>';
    expect(writeTextRange(content, range(content, '<p'), 'Tags <b> & <i> are & remain'))
      .toBe('<p>Tags &lt;b&gt; &amp; &lt;i&gt; are &amp; remain</p><p>&copy; 2026</p>');
  });

  it('writes a non-breaking space back as an entity rather than as a space', () => {
    const content = '<p>x</p>';
    expect(writeTextRange(content, range(content, '<p'), '10 kg')).toBe('<p>10&nbsp;kg</p>');
  });

  it('does not double-escape an entity the user left in the text', () => {
    // `&hearts;` is not in the table, so the reader hands it back verbatim and the writer must put
    // it back verbatim — `&amp;hearts;` would turn a heart into the literal text.
    const content = '<p>x</p>';
    expect(writeTextRange(content, range(content, '<p'), 'I &hearts; it')).toBe('<p>I &hearts; it</p>');
  });
});
