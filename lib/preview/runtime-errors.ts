/**
 * Runtime Error Buffer
 *
 * Accumulates JS runtime errors (uncaught exceptions, console.error calls)
 * captured from the preview iframe via postMessage. The orchestrator drains
 * these between iterations to give the AI feedback, mirroring compile-errors.ts.
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

export function drainRuntimeErrors(): string[] {
  const errors = pending;
  pending = [];
  return [...new Set(errors)];
}

export function formatRuntimeErrors(errors: string[]): string {
  return 'Runtime errors detected in the preview. Fix these issues:\n\n'
    + errors.map(e => `  - ${e}`).join('\n');
}
