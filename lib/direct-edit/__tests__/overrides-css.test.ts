import { describe, it, expect } from 'vitest';
import {
  declaredProperties,
  upsertDeclaration,
  removeDeclaration,
  removeMarkerBlock,
  OVERRIDES_HEADER,
} from '../overrides-css';

const BLOCK = (id: string) => new RegExp(`\\[data-osw-id="${id}"\\]\\[data-osw-id\\]\\s*\\{`, 'g');

/** The selector `upsertDeclaration` writes, for the cases that hand-build a file rather than seed one. */
const SELECTOR = (id: string) => `[data-osw-id="${id}"][data-osw-id]`;

describe('upsertDeclaration', () => {
  it('creates the file body with a header when empty', () => {
    const out = upsertDeclaration('', 'h7x2m4qp', { property: 'padding-block', value: '3rem' });
    expect(out).toContain(OVERRIDES_HEADER);
    expect(out).toContain('padding-block: 3rem;');
  });

  it('uses the doubled attribute selector, which is what wins the cascade', () => {
    // A bare [data-osw-id] is (0,1,0) — one class — so `.hero .title` would beat it despite
    // loading later. Doubled is (0,2,0), which ties and wins on source order.
    const out = upsertDeclaration('', 'aaaaaaaa', { property: 'color', value: 'red' });
    expect(out).toMatch(/\[data-osw-id="aaaaaaaa"\]\[data-osw-id\]/);
    expect(out).not.toContain('!important');
    expect(out).not.toContain('@layer');
  });

  it('adds a second property to the SAME block, not a second block', () => {
    let out = upsertDeclaration('', 'aaaaaaaa', { property: 'color', value: 'red' });
    out = upsertDeclaration(out, 'aaaaaaaa', { property: 'padding', value: '1rem' });
    expect(out.match(BLOCK('aaaaaaaa'))).toHaveLength(1);   // <- one block
    expect(out).toContain('color: red;');
    expect(out).toContain('padding: 1rem;');
  });

  it('replaces the value when the same property is set again', () => {
    let out = upsertDeclaration('', 'aaaaaaaa', { property: 'color', value: 'red' });
    out = upsertDeclaration(out, 'aaaaaaaa', { property: 'color', value: 'blue' });
    expect(out).toContain('color: blue;');
    expect(out).not.toContain('color: red;');
    expect(out.match(BLOCK('aaaaaaaa'))).toHaveLength(1);
  });

  it('keeps blocks for other markers untouched', () => {
    let out = upsertDeclaration('', 'aaaaaaaa', { property: 'color', value: 'red' });
    out = upsertDeclaration(out, 'bbbbbbbb', { property: 'color', value: 'blue' });
    out = upsertDeclaration(out, 'aaaaaaaa', { property: 'color', value: 'green' });
    expect(out).toContain('color: blue;');
    expect(out).toContain('color: green;');
    expect(out).not.toContain('color: red;');
  });

  it('preserves hand-written content before AND after an owned block, byte-exact', () => {
    const before = '/* mine */\n.thing { color: hotpink; }\n';
    const after  = '\n.other { margin: 0 }\n/* trailing */\n';
    let out = upsertDeclaration(before + after, 'aaaaaaaa', { property: 'color', value: 'red' });
    out = upsertDeclaration(out, 'aaaaaaaa', { property: 'padding', value: '1rem' });
    expect(out).toContain(before.trim());
    expect(out).toContain('.other { margin: 0 }');
    expect(out).toContain('/* trailing */');
  });

  it('throws rather than editing a rule it does not own (selector inside a comment)', () => {
    const trap = '/* [data-osw-id="aaaaaaaa"][data-osw-id] is mentioned here */\n.victim { color: hotpink; }\n';
    expect(() => upsertDeclaration(trap, 'aaaaaaaa', { property: 'color', value: 'red' }))
      .toThrow();
  });

  it('is not confused by a brace inside a string', () => {
    const tricky = '.x { content: "}" }\n';
    const out = upsertDeclaration(tricky, 'aaaaaaaa', { property: 'color', value: 'red' });
    expect(out).toContain('.x { content: "}" }');
    expect(out.match(BLOCK('aaaaaaaa'))).toHaveLength(1);
  });

  it('is not confused by a brace inside a string that PRECEDES the owned block', () => {
    // The case the tokenizer actually exists for. With the string state removed, the plan's own
    // `.x { content: "}" }` case still passes — the block is simply appended after it — so it
    // proves nothing on its own. Put the trap *before* an owned block and the depth desync bites:
    // `}` closes `.x` early and the owned selector is mis-sliced (duplicate block appended);
    // `{` opens a phantom level and the owned selector reads as nested (spurious throw).
    for (const ch of ['{', '}']) {
      const css = `.x { content: "${ch}" }\n[data-osw-id="aaaaaaaa"][data-osw-id] { color: red; }\n`;
      const out = upsertDeclaration(css, 'aaaaaaaa', { property: 'padding', value: '1rem' });
      expect(out.match(BLOCK('aaaaaaaa')), `for ${ch}`).toHaveLength(1);
      expect(out, `for ${ch}`).toContain('color: red;');
      expect(out, `for ${ch}`).toContain('padding: 1rem;');
      expect(out, `for ${ch}`).toContain(`.x { content: "${ch}" }`);
    }
  });

  it('does not split a hand-written declaration on a semicolon inside a string or parens', () => {
    const hand = '[data-osw-id="aaaaaaaa"][data-osw-id] {\n' +
      '  content: "a;b";\n  background: url(x;y);\n}\n';
    const out = upsertDeclaration(hand, 'aaaaaaaa', { property: 'color', value: 'red' });
    expect(out).toContain('content: "a;b";');
    expect(out).toContain('background: url(x;y);');
    expect(out).toContain('color: red;');
  });

  it('throws when the marker block is nested inside an at-rule', () => {
    const nested = '@media (min-width: 40em) {\n  [data-osw-id="aaaaaaaa"][data-osw-id] { color: red; }\n}\n';
    expect(() => upsertDeclaration(nested, 'aaaaaaaa', { property: 'color', value: 'blue' }))
      .toThrow();
  });

  it('rejects an injected value or property rather than corrupting the file', () => {
    expect(() => upsertDeclaration('', 'a', { property: 'color', value: 'red; } body {' })).toThrow();
    expect(() => upsertDeclaration('', 'a', { property: 'color; } body { color', value: 'red' })).toThrow();
  });

  // --- beyond the plan's block, pinning behaviour the implementation commits to ---

  it('rejects a value that opens or closes a comment, or is empty', () => {
    for (const value of ['red /* x', 'red */', '', '   ', 'red }', 'a{b']) {
      expect(() => upsertDeclaration('', 'a', { property: 'color', value }),
        `should reject value ${JSON.stringify(value)}`).toThrow();
    }
  });

  it('rejects a marker id that would not survive the selector', () => {
    for (const id of ['', 'a"b', 'a b', 'a]b']) {
      expect(() => upsertDeclaration('', id, { property: 'color', value: 'red' }),
        `should reject id ${JSON.stringify(id)}`).toThrow();
    }
  });

  it('splits a declaration on the FIRST colon, so a url() value survives', () => {
    const out = upsertDeclaration('', 'aaaaaaaa',
      { property: 'background-image', value: 'url(https://a/b.png)' });
    expect(out).toContain('background-image: url(https://a/b.png);');
    const again = upsertDeclaration(out, 'aaaaaaaa',
      { property: 'background-image', value: 'url(https://c/d.png)' });
    expect(again).toContain('background-image: url(https://c/d.png);');
    expect(again).not.toContain('b.png');
    expect(again.match(BLOCK('aaaaaaaa'))).toHaveLength(1);
  });

  it('matches an owned block that was reformatted or minified', () => {
    const minified = '[data-osw-id="aaaaaaaa"][data-osw-id]{color:red}\n';
    const out = upsertDeclaration(minified, 'aaaaaaaa', { property: 'padding', value: '1rem' });
    expect(out.match(BLOCK('aaaaaaaa'))).toHaveLength(1);
    expect(out).toContain('color: red;');
    expect(out).toContain('padding: 1rem;');
  });

  it('does not claim a descendant selector that merely mentions the marker', () => {
    // `[..="a"] [data-osw-id]` is a different rule from `[..="a"][data-osw-id]`.
    const hand = '[data-osw-id="aaaaaaaa"] [data-osw-id] { color: red; }\n';
    const out = upsertDeclaration(hand, 'aaaaaaaa', { property: 'color', value: 'blue' });
    expect(out).toContain('[data-osw-id="aaaaaaaa"] [data-osw-id] { color: red; }');
    expect(out.match(BLOCK('aaaaaaaa'))).toHaveLength(1);
  });

  it('keeps a hand-written comment inside an owned block', () => {
    let out = upsertDeclaration('', 'aaaaaaaa', { property: 'color', value: 'red' });
    out = out.replace('  color: red;', '  /* why */\n  color: red;');
    out = upsertDeclaration(out, 'aaaaaaaa', { property: 'padding', value: '1rem' });
    expect(out).toContain('/* why */');
  });

  it('does not accumulate blank lines across repeated upserts', () => {
    let out = upsertDeclaration('', 'aaaaaaaa', { property: 'color', value: 'red' });
    for (let i = 0; i < 5; i++) {
      out = upsertDeclaration(out, 'aaaaaaaa', { property: 'color', value: `c${i}` });
    }
    expect(out).not.toMatch(/\n\s*\n\s*\n/);
  });
});

