import { describe, it, expect } from 'vitest';
import { replaceSrcAt } from '../apply-image';

/**
 * The attribute rewrite, on its own.
 *
 * Every case is a *string* case: `replaceSrcAt` is handed a file and an index and touches nothing
 * outside the one open tag that starts there. There is no searching anywhere in it, so the tests
 * that matter are the ones where a plausible search would go wrong — a second `src` later in the
 * file, a `src` spelled inside another attribute's value, and an element that shares its spelling
 * with the one being edited.
 */

const at = (content: string, needle: string) => content.indexOf(needle);

describe('replaceSrcAt', () => {
  it('replaces the value and leaves the rest of the tag alone', () => {
    const src = '<img src="/old.png" alt="A cat">';
    expect(replaceSrcAt(src, 0, '/new.png'))
      .toEqual({ ok: true, content: '<img src="/new.png" alt="A cat">' });
  });

  it('keeps single quotes as the author wrote them', () => {
    const src = "<img src='/old.png'>";
    expect(replaceSrcAt(src, 0, '/new.png'))
      .toEqual({ ok: true, content: "<img src='/new.png'>" });
  });

  it('rewrites a self-closing tag without eating the slash', () => {
    const src = '<img src="/old.png" />';
    expect(replaceSrcAt(src, 0, '/new.png').ok).toBe(true);
    expect((replaceSrcAt(src, 0, '/new.png') as { content: string }).content)
      .toBe('<img src="/new.png" />');
    // And with no space before the slash, where the value span and the `/>` are adjacent.
    expect((replaceSrcAt('<img src="/old.png"/>', 0, '/new.png') as { content: string }).content)
      .toBe('<img src="/new.png"/>');
  });

  it('handles attributes on both sides of src', () => {
    const src = '<img class="hero" id="a" src="/old.png" alt="x" loading="lazy">';
    expect((replaceSrcAt(src, 0, '/new.png') as { content: string }).content)
      .toBe('<img class="hero" id="a" src="/new.png" alt="x" loading="lazy">');
  });

  it('quotes an unquoted value', () => {
    expect((replaceSrcAt('<img src=/old.png alt="x">', 0, '/new.png') as { content: string }).content)
      .toBe('<img src="/new.png" alt="x">');
  });

  it('refuses a src holding a Handlebars expression', () => {
    // Overwriting the literal would write a path that is not what renders *and* delete the binding
    // that produces the real one — two wrongs from one press.
    expect(replaceSrcAt('<img src="{{hero.image}}">', 0, '/new.png'))
      .toEqual({ ok: false, reason: 'expression-src' });
    expect(replaceSrcAt('<img src="/images/{{slug}}.png">', 0, '/new.png'))
      .toEqual({ ok: false, reason: 'expression-src' });
  });

  it('refuses an element with no src', () => {
    expect(replaceSrcAt('<div class="hero"></div>', 0, '/new.png'))
      .toEqual({ ok: false, reason: 'no-src' });
    // Valueless `src` is not a literal to replace either.
    expect(replaceSrcAt('<img src>', 0, '/new.png'))
      .toEqual({ ok: false, reason: 'no-src' });
  });

  it('rewrites a src a conditional makes optional', () => {
    // Mustaches are skipped, not treated as scopes, so this is one ordinary `src` literal — and
    // rewriting it changes what the conditional emits, which is what the user asked for.
    expect((replaceSrcAt('<img {{#if hero}}src="/a.png"{{/if}} alt="x">', 0, '/new.png') as { content: string }).content)
      .toBe('<img {{#if hero}}src="/new.png"{{/if}} alt="x">');
  });

  it('refuses a tag that spells src twice', () => {
    // The template is choosing between them. Which one produced the element the user clicked is not
    // knowable from the source, and rewriting the first silently edits the branch they cannot see.
    expect(replaceSrcAt('<img {{#if hero}}src="/a.png"{{else}}src="/b.png"{{/if}}>', 0, '/new.png'))
      .toEqual({ ok: false, reason: 'expression-src' });
  });

  it('refuses an index that is not an open tag', () => {
    expect(replaceSrcAt('<img src="/a.png">', 3, '/new.png'))
      .toEqual({ ok: false, reason: 'not-a-tag' });
    expect(replaceSrcAt('<img src="/a.png">', 999, '/new.png'))
      .toEqual({ ok: false, reason: 'not-a-tag' });
  });

  it('edits the tag at the index, not the first one in the file', () => {
    const src = '<img src="/one.png"><img src="/two.png"><img src="/three.png">';
    expect((replaceSrcAt(src, at(src, '<img src="/two.png"'), '/new.png') as { content: string }).content)
      .toBe('<img src="/one.png"><img src="/new.png"><img src="/three.png">');
  });

  it('does not mistake another attribute\'s value for the src', () => {
    // A regex over the region matches the spelling wherever it appears, including inside a value.
    const src = '<img alt=\'src="/decoy.png"\' src="/old.png">';
    expect((replaceSrcAt(src, 0, '/new.png') as { content: string }).content)
      .toBe('<img alt=\'src="/decoy.png"\' src="/new.png">');
  });

  it('does not read past the end of the tag', () => {
    // The `src` here belongs to the *next* element. Editing this one must not find it.
    const src = '<div class="a"></div><img src="/old.png">';
    expect(replaceSrcAt(src, 0, '/new.png')).toEqual({ ok: false, reason: 'no-src' });
  });

  it('is not fooled by a mustache containing a ">"', () => {
    const src = '<img {{#if a}}title="x>y"{{/if}} src="/old.png">';
    expect((replaceSrcAt(src, 0, '/new.png') as { content: string }).content)
      .toBe('<img {{#if a}}title="x>y"{{/if}} src="/new.png">');
  });

  it('escapes a value that could otherwise terminate the attribute', () => {
    const src = '<img src="/old.png">';
    expect((replaceSrcAt(src, 0, '/a"onerror="alert(1)') as { content: string }).content)
      .toBe('<img src="/a&quot;onerror=&quot;alert(1)">');
    expect((replaceSrcAt("<img src='/old.png'>", 0, "/a'x") as { content: string }).content)
      .toBe("<img src='/a&#39;x'>");
    expect((replaceSrcAt(src, 0, '/a&b.png') as { content: string }).content)
      .toBe('<img src="/a&amp;b.png">');
  });

  it('holds the index steady in a file with non-ASCII before the tag', () => {
    // The index is a UTF-16 code-unit offset, which is what `indexOf` and `slice` speak. A byte
    // offset would land mid-tag here — the built-in templates are full of these characters.
    const src = '<p>café — naïve 🎨</p><img src="/old.png">';
    const index = at(src, '<img');
    expect((replaceSrcAt(src, index, '/new.png') as { content: string }).content)
      .toBe('<p>café — naïve 🎨</p><img src="/new.png">');
  });

  it('leaves the file byte-identical when the value does not change', () => {
    const src = '<img src="/same.png" alt="x">';
    expect(replaceSrcAt(src, 0, '/same.png')).toEqual({ ok: true, content: src });
  });
});
