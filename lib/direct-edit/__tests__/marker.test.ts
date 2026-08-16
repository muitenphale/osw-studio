import { describe, it, expect } from 'vitest';
import { newMarkerId, stampMarker, readMarkerAt, MARKER_ATTR } from '../marker';

describe('MARKER_ATTR', () => {
  it('is the attribute the override selector targets', () => {
    expect(MARKER_ATTR).toBe('data-osw-id');
  });
});

describe('newMarkerId', () => {
  it('is 8 chars of [a-z0-9]', () => {
    for (let i = 0; i < 50; i++) expect(newMarkerId()).toMatch(/^[a-z0-9]{8}$/);
  });
  it('does not repeat across a large sample', () => {
    // Probabilistic (~7e-7 failure at this size). If this ever flakes it is chance, not a bug.
    expect(new Set(Array.from({ length: 2000 }, newMarkerId)).size).toBe(2000);
  });
});

describe('stampMarker', () => {
  it('inserts after the tag name, before author attributes', () => {
    expect(stampMarker('<p class="a">x</p>', 0, 'h7x2m4qp'))
      .toEqual({ changed: true, content: '<p data-osw-id="h7x2m4qp" class="a">x</p>' });
  });

  it('does not truncate a tag name at an underscore or dot', () => {
    // Shared with the provenance scanner precisely so this cannot regress independently.
    expect(stampMarker('<my_el>x</my_el>', 0, 'aaaaaaaa').content)
      .toBe('<my_el data-osw-id="aaaaaaaa">x</my_el>');
    expect(stampMarker('<a.b>x</a.b>', 0, 'aaaaaaaa').content)
      .toBe('<a.b data-osw-id="aaaaaaaa">x</a.b>');
  });

  it('is idempotent — an already-marked element is left alone', () => {
    const src = '<p data-osw-id="existing">x</p>';
    expect(stampMarker(src, 0, 'newid123'))
      .toEqual({ changed: false, content: src, existing: 'existing' });
  });

  it('stamps the tag at the given index, not the first tag', () => {
    const src = '<div><p>x</p></div>';
    expect(stampMarker(src, src.indexOf('<p>'), 'aaaaaaaa').content)
      .toBe('<div><p data-osw-id="aaaaaaaa">x</p></div>');
  });

  it('handles a Handlebars open tag whose mustache contains a ">"', () => {
    const src = '<div {{#if a}}title="x>y"{{/if}} class="c">z</div>';
    expect(stampMarker(src, 0, 'aaaaaaaa').content)
      .toBe('<div data-osw-id="aaaaaaaa" {{#if a}}title="x>y"{{/if}} class="c">z</div>');
  });

  it('refuses an index that is not an open tag', () => {
    expect(() => stampMarker('<p>x</p>', 3, 'aaaaaaaa')).toThrow(/not an open tag/i);
    expect(() => stampMarker('<p>x</p>', 999, 'aaaaaaaa')).toThrow();
  });

  it('refuses an id that could break out of the attribute', () => {
    expect(() => stampMarker('<p>x</p>', 0, 'a" onload="x')).toThrow(/marker id/i);
  });
});

describe('readMarkerAt', () => {
  it('returns an existing id', () => {
    expect(readMarkerAt('<p data-osw-id="abc12345" class="a">x</p>', 0)).toBe('abc12345');
  });
  it('returns null when absent', () => {
    expect(readMarkerAt('<p class="a">x</p>', 0)).toBeNull();
  });
  it('does not read a marker belonging to a LATER element', () => {
    expect(readMarkerAt('<p>a</p><span data-osw-id="abc12345">b</span>', 0)).toBeNull();
  });
  it('does not read a marker belonging to an EARLIER element', () => {
    const src = '<span data-osw-id="abc12345">a</span><p>b</p>';
    expect(readMarkerAt(src, src.indexOf('<p>'))).toBeNull();
  });
  it('is not fooled by a mustache containing a ">"', () => {
    expect(readMarkerAt('<div {{#if a}}title="x>y"{{/if}}>z</div>', 0)).toBeNull();
  });
  it('does not mistake another attribute\'s VALUE for a marker', () => {
    // The stamp is idempotent on the strength of this read: a false positive here means the
    // element is treated as already marked, and the rule written for it targets nothing.
    expect(readMarkerAt(`<p title=" data-osw-id='fake1234'">x</p>`, 0)).toBeNull();
    expect(readMarkerAt('<p xdata-osw-id="fake1234">x</p>', 0)).toBeNull();
  });
  it('returns null at an index that is not an open tag', () => {
    expect(readMarkerAt('<p data-osw-id="abc12345">x</p>', 4)).toBeNull();
  });
});