describe('removeDeclaration', () => {
  /** Two properties on one marker, plus a hand-written rule that must survive everything. */
  const seeded = (): string => {
    const hand = '/* keep me */\n.thing { color: hotpink; }\n';
    let out = upsertDeclaration(hand, 'aaaaaaaa', { property: 'color', value: 'red' });
    out = upsertDeclaration(out, 'aaaaaaaa', { property: 'padding-block', value: '1rem' });
    return upsertDeclaration(out, 'bbbbbbbb', { property: 'color', value: 'blue' });
  };

  it('removes only the named declaration and leaves the rest of the block alone', () => {
    const after = removeDeclaration(seeded(), 'aaaaaaaa', 'color');
    expect(after).not.toContain('color: red;');
    expect(after).toContain('padding-block: 1rem;');
    // The block is still there, still one of it, still keyed to the same marker.
    expect(after.match(BLOCK('aaaaaaaa'))).toHaveLength(1);
  });

  it('removes the whole block once its last declaration goes', () => {
    let after = removeDeclaration(seeded(), 'aaaaaaaa', 'color');
    after = removeDeclaration(after, 'aaaaaaaa', 'padding-block');
    // Not an empty rule: an empty rule reads as an override that failed rather than one never made.
    expect(after).not.toContain('aaaaaaaa');
    expect(after.match(BLOCK('aaaaaaaa'))).toBeNull();
    expect(after).not.toMatch(/\{\s*\}/);
  });

  it('takes the block with it when only a comment would be left behind', () => {
    // `parseBody` keeps hand-written comments as items so re-emitting a block does not delete them.
    // That is right while the block still declares something; once the last declaration goes, a
    // block holding nothing but a comment is an override that no longer exists, still occupying the
    // file and still claiming the marker.
    const seeded = SELECTOR('aaaaaaaa') + ' {\n  /* why this one is pinned */\n  color: red;\n}\n';
    const after = removeDeclaration(seeded, 'aaaaaaaa', 'color');

    expect(after).not.toContain('aaaaaaaa');
    expect(after).not.toContain('why this one is pinned');
    expect(after).not.toMatch(/\{[^}]*\}/);
  });

  it('leaves every other marker, and every hand-written rule, exactly as they were', () => {
    let after = removeDeclaration(seeded(), 'aaaaaaaa', 'color');
    after = removeDeclaration(after, 'aaaaaaaa', 'padding-block');
    expect(after).toContain('bbbbbbbb');
    expect(after).toContain('color: blue;');
    expect(after).toContain('/* keep me */');
    expect(after).toContain('.thing { color: hotpink; }');
  });

  it('is a no-op for a marker that owns nothing, and for a property it never set', () => {
    const hand = '/* keep me */\n.thing { color: hotpink; }\n';
    expect(removeDeclaration(hand, 'aaaaaaaa', 'color')).toBe(hand);
    const css = seeded();
    expect(removeDeclaration(css, 'aaaaaaaa', 'margin-block')).toBe(css);
  });

  it('matches the property however it is cased', () => {
    const css = upsertDeclaration('', 'aaaaaaaa', { property: 'Color', value: 'red' });
    expect(removeDeclaration(css, 'aaaaaaaa', 'color')).not.toContain('red');
  });

  it('clears the property out of EVERY block the marker owns, not just the last', () => {
    // Only reachable by hand-editing, and the case that matters: `upsertDeclaration` edits the last
    // block, so a removal that did the same would leave an earlier duplicate still overriding the
    // property — a Reset the user watches fail.
    const doubled = upsertDeclaration(
      upsertDeclaration('', 'aaaaaaaa', { property: 'color', value: 'red' })
        + '\n[data-osw-id="aaaaaaaa"][data-osw-id] { color: green; padding: 0; }\n',
      'aaaaaaaa',
      { property: 'margin', value: '0' },
    );
    const after = removeDeclaration(doubled, 'aaaaaaaa', 'color');
    expect(after).not.toContain('color: red;');
    expect(after).not.toContain('color: green;');
    expect(after).toContain('padding: 0;');
  });

  it('refuses the same ambiguity the writer refuses', () => {
    const commented = '/* [data-osw-id="aaaaaaaa"][data-osw-id] mentioned */\n.victim { color: hotpink; }\n';
    expect(() => removeDeclaration(commented, 'aaaaaaaa', 'color')).toThrow();

    const nested = '@media (min-width: 40em) {\n  [data-osw-id="aaaaaaaa"][data-osw-id] { color: red; }\n}\n';
    expect(() => removeDeclaration(nested, 'aaaaaaaa', 'color')).toThrow();
  });

  it('refuses an unsafe property name and an unsafe marker id', () => {
    const css = upsertDeclaration('', 'aaaaaaaa', { property: 'color', value: 'red' });
    expect(() => removeDeclaration(css, 'aaaaaaaa', 'color; } body { color')).toThrow();
    expect(() => removeDeclaration(css, 'a"a', 'color')).toThrow();
  });
});

