import { describe, it, expect } from 'vitest';
import { sanitizeCustomHeaders, isForbiddenHeaderName } from '@/lib/llm/providers/custom-headers';

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

describe('sanitizeCustomHeaders', () => {
  it('keeps an ordinary tenant or routing header', () => {
    expect(sanitizeCustomHeaders({ 'X-Tenant': 'acme', 'X-Route': 'eu' })).toEqual({
      headers: { 'X-Tenant': 'acme', 'X-Route': 'eu' },
      rejected: [],
    });
  });

  it('returns empty for no input', () => {
    expect(sanitizeCustomHeaders(undefined)).toEqual({ headers: {}, rejected: [] });
  });

  it('trims names and values but keeps the name as written', () => {
    expect(sanitizeCustomHeaders({ '  X-Tenant  ': '  acme  ' }).headers).toEqual({ 'X-Tenant': 'acme' });
  });

  it('ignores a wholly blank row rather than reporting it', () => {
    expect(sanitizeCustomHeaders({ '': '' })).toEqual({ headers: {}, rejected: [] });
  });

  it.each([
    'Authorization', 'authorization',
    'Host', 'Content-Length', 'Content-Type',
    'Cookie', 'Set-Cookie',
    'Connection', 'Keep-Alive', 'TE', 'Trailer', 'Transfer-Encoding', 'Upgrade',
    'Proxy-Authorization', 'Proxy-Connection', 'proxy-anything',
  ])('rejects %s', (name) => {
    const result = sanitizeCustomHeaders({ [name]: 'x' });
    expect(result.headers).toEqual({});
    expect(result.rejected).toEqual([name]);
  });

  it('rejects a name that is not a valid HTTP token', () => {
    // Headers.set throws on these, which would fail the request instead of the field.
    const result = sanitizeCustomHeaders({ 'bad name': 'x' });
    expect(result.headers).toEqual({});
    expect(result.rejected).toEqual(['bad name']);
  });

  it.each([['CR', `a${CR}b`], ['LF', `a${LF}b`], ['NUL', `a${String.fromCharCode(0)}b`]])(
    'rejects a value containing %s, which would split the header',
    (_label, value) => {
      const result = sanitizeCustomHeaders({ 'X-Tenant': value });
      expect(result.headers).toEqual({});
      expect(result.rejected).toEqual(['X-Tenant']);
    },
  );

  it('rejects a name with no value', () => {
    expect(sanitizeCustomHeaders({ 'X-Tenant': '   ' }).rejected).toEqual(['X-Tenant']);
  });

  it('keeps the good rows when only some are refused', () => {
    const result = sanitizeCustomHeaders({ 'X-Tenant': 'acme', Authorization: 'Bearer nope' });
    expect(result.headers).toEqual({ 'X-Tenant': 'acme' });
    expect(result.rejected).toEqual(['Authorization']);
  });

  it('produces only values fetch will accept', () => {
    // The point of the filter: whatever survives can be handed to Headers without throwing.
    const { headers } = sanitizeCustomHeaders({ 'X-Tenant': 'acme', 'bad name': 'x', 'X-Bad': `a${LF}b` });
    expect(() => {
      const h = new Headers();
      for (const [k, v] of Object.entries(headers)) h.set(k, v);
    }).not.toThrow();
  });
});

describe('sanitizeCustomHeaders input shape', () => {
  // Reached from a request body, so the argument is whatever a caller sent, not what the type says.
  it.each([
    ['a string', 'ab'],
    ['an array', ['a', 'b']],
    ['a number', 5],
    ['null', null],
  ])('yields no headers for %s', (_label, input) => {
    expect(sanitizeCustomHeaders(input as never).headers).toEqual({});
  });

  it('does not pollute Object.prototype via __proto__', () => {
    sanitizeCustomHeaders(JSON.parse('{"__proto__":{"polluted":true},"X-A":"ok"}'));
    expect((({}) as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('sanitizeCustomHeaders duplicates', () => {
  it('keeps the first of two names differing only in case', () => {
    // fetch lowercases names, so the later would otherwise silently replace the earlier.
    const result = sanitizeCustomHeaders({ 'X-Tenant': 'first', 'x-tenant': 'second' });
    expect(result.headers).toEqual({ 'X-Tenant': 'first' });
    expect(result.rejected).toEqual(['x-tenant']);
  });

  it('leaves distinct names alone', () => {
    expect(sanitizeCustomHeaders({ 'X-A': '1', 'X-B': '2' }).rejected).toEqual([]);
  });
});

describe('isForbiddenHeaderName', () => {
  it('flags a reserved name', () => {
    expect(isForbiddenHeaderName('Authorization')).toBe(true);
    expect(isForbiddenHeaderName('proxy-foo')).toBe(true);
  });

  it('does not flag an ordinary one, or an empty field still being typed', () => {
    expect(isForbiddenHeaderName('X-Tenant')).toBe(false);
    expect(isForbiddenHeaderName('  ')).toBe(false);
  });
});
