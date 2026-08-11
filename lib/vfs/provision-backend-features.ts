import { BackendFeatures } from '@/lib/vfs/types';
import { vfs } from '@/lib/vfs';
import { applyProjectDatabaseSchema } from './project-schema';

export interface ProvisionResult {
  edgeFunctions: number;
  serverFunctions: number;
  secrets: number;
  scheduledFunctions: number;
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
  let scheduledFunctions = 0;
  let hasDatabaseSchema = false;

  /** Edge function ids by name, so a schedule can be linked to the function it just created. */
  const edgeFunctionIds = new Map<string, string>();

  if (backendFeatures.edgeFunctions && adapter.createEdgeFunction) {
    for (const fn of backendFeatures.edgeFunctions) {
      const id = crypto.randomUUID();
      await adapter.createEdgeFunction({
        ...fn,
        id,
        projectId,
        enabled: fn.enabled ?? true,
        method: fn.method ?? 'GET',
        timeoutMs: fn.timeoutMs ?? 10000,
        createdAt: now,
        updatedAt: now,
      });
      edgeFunctionIds.set(fn.name, id);
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

  // After the edge functions, which a schedule links to by name. A schedule naming a function the
  // template does not define is skipped rather than written with a dangling id: the runtime looks
  // its target up by id, so a broken link would surface as a schedule that silently never fires.
  if (backendFeatures.scheduledFunctions && adapter.createScheduledFunction) {
    for (const fn of backendFeatures.scheduledFunctions) {
      const functionId = edgeFunctionIds.get(fn.functionName);
      if (!functionId) continue;
      await adapter.createScheduledFunction({
        id: crypto.randomUUID(),
        projectId,
        name: fn.name,
        description: fn.description,
        functionId,
        cronExpression: fn.cronExpression,
        timezone: fn.timezone ?? 'UTC',
        config: fn.config ?? {},
        enabled: fn.enabled ?? true,
        createdAt: now,
        updatedAt: now,
      });
      scheduledFunctions++;
    }
  }

  if (backendFeatures.databaseSchema) {
    await applyProjectDatabaseSchema(projectId, backendFeatures.databaseSchema);
    hasDatabaseSchema = true;
  }

  return { edgeFunctions, serverFunctions, secrets, scheduledFunctions, hasDatabaseSchema };
}
