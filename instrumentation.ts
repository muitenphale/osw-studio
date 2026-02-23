export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      // Dynamic imports — avoids bundling SQLite into client
      const { listDeploymentIds } = await import('@/lib/vfs/adapters/sqlite-connection');
      listDeploymentIds(); // Verify SQLite is available (throws in browser mode)

      const { Scheduler } = await import('@/lib/scheduler');
      const { createDeploymentSchedulerTask } = await import('@/lib/scheduler/deployment-scheduler');

      const scheduler = new Scheduler({ pollIntervalMs: 30000 });
      scheduler.registerTask(createDeploymentSchedulerTask());
      scheduler.start();
    } catch (err) {
      // Browser mode or SQLite not available — skip
      if (process.env.ADMIN_PASSWORD) {
        // Only log in server mode (ADMIN_PASSWORD indicates server deployment)
        console.warn('[Scheduler] Failed to initialize:', err instanceof Error ? err.message : err);
      }
    }
  }
}
