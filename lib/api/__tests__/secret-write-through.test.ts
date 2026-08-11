import { describe, it, expect } from 'vitest';
import { mirrorSecretToProject, removeSecretFromProject } from '@/lib/api/secret-write-through';
import type { Secret } from '@/lib/vfs/types';

/**
 * Publishing deletes every secret in a deployment's runtime database and re-provisions from the
 * bound project. A secret set through the deployment's own panel therefore worked until the next
 * publish and was then replaced by the project's copy, which is what "the key doesn't stick" was.
 * These pin the write-through that makes the project, not the runtime copy, the source of truth.
 */
function fakeAdapter(seed: Partial<Secret>[] = []) {
  const rows: Secret[] = seed.map((s, i) => ({
    id: s.id ?? `id-${i}`, projectId: 'p1', name: s.name!, description: s.description ?? '',
    value: s.value, hasValue: s.hasValue ?? !!s.value,
    createdAt: new Date(), updatedAt: new Date(),
  }));
  return {
    rows,
    async listSecrets() { return rows; },
    async createSecret(s: Secret) { rows.push(s); },
    async updateSecret(s: Secret) { rows[rows.findIndex((r) => r.id === s.id)] = s; },
    async deleteSecret(id: string) { rows.splice(rows.findIndex((r) => r.id === id), 1); },
  };
}

describe('mirroring a deployment secret onto its project', () => {
  it('creates the project copy when there is none', async () => {
    const a = fakeAdapter();
    await mirrorSecretToProject(a as never, 'p1', { name: 'AI_API_KEY', value: 'sk-new' });
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]).toMatchObject({ name: 'AI_API_KEY', value: 'sk-new', hasValue: true });
  });

  it('overwrites the placeholder a template provisioned', async () => {
    // The exact reported case: the template seeds an empty AI_API_KEY, so publish kept restoring it.
    const a = fakeAdapter([{ name: 'AI_API_KEY', hasValue: false }]);
    await mirrorSecretToProject(a as never, 'p1', { name: 'AI_API_KEY', value: 'sk-new' });
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]).toMatchObject({ value: 'sk-new', hasValue: true });
  });

  it('does not blank a stored value when only metadata changes', async () => {
    const a = fakeAdapter([{ name: 'AI_API_KEY', value: 'sk-keep' }]);
    await mirrorSecretToProject(a as never, 'p1', { name: 'AI_API_KEY', description: 'the key' });
    expect(a.rows[0]).toMatchObject({ value: 'sk-keep', hasValue: true, description: 'the key' });
  });

  it('carries the value across a rename instead of stranding it', async () => {
    const a = fakeAdapter([{ name: 'OLD_KEY', value: 'sk-keep' }]);
    await mirrorSecretToProject(a as never, 'p1', { name: 'NEW_KEY', previousName: 'OLD_KEY' });
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]).toMatchObject({ name: 'NEW_KEY', value: 'sk-keep', hasValue: true });
  });

  it('removes the project copy on delete, so publish does not resurrect it', async () => {
    const a = fakeAdapter([{ name: 'AI_API_KEY', value: 'sk-old' }]);
    await removeSecretFromProject(a as never, 'p1', 'AI_API_KEY');
    expect(a.rows).toHaveLength(0);
  });

  it('leaves unrelated secrets alone', async () => {
    const a = fakeAdapter([{ name: 'OTHER', value: 'keep-me' }]);
    await mirrorSecretToProject(a as never, 'p1', { name: 'AI_API_KEY', value: 'sk-new' });
    expect(a.rows.find((r) => r.name === 'OTHER')).toMatchObject({ value: 'keep-me' });
  });
});
