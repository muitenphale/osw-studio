import type { SchedulerTask } from './types';
import type { ScheduledFunction, EdgeFunction } from '@/lib/vfs/types';
import type { FunctionRequest } from '@/lib/edge-functions/types';
import type { SiteDatabase } from '@/lib/vfs/adapters/site-database';
import cronParser from 'cron-parser';

const runningFunctions = new Set<string>();

export function createSiteSchedulerTask(): SchedulerTask {
  return {
    type: 'site-scheduled-functions',
    execute: executeSiteScheduledFunctions,
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

async function executeSiteScheduledFunctions(): Promise<void> {
  const { listSiteIds } = await import('@/lib/vfs/adapters/sqlite-connection');
  const siteIds = listSiteIds();

  for (const siteId of siteIds) {
    try {
      await processSite(siteId);
    } catch (err) {
      console.error(`[Scheduler] Error processing site ${siteId}:`, err);
    }
  }
}

async function processSite(siteId: string): Promise<void> {
  const { getSQLiteAdapter } = await import('@/lib/vfs/adapters/server');
  const adapter = getSQLiteAdapter();
  await adapter.init();

  const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
  if (!siteDb) return;

  const dueFunctions = siteDb.listDueScheduledFunctions();

  for (const scheduledFn of dueFunctions) {
    const runKey = `${siteId}:${scheduledFn.id}`;

    if (runningFunctions.has(runKey)) {
      continue;
    }

    const edgeFn = siteDb.getFunction(scheduledFn.functionId);

    if (!edgeFn || !edgeFn.enabled) {
      // Advance nextRunAt even if edge function is missing or disabled
      siteDb.updateScheduledFunction(scheduledFn.id, {
        nextRunAt: calculateNextRun(scheduledFn.cronExpression, scheduledFn.timezone),
      });
      continue;
    }

    runningFunctions.add(runKey);

    // Fire-and-forget execution
    executeScheduledFunction(siteDb, scheduledFn, edgeFn, runKey)
      .finally(() => {
        runningFunctions.delete(runKey);
      });
  }
}

async function executeScheduledFunction(
  siteDb: SiteDatabase,
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
    const result = await executeFunction(edgeFn, request, siteDb);
    const durationMs = Date.now() - startTime;

    siteDb.logFunctionExecution(edgeFn.id, {
      method: 'CRON',
      path: '/_cron/' + scheduledFn.name,
      statusCode: result.response.status,
      durationMs,
      error: result.error,
    });

    siteDb.updateScheduledFunction(scheduledFn.id, {
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
      siteDb.updateScheduledFunction(scheduledFn.id, {
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
