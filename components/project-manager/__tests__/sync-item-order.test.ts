import { describe, it, expect } from 'vitest';
import { sortSyncItems } from '../sync-item-order';

describe('sortSyncItems', () => {
  it('puts conflicts first so they are not buried under synced rows', () => {
    const items = [
      { name: 'Zebra', status: 'synced' as const },
      { name: 'Alpha', status: 'conflict' as const },
      { name: 'Beta', status: 'local-newer' as const },
    ];
    expect(sortSyncItems(items).map((i) => i.name)).toEqual(['Alpha', 'Beta', 'Zebra']);
  });
});
