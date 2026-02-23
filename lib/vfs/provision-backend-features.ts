import { BackendFeatures } from '@/lib/vfs/types';
import { vfs } from '@/lib/vfs';
import { applyProjectDatabaseSchema } from '@/components/project-backend/schema-editor';

export interface ProvisionResult {
  edgeFunctions: number;
  serverFunctions: number;
  secrets: number;
  hasDatabaseSchema: boolean;
}

/**
 * Provisions backend features (edge functions, server functions, secrets, database schema)
 * into a project's storage adapter. Used by both project-manager and template-manager
 * when creating projects from templates that include backend features.
 */
export async function provisionBackendFeatures(
  projectId: string,
  backendFeatures: BackendFeatures
): Promise<ProvisionResult> {
  const adapter = vfs.getStorageAdapter();
  const now = new Date();

  let edgeFunctions = 0;
  let serverFunctions = 0;
  let secrets = 0;
  let hasDatabaseSchema = false;

  if (backendFeatures.edgeFunctions && adapter.createEdgeFunction) {
    for (const fn of backendFeatures.edgeFunctions) {
      await adapter.createEdgeFunction({
        ...fn,
        id: crypto.randomUUID(),
        projectId,
        enabled: fn.enabled ?? true,
        method: fn.method ?? 'GET',
        timeoutMs: fn.timeoutMs ?? 10000,
        createdAt: now,
        updatedAt: now,
      });
      edgeFunctions++;
    }
  }

  if (backendFeatures.serverFunctions && adapter.createServerFunction) {
    for (const fn of backendFeatures.serverFunctions) {
      await adapter.createServerFunction({
        ...fn,
        id: crypto.randomUUID(),
        projectId,
        enabled: fn.enabled ?? true,
        createdAt: now,
        updatedAt: now,
      });
      serverFunctions++;
    }
  }

  if (backendFeatures.secrets && adapter.createSecret) {
    for (const secret of backendFeatures.secrets) {
      await adapter.createSecret({
        ...secret,
        id: crypto.randomUUID(),
        projectId,
        hasValue: false,
        createdAt: now,
        updatedAt: now,
      });
      secrets++;
    }
  }

  if (backendFeatures.databaseSchema) {
    await applyProjectDatabaseSchema(projectId, backendFeatures.databaseSchema);
    hasDatabaseSchema = true;
  }

  return { edgeFunctions, serverFunctions, secrets, hasDatabaseSchema };
}
