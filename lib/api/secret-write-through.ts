/**
 * Keep a deployment's secrets in step with the project it serves.
 *
 * Publishing calls `extractBackendFeatures`, which deletes every secret in the deployment's
 * runtime database and re-provisions from the bound project (backend-feature-extractor.ts). So a
 * secret written only to the runtime database works until the next publish and is then silently
 * replaced by the project's copy. Writing through to the project makes the value survive, and the
 * runtime write alongside it means the change takes effect without waiting for a republish.
 *
 * The project is the source of truth; the runtime copy is a cache of it.
 */
import type { StorageAdapter } from '@/lib/vfs/adapters/types';

interface SecretWrite {
  name: string;
  value?: string;
  description?: string;
  /** Set when the secret is being renamed, so the stored value follows the new name. */
  previousName?: string;
}

/** Upsert a secret onto the project, matching the existing row by name. */
export async function mirrorSecretToProject(
  adapter: StorageAdapter,
  projectId: string,
  secret: SecretWrite
): Promise<void> {
  if (!adapter.listSecrets || !adapter.createSecret || !adapter.updateSecret) return;

  const all = await adapter.listSecrets(projectId);
  const now = new Date();

  // A rename must carry the stored value over rather than stranding it under the old name.
  let carriedValue: string | undefined;
  if (secret.previousName && secret.previousName !== secret.name) {
    const old = all.find((s) => s.name === secret.previousName);
    if (old) {
      carriedValue = old.value;
      if (adapter.deleteSecret) await adapter.deleteSecret(old.id);
    }
  }

  const existing = all.find((s) => s.name === secret.name);
  const incoming = secret.value ?? carriedValue;

  if (existing) {
    await adapter.updateSecret({
      ...existing,
      description: secret.description ?? existing.description,
      // An update that only touches metadata must not blank a stored value.
      value: incoming ?? existing.value,
      hasValue: incoming !== undefined ? incoming.length > 0 : existing.hasValue,
      updatedAt: now,
    });
    return;
  }

  await adapter.createSecret({
    id: crypto.randomUUID(),
    projectId,
    name: secret.name,
    description: secret.description || '',
    value: incoming,
    hasValue: !!incoming,
    createdAt: now,
    updatedAt: now,
  });
}

/** Remove the project's copy of a secret, so a delete is not undone by the next publish. */
export async function removeSecretFromProject(
  adapter: StorageAdapter,
  projectId: string,
  name: string
): Promise<void> {
  if (!adapter.listSecrets || !adapter.deleteSecret) return;
  const existing = (await adapter.listSecrets(projectId)).find((s) => s.name === name);
  if (existing) await adapter.deleteSecret(existing.id);
}
