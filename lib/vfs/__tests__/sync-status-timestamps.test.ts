import { describe, it, expect } from 'vitest';
import { calculateItemSyncStatus } from '../sync-types';
import { calculateSyncStatus } from '../auto-sync';
import type { Project } from '../types';

const T1 = new Date('2026-07-30T10:00:00.000Z'); // local edit / server copy
const T2 = new Date('2026-07-30T10:00:05.000Z'); // push completed
const T3 = new Date('2026-07-30T10:00:09.000Z'); // later local edit

function project(overrides: Partial<Project>): Project {
  return {
    id: 'p1',
    name: 'Test',
    createdAt: T1,
    updatedAt: T1,
    settings: {},
    lastSavedCheckpointId: null,
    lastSavedAt: null,
    ...overrides,
  } as Project;
}

describe('calculateItemSyncStatus', () => {
  it('reports synced right after a successful push', () => {
    expect(calculateItemSyncStatus(T1, T1, T2)).toBe('synced');
  });

  it('reports local-newer when a local edit follows the last sync', () => {
    expect(calculateItemSyncStatus(T3, T1, T2)).toBe('local-newer');
  });

  it('reports server-newer when the server moved after the last sync', () => {
    expect(calculateItemSyncStatus(T1, T3, T2)).toBe('server-newer');
  });

  it('reports conflict when both moved after the last sync', () => {
    expect(calculateItemSyncStatus(T3, T3, T2)).toBe('conflict');
  });

  it('reports local-only when the server has no copy', () => {
    expect(calculateItemSyncStatus(T1, null, null)).toBe('local-only');
  });

  // Regression: a project pulled by the orchestrator is written back straight from JSON, so
  // lastSyncedAt lands in IndexedDB as an ISO string. `Date > string` coerces the string to NaN,
  // making every comparison false and reporting 'synced' no matter how far the copies have drifted.
  it('detects local-newer when lastSyncedAt is an ISO string', () => {
    expect(calculateItemSyncStatus(T3, T1, T2.toISOString() as unknown as Date)).toBe('local-newer');
  });

  it('detects server-newer when lastSyncedAt is an ISO string', () => {
    expect(calculateItemSyncStatus(T1, T3, T2.toISOString() as unknown as Date)).toBe('server-newer');
  });

  it('detects conflict when every timestamp is an ISO string', () => {
    expect(
      calculateItemSyncStatus(
        T3.toISOString() as unknown as Date,
        T3.toISOString() as unknown as Date,
        T2.toISOString() as unknown as Date,
      ),
    ).toBe('conflict');
  });

  it('treats an unparseable timestamp as absent rather than as a drift signal', () => {
    expect(calculateItemSyncStatus(T1, T1, 'not-a-date' as unknown as Date)).toBe('synced');
  });
});

describe('calculateSyncStatus', () => {
  it('reports synced right after a successful push', () => {
    expect(calculateSyncStatus(project({ updatedAt: T1, lastSyncedAt: T2 }), T1).status).toBe('synced');
  });

  it('detects server-newer when lastSyncedAt is an ISO string', () => {
    const p = project({ updatedAt: T1, lastSyncedAt: T2.toISOString() as unknown as Date });
    expect(calculateSyncStatus(p, T3).status).toBe('server-newer');
  });

  it('detects local-newer when lastSyncedAt is an ISO string', () => {
    const p = project({ updatedAt: T3, lastSyncedAt: T2.toISOString() as unknown as Date });
    expect(calculateSyncStatus(p, T1).status).toBe('local-newer');
  });
});
