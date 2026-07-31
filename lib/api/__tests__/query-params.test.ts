import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { readIntParam } from '../query-params';

const opts = { fallback: 100, min: 1, max: 1000 };
const params = (qs: string) => new URLSearchParams(qs);

describe('readIntParam', () => {
  it('reads a valid value', () => {
    expect(readIntParam(params('limit=250'), 'limit', opts)).toBe(250);
  });

  it('falls back when the parameter is absent', () => {
    expect(readIntParam(params(''), 'limit', opts)).toBe(100);
  });

  // NaN survives Math.min and Math.max unchanged, so an unguarded parse reached the database as a
  // bind parameter and failed the request.
  it.each(['limit=abc', 'limit=', 'limit=NaN', 'limit=%20'])('falls back for %s', (qs) => {
    expect(readIntParam(params(qs), 'limit', opts)).toBe(100);
  });

  it('clamps to the allowed range', () => {
    expect(readIntParam(params('limit=99999'), 'limit', opts)).toBe(1000);
    expect(readIntParam(params('limit=0'), 'limit', opts)).toBe(1);
    expect(readIntParam(params('limit=-5'), 'limit', opts)).toBe(1);
  });

  it('takes the leading integer of a mixed value, as parseInt does', () => {
    expect(readIntParam(params('limit=50abc'), 'limit', opts)).toBe(50);
  });
});
