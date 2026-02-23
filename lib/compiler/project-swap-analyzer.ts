/**
 * Project Swap Analyzer
 *
 * Compares backend features between the incoming project and
 * a deployment's current runtime.sqlite to detect conflicts.
 *
 * Used when repointing a deployment to a different project.
 */

import 'server-only';

import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
import { RuntimeDatabase } from '@/lib/vfs/adapters/runtime-database';
import type { EdgeFunction, ServerFunction, Secret, ScheduledFunction } from '@/lib/vfs/types';

export interface SwapDiff {
  edgeFunctions: {
    added: string[];
    removed: string[];
    changed: string[];
  };
  serverFunctions: {
    added: string[];
    removed: string[];
    changed: string[];
  };
  secrets: {
    added: string[];
    removed: string[];
    /** Secrets that exist in both old and new project (values may differ) */
    overlapping: string[];
  };
  scheduledFunctions: {
    added: string[];
    removed: string[];
    changed: string[];
  };
  hasConflicts: boolean;
}

function diffByName<T extends { name: string; code?: string; enabled?: boolean }>(
  incoming: T[],
  existing: T[],
): { added: string[]; removed: string[]; changed: string[] } {
  const incomingMap = new Map(incoming.map(item => [item.name, item]));
  const existingMap = new Map(existing.map(item => [item.name, item]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [name, item] of incomingMap) {
    const ex = existingMap.get(name);
    if (!ex) {
      added.push(name);
    } else if ('code' in item && 'code' in ex && item.code !== ex.code) {
      changed.push(name);
    } else if (item.enabled !== ex.enabled) {
      changed.push(name);
    }
  }

  for (const name of existingMap.keys()) {
    if (!incomingMap.has(name)) {
      removed.push(name);
    }
  }

  return { added, removed, changed };
}

/**
 * Analyze the differences between a new project's backend features
 * and a deployment's current runtime database.
 *
 * @param newProjectId - The project to swap to
 * @param deploymentId - The deployment being repointed
 * @returns Structured diff for UI display
 */
export async function analyzeProjectSwap(
  newProjectId: string,
  deploymentId: string,
): Promise<SwapDiff> {
  const adapter = getSQLiteAdapter();
  await adapter.init();

  // Read incoming project's backend features from core SQLite
  const incomingEdge = adapter.listEdgeFunctions
    ? await adapter.listEdgeFunctions(newProjectId)
    : [];
  const incomingServer = adapter.listServerFunctions
    ? await adapter.listServerFunctions(newProjectId)
    : [];
  const incomingSecrets = adapter.listSecrets
    ? await adapter.listSecrets(newProjectId)
    : [];
  const incomingScheduled = adapter.listScheduledFunctions
    ? await adapter.listScheduledFunctions(newProjectId)
    : [];

  // Read existing deployment's runtime features
  let existingEdge: EdgeFunction[] = [];
  let existingServer: ServerFunction[] = [];
  let existingSecrets: Secret[] = [];
  let existingScheduled: ScheduledFunction[] = [];

  try {
    const runtimeDb = new RuntimeDatabase(deploymentId);
    runtimeDb.init();
    existingEdge = runtimeDb.listFunctions();
    existingServer = runtimeDb.listServerFunctions();
    existingSecrets = runtimeDb.listSecrets();
    existingScheduled = runtimeDb.listScheduledFunctions();
  } catch {
    // Runtime database may not exist yet (first deploy)
  }

  const edgeDiff = diffByName(incomingEdge, existingEdge);
  const serverDiff = diffByName(incomingServer, existingServer);
  const scheduledDiff = diffByName(incomingScheduled, existingScheduled);

  // Secrets: track overlapping names (potential value conflicts)
  const incomingSecretNames = new Set(incomingSecrets.map(s => s.name));
  const existingSecretNames = new Set(existingSecrets.map(s => s.name));

  const secretsAdded = [...incomingSecretNames].filter(n => !existingSecretNames.has(n));
  const secretsRemoved = [...existingSecretNames].filter(n => !incomingSecretNames.has(n));
  const secretsOverlapping = [...incomingSecretNames].filter(n => existingSecretNames.has(n));

  const diff: SwapDiff = {
    edgeFunctions: edgeDiff,
    serverFunctions: serverDiff,
    secrets: {
      added: secretsAdded,
      removed: secretsRemoved,
      overlapping: secretsOverlapping,
    },
    scheduledFunctions: scheduledDiff,
    hasConflicts:
      edgeDiff.removed.length > 0 ||
      edgeDiff.changed.length > 0 ||
      serverDiff.removed.length > 0 ||
      serverDiff.changed.length > 0 ||
      secretsRemoved.length > 0 ||
      secretsOverlapping.length > 0 ||
      scheduledDiff.removed.length > 0 ||
      scheduledDiff.changed.length > 0,
  };

  return diff;
}
