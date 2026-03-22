/**
 * Runtime Error Buffer
 *
 * Accumulates JS runtime errors (uncaught exceptions, console.error calls)
 * captured from the preview iframe via postMessage.
 *
 * Errors are NOT injected between orchestrator iterations (they're usually
 * transient — e.g. new JS running against old HTML mid-rewrite). Instead,
 * they're only drained when the AI signals completion (status --complete).
 * The preview clears the buffer on each recompilation so only errors from
 * the latest compilation are present at drain time.
 */

let pending: string[] = [];

export function pushRuntimeError(error: string): void {
  pending.push(error);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('runtimeErrorsChanged', {
      detail: { count: pending.length }
    }));
  }
}

export function peekRuntimeErrors(): string[] {
  return [...new Set(pending)];
}

/**
 * Drain runtime errors, returning deduplicated list and clearing the buffer.
 */
export function drainRuntimeErrors(): string[] {
  const errors = [...new Set(pending)];
  pending = [];
  return errors;
}

/**
 * Clear pending errors. Called by the preview on each recompilation
 * so only errors from the latest compilation are retained.
 */
export function clearRuntimeErrors(): void {
  pending = [];
}

/**
 * Reset all state. Called at the start of each generation
 * so errors from a previous generation don't carry over.
 */
export function resetRuntimeErrors(): void {
  pending = [];
}

export function formatRuntimeErrors(errors: string[]): string {
  return 'Runtime errors detected in the preview. Fix these issues:\n\n'
    + errors.map(e => `  - ${e}`).join('\n');
}
