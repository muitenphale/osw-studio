import type { SchedulerTask } from './types';
import type { ScheduledFunction, EdgeFunction } from '@/lib/vfs/types';
import type { FunctionRequest } from '@/lib/edge-functions/types';
import type { RuntimeDatabase } from '@/lib/vfs/adapters/runtime-database';
import cronParser from 'cron-parser';

const runningFunctions = new Set<string>();

export function createDeploymentSchedulerTask(): SchedulerTask {
  return {
    type: 'deployment-scheduled-functions',
    execute: executeDeploymentScheduledFunctions,
    enabled: true,
  };
}

export function calculateNextRun(cronExpression: string, timezone: string): Date {
  const interval = cronParser.parseExpression(cronExpression, {
    tz: timezone,
    currentDate: new Date(),
  });
  return interval.next().toDate();
}

async function executeDeploymentScheduledFunctions(): Promise<void> {
  const { listDeploymentIds } = await import('@/lib/vfs/adapters/sqlite-connection');
  const deploymentIds = listDeploymentIds();

  for (const deploymentId of deploymentIds) {
    try {
      await processDeployment(deploymentId);
    } catch (err) {
      console.error(`[Scheduler] Error processing deployment ${deploymentId}:`, err);
    }
  }
}

async function processDeployment(deploymentId: string): Promise<void> {
  const { getSQLiteAdapter } = await import('@/lib/vfs/adapters/server');
  const adapter = getSQLiteAdapter();
  await adapter.init();

  const deploymentDb = adapter.getDeploymentDatabaseForAnalytics(deploymentId);
  if (!deploymentDb) return;

  const dueFunctions = deploymentDb.listDueScheduledFunctions();

  for (const scheduledFn of dueFunctions) {
    const runKey = `${deploymentId}:${scheduledFn.id}`;

    if (runningFunctions.has(runKey)) {
      continue;
    }

    const edgeFn = deploymentDb.getFunction(scheduledFn.functionId);

    if (!edgeFn || !edgeFn.enabled) {
      // Advance nextRunAt even if edge function is missing or disabled
      deploymentDb.updateScheduledFunction(scheduledFn.id, {
        nextRunAt: calculateNextRun(scheduledFn.cronExpression, scheduledFn.timezone),
      });
      continue;
    }

    runningFunctions.add(runKey);

    // Fire-and-forget execution
    executeScheduledFunction(deploymentDb, scheduledFn, edgeFn, runKey)
      .finally(() => {
        runningFunctions.delete(runKey);
      });
  }
}

async function executeScheduledFunction(
  deploymentDb: RuntimeDatabase,
  scheduledFn: ScheduledFunction,
  edgeFn: EdgeFunction,
  runKey: string
): Promise<void> {
  try {
    const request: FunctionRequest = {
      method: 'POST',
      headers: {
        'x-trigger': 'cron',
        'x-schedule-name': scheduledFn.name,
      },
      body: scheduledFn.config,
      path: '/_cron/' + scheduledFn.name,
      params: {},
      query: {},
    };

    const { executeFunction } = await import('@/lib/edge-functions/executor');

    const startTime = Date.now();
    const result = await executeFunction(edgeFn, request, deploymentDb);
    const durationMs = Date.now() - startTime;

    deploymentDb.logFunctionExecution(edgeFn.id, {
      method: 'CRON',
      path: '/_cron/' + scheduledFn.name,
      statusCode: result.response.status,
      durationMs,
      error: result.error,
    });

    deploymentDb.updateScheduledFunction(scheduledFn.id, {
      lastRunAt: new Date(),
      nextRunAt: calculateNextRun(scheduledFn.cronExpression, scheduledFn.timezone),
      lastStatus: result.error ? 'error' : 'success',
      lastError: result.error || undefined,
      lastDurationMs: durationMs,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[Scheduler] Failed to execute ${runKey}:`, errorMessage);

    try {
      deploymentDb.updateScheduledFunction(scheduledFn.id, {
        lastRunAt: new Date(),
        nextRunAt: calculateNextRun(scheduledFn.cronExpression, scheduledFn.timezone),
        lastStatus: 'error',
        lastError: errorMessage,
      });
    } catch (updateErr) {
      console.error(`[Scheduler] Failed to update state for ${runKey}:`, updateErr);
    }
  }
}