describe('removeMarkerBlock', () => {
  it('removes only that block and leaves everything else byte-exact', () => {
    const hand = '/* keep me */\n.thing { color: hotpink; }\n';
    let out = upsertDeclaration(hand, 'aaaaaaaa', { property: 'color', value: 'red' });
    out = upsertDeclaration(out, 'bbbbbbbb', { property: 'color', value: 'blue' });
    const after = removeMarkerBlock(out, 'aaaaaaaa');
    expect(after).not.toContain('aaaaaaaa');
    expect(after).toContain('bbbbbbbb');
    expect(after).toContain('/* keep me */');            // guards a delete-from-start bug
    expect(after).toContain('.thing { color: hotpink; }');
  });

  it('removes every block the marker owns, not just one of them', () => {
    // `upsertDeclaration` keeps a marker to a single block, so two is a file that was hand-edited or
    // written by an older build — exactly the file this has to survive. The blocks are cut back to
    // front because the offsets were all measured against the original string: cutting the first one
    // first shifts every later offset and the second cut lands mid-rule, splicing the file into
    // something that no longer parses.
    const css = [
      '/* keep me */',
      '.thing { color: hotpink; }',
      SELECTOR('aaaaaaaa') + ' { color: red; }',
      '.between { margin: 0; }',
      SELECTOR('aaaaaaaa') + ' { padding-block: 1rem; }',
      '.after { display: block; }',
      '',
    ].join('\n');

    const after = removeMarkerBlock(css, 'aaaaaaaa');

    expect(after).not.toContain('aaaaaaaa');
    expect(after).not.toContain('color: red');
    expect(after).not.toContain('padding-block: 1rem');
    // Everything that was not the marker's survives, intact and in order — the assertion that a
    // front-to-back cut fails, because it leaves a fragment of the second block behind.
    expect(after).toContain('/* keep me */');
    expect(after).toContain('.thing { color: hotpink; }');
    expect(after).toContain('.between { margin: 0; }');
    expect(after).toContain('.after { display: block; }');
    expect(after.match(/\{/g) ?? []).toHaveLength(3);
  });

  it('is a no-op when the marker owns no block', () => {
    const hand = '/* keep me */\n.thing { color: hotpink; }\n';
    expect(removeMarkerBlock(hand, 'aaaaaaaa')).toBe(hand);
  });
});

describe('declaredProperties', () => {
  it('names what the marker actually overrides, in the order the block declares it', () => {
    let css = upsertDeclaration('', 'aaaaaaaa', { property: 'color', value: 'red' });
    css = upsertDeclaration(css, 'aaaaaaaa', { property: 'padding-block', value: '1rem' });
    css = upsertDeclaration(css, 'bbbbbbbb', { property: 'background-color', value: 'blue' });
    expect(declaredProperties(css, 'aaaaaaaa')).toEqual(['color', 'padding-block']);
    // And it is per marker: the other element's block is not this element's to reset.
    expect(declaredProperties(css, 'bbbbbbbb')).toEqual(['background-color']);
  });

  it('answers [] for a file with no block for this marker, and for an empty file', () => {
    const hand = '/* keep me */\n.thing { color: hotpink; }\n';
    expect(declaredProperties(hand, 'aaaaaaaa')).toEqual([]);
    expect(declaredProperties('', 'aaaaaaaa')).toEqual([]);
  });

  it('lowercases, and does not report a hand-written comment as a property', () => {
    const css = '[data-osw-id="aaaaaaaa"][data-osw-id] {\n  /* mine */\n  COLOR: red;\n}\n';
    expect(declaredProperties(css, 'aaaaaaaa')).toEqual(['color']);
  });

  it('refuses the same ambiguous files the writers refuse, rather than under-reporting', () => {
    // Nested in an at-rule: `removeDeclaration` will not edit there, so reporting the property as
    // resettable would offer a control that can only refuse.
    const nested = '@media (min-width: 40em) {\n  [data-osw-id="aaaaaaaa"][data-osw-id] { color: red; }\n}\n';
    expect(() => declaredProperties(nested, 'aaaaaaaa')).toThrow(/nested/);
    const commented = '/* [data-osw-id="aaaaaaaa"] was here */\n.thing { color: red; }\n';
    expect(() => declaredProperties(commented, 'aaaaaaaa')).toThrow(/comment/);
  });
});
