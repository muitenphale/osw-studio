import { describe, it, expect } from 'vitest';
import { upsertDeclaration, removeMarkerBlock, OVERRIDES_HEADER } from '../overrides-css';

const BLOCK = (id: string) => new RegExp(`\\[data-osw-id="${id}"\\]\\[data-osw-id\\]\\s*\\{`, 'g');

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

  it('is a no-op when the marker owns no block', () => {
    const hand = '/* keep me */\n.thing { color: hotpink; }\n';
    expect(removeMarkerBlock(hand, 'aaaaaaaa')).toBe(hand);
  });
});
