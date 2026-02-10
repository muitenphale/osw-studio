import type { SchedulerTask, SchedulerOptions } from './types';

let handlersRegistered = false;

export class Scheduler {
  private tasks: SchedulerTask[] = [];
  private running = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private pollIntervalMs: number;
  private onError?: (taskType: string, error: Error) => void;

  constructor(options: SchedulerOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 30000;
    this.onError = options.onError;
  }

  registerTask(task: SchedulerTask): void {
    this.tasks.push(task);
  }

  start(): void {
    this.running = true;

    if (!handlersRegistered) {
      handlersRegistered = true;
      process.once('SIGTERM', () => this.stop());
      process.once('SIGINT', () => this.stop());
    }

    // First poll after 5s delay
    this.timeoutId = setTimeout(() => {
      if (!this.running) return;
      this.poll();
      this.intervalId = setInterval(() => this.poll(), this.pollIntervalMs);
    }, 5000);
  }

  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    for (const task of this.tasks) {
      if (!task.enabled) continue;
      try {
        await task.execute();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (this.onError) {
          this.onError(task.type, error);
        } else {
          console.error(`[Scheduler] Task "${task.type}" failed:`, error);
        }
      }
    }
  }
}
