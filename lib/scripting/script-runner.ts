import { vfs } from '@/lib/vfs';
import { logger } from '@/lib/utils';
import { beginCompilation, pushCompileError, commitCompilation } from '@/lib/preview/compile-errors';
import type { ScriptRuntime, ScriptWorkerResponse } from './types';

type OutputListener = (msg: ScriptWorkerResponse) => void;

const EXECUTION_TIMEOUT_MS = 30_000;

class ScriptRunner {
  private worker: Worker | null = null;
  private running = false;
  private listeners = new Set<OutputListener>();
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  /**
   * Execute a script project.
   * Gathers text files from VFS and sends them to the worker.
   * If already running, aborts the previous execution first.
   */
  async execute(projectId: string, runtime: ScriptRuntime, entryPoint: string): Promise<void> {
    // Abort any running execution
    if (this.running) {
      this.abort();
    }

    // Ensure worker is created
    if (!this.worker) {
      try {
        this.worker = new Worker('/workers/script-worker.js');
      } catch (err) {
        this.emit({ type: 'error', data: 'Failed to create worker: ' + String(err) });
        return;
      }
      this.worker.onmessage = (event: MessageEvent<ScriptWorkerResponse>) => {
        this.handleWorkerMessage(event.data);
      };
      this.worker.onerror = (event) => {
        this.emit({ type: 'error', data: 'Worker error: ' + (event.message || 'Unknown error') });
        this.running = false;
        this.clearTimeout();
      };
    }

    // Gather VFS files
    await vfs.init();
    const allFiles = await vfs.listFiles(projectId);
    const files: Record<string, string> = {};

    for (const file of allFiles) {
      if (typeof file.content === 'string') {
        files[file.path] = file.content;
      }
    }

    // Begin error tracking
    beginCompilation();

    this.running = true;
    this.emit({ type: 'status', data: `Running ${runtime === 'python' ? 'Python' : 'Lua'} script...` });

    // Set execution timeout
    this.timeoutId = setTimeout(() => {
      if (this.running) {
        this.emit({ type: 'error', data: `Script execution timed out after ${EXECUTION_TIMEOUT_MS / 1000} seconds` });
        pushCompileError(entryPoint, `Execution timed out after ${EXECUTION_TIMEOUT_MS / 1000}s — possible infinite loop`);
        commitCompilation();
        this.abort();
      }
    }, EXECUTION_TIMEOUT_MS);

    // Send execution request
    const payload = { runtime, entryPoint, files };
    this.worker.postMessage({ type: 'execute', payload });
  }

  /**
   * Abort the current execution by terminating the worker.
   */
  abort(): void {
    this.clearTimeout();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.running = false;
  }

  /**
   * Subscribe to output messages from the worker.
   * Returns an unsubscribe function.
   */
  onOutput(listener: OutputListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Clean up worker and all listeners.
   */
  dispose(): void {
    this.abort();
    this.listeners.clear();
  }

  private handleWorkerMessage(msg: ScriptWorkerResponse): void {
    if (msg.type === 'complete') {
      this.running = false;
      this.clearTimeout();
      commitCompilation();
    }

    if (msg.type === 'error' || msg.type === 'stderr') {
      // Push to compile error pipeline so the orchestrator picks it up
      const errorData = msg.data;
      if (errorData && errorData.trim()) {
        pushCompileError('script', errorData);
      }
    }

    this.emit(msg);
  }

  private emit(msg: ScriptWorkerResponse): void {
    for (const listener of this.listeners) {
      try {
        listener(msg);
      } catch (err) {
        logger.error('Script output listener error:', err);
      }
    }
  }

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}

export const scriptRunner = new ScriptRunner();
