import { describe, it, expect } from 'vitest';
import { resolveSelection } from '../resolution';

const payload = (over: Record<string, unknown> = {}) => ({
  domPath: 'html > body > p', tagName: 'p', attributes: {}, outerHTML: '<p>x</p>', ...over,
});

describe('resolveSelection', () => {
  it('resolves a single-instance element to its file and index', () => {
    expect(resolveSelection(payload({ srcAttr: '/index.html:42', instanceCount: 1 })))
      .toEqual({ kind: 'resolved', file: '/index.html', tagStart: 42 });
  });

  it('reports one-to-many when several elements share the source tag', () => {
    expect(resolveSelection(payload({ srcAttr: '/templates/nav.hbs:7', instanceCount: 6 })))
      .toEqual({ kind: 'one-to-many', file: '/templates/nav.hbs', tagStart: 7, instances: 6 });
  });

  it('treats a missing srcAttr as generated, not as an error', () => {
    expect(resolveSelection(payload())).toEqual({ kind: 'unresolvable', reason: 'generated' });
  });

  it('splits on the LAST colon, because a path may contain one', () => {
    expect(resolveSelection(payload({ srcAttr: '/a:b/c.html:99', instanceCount: 1 })))
      .toEqual({ kind: 'resolved', file: '/a:b/c.html', tagStart: 99 });
  });

  it('rejects a malformed srcAttr rather than producing a NaN index', () => {
    for (const bad of ['/index.html', '/index.html:', '/index.html:abc', ':5', '', '/i.html:-1']) {
      expect(resolveSelection(payload({ srcAttr: bad, instanceCount: 1 })).kind,
        `should reject ${JSON.stringify(bad)}`).toBe('unresolvable');
    }
  });

  it('treats an absent instanceCount as one instance', () => {
    expect(resolveSelection(payload({ srcAttr: '/i.html:0' })).kind).toBe('resolved');
  });
});
