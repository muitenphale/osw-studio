export interface SchedulerTask {
  type: string;
  execute: () => Promise<void>;
  enabled: boolean;
}

export interface SchedulerOptions {
  pollIntervalMs?: number;              // default 30000
  onError?: (taskType: string, error: Error) => void;
}
