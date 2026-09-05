import { describe, it, expect } from 'vitest';
import {
  duplicateHeaderNames,
  headerRowsFrom,
  headersFromRows,
  unusableHeaderNames,
} from '../custom-headers-editor';
import { buildCustomProviderConfig } from '@/lib/llm/providers/custom-providers';

describe('header row round-trip', () => {
  it('rebuilds the same headers a saved provider carried', () => {
    const stored = { 'X-Tenant': 'acme', 'X-Route': 'eu' };
    expect(headersFromRows(headerRowsFrom(stored))).toEqual(stored);
  });

  it('gives each row a distinct id, so removing one does not take another', () => {
    const rows = headerRowsFrom({ 'X-A': '1', 'X-B': '2' });
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it('produces no rows for a provider with none', () => {
    expect(headerRowsFrom(undefined)).toEqual([]);
  });
});

describe('unusableHeaderNames', () => {
  it('names only the rows that can never be sent', () => {
    const rows = headerRowsFrom({ 'X-Tenant': 'acme', Authorization: 'x', Host: 'y' });
    expect(unusableHeaderNames(rows).sort()).toEqual(['Authorization', 'Host']);
  });

  it('does not object to a row still being typed', () => {
    expect(unusableHeaderNames([{ id: '1', name: '', value: '' }])).toEqual([]);
  });
});

describe('editing a custom provider keeps its headers', () => {
  const withHeaders = buildCustomProviderConfig('p', 'P', 'https://api.example.com/v1', true, {
    'X-Tenant': 'acme',
  });

  it('survives a save that only changed another field', () => {
    // The edit drawer rebuilds the whole config, so headers have to be passed back in every time.
    const rows = headerRowsFrom(withHeaders.customHeaders);
    const renamed = buildCustomProviderConfig('p', 'New name', 'https://api.example.com/v1', true, headersFromRows(rows));
    expect(renamed.name).toBe('New name');
    expect(renamed.customHeaders).toEqual({ 'X-Tenant': 'acme' });
  });

  it('drops the field entirely when the last row is removed', () => {
    const cleared = buildCustomProviderConfig('p', 'P', 'https://api.example.com/v1', true, {});
    expect('customHeaders' in cleared).toBe(false);
  });

  it('never stores a reserved name even if one reaches it', () => {
    const cfg = buildCustomProviderConfig('p', 'P', 'https://api.example.com/v1', true, {
      Authorization: 'Bearer x',
      'X-Tenant': 'acme',
    });
    expect(cfg.customHeaders).toEqual({ 'X-Tenant': 'acme' });
  });
});

describe('duplicateHeaderNames', () => {
  const row = (name: string, value = 'x') => ({ id: name, name, value });

  it('names the second claim, not the first', () => {
    expect(duplicateHeaderNames([row('X-Tenant'), row('X-Tenant')])).toEqual(['X-Tenant']);
  });

  it('treats names differing only in case as the same header', () => {
    expect(duplicateHeaderNames([row('X-Tenant'), row('x-tenant')])).toEqual(['x-tenant']);
  });

  it('ignores blank rows still being typed', () => {
    expect(duplicateHeaderNames([row('', ''), row('', '')])).toEqual([]);
  });

  it('says nothing about distinct names', () => {
    expect(duplicateHeaderNames([row('X-A'), row('X-B')])).toEqual([]);
  });

  it('is reported by unusableHeaderNames, so a save is refused', () => {
    expect(unusableHeaderNames([row('X-Tenant'), row('x-tenant')])).toContain('x-tenant');
  });
});
