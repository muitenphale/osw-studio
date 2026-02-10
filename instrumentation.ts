export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      // Dynamic imports — avoids bundling SQLite into client
      const { listSiteIds } = await import('@/lib/vfs/adapters/sqlite-connection');
      listSiteIds(); // Verify SQLite is available (throws in browser mode)

      const { Scheduler } = await import('@/lib/scheduler');
      const { createSiteSchedulerTask } = await import('@/lib/scheduler/site-scheduler');

      const scheduler = new Scheduler({ pollIntervalMs: 30000 });
      scheduler.registerTask(createSiteSchedulerTask());
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
