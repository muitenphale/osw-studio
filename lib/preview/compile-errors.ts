/**
 * Compile Error Accumulator
 *
 * Module-level store for compilation errors (Handlebars and esbuild) detected by VirtualServer.
 * VirtualServer pushes errors during compileProject(); the `build` shell command drains them
 * to give the AI explicit compilation feedback.
 *
 * Errors are collated per compilation: each compileProject() call replaces the
 * previous set so `build` always sees the latest state.
 */

export interface CompileError {
  file: string;
  error: string;
}

let pendingErrors: CompileError[] = [];
let stagingErrors: CompileError[] = [];

/** Tracks whether a compilation has committed since the last drain. */
let hasUndrainedCompilation = false;

/** Tracks whether any VFS file changes happened since the last drain. */
let fileChangesSinceLastDrain = 0;

// Listen for VFS file change events to know whether a compilation is expected.
// Both events trigger preview recompilation (debounced 150ms).
if (typeof window !== 'undefined') {
  window.addEventListener('fileContentChanged', () => { fileChangesSinceLastDrain++; });
  window.addEventListener('filesChanged', () => { fileChangesSinceLastDrain++; });
}

/**
 * Called at the start of compileProject() to begin a fresh error collection.
 */
export function beginCompilation(): void {
  stagingErrors = [];
}

/**
 * Called during compilation when an error is caught.
 * Errors accumulate in staging during a single compilation.
 */
export function pushCompileError(file: string, error: string): void {
  stagingErrors.push({ file, error });
}

/**
 * Called at the end of compileProject() to commit staged errors.
 * Replaces any previous pending errors (only latest compilation matters).
 */
export function commitCompilation(): void {
  pendingErrors = stagingErrors;
  stagingErrors = [];
  hasUndrainedCompilation = true;

  // Notify listeners (console panel, orchestrator sync) about compilation result
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('compilationComplete', {
      detail: {
        errors: [...pendingErrors],
        success: pendingErrors.length === 0,
        timestamp: Date.now(),
      },
    }));
  }
}

/**
 * Called by the `build` shell command to consume accumulated errors.
 * Returns all errors and clears the buffer.
 */
export function drainCompileErrors(): CompileError[] {
  hasUndrainedCompilation = false;
  fileChangesSinceLastDrain = 0;
  const errors = pendingErrors;
  pendingErrors = [];
  return errors;
}

/**
 * Wait for the preview's compilation to finish before draining errors.
 *
 * The preview debounces file changes (150ms) then runs compileProject() which
 * can take 200-500ms for framework projects (esbuild bundling). A fixed delay
 * can't reliably catch these. Instead, we wait for the compilationComplete event
 * dispatched by commitCompilation().
 *
 * Fast path: returns immediately if no file changes occurred since the last drain
 * or if a compilation already committed.
 */
export function waitForCompilation(timeoutMs: number = 2000): Promise<void> {
  // No file changes since last drain → no compilation expected
  if (fileChangesSinceLastDrain === 0) return Promise.resolve();
  // Compilation already committed → errors ready to drain
  if (hasUndrainedCompilation) return Promise.resolve();
  // No window (SSR) → skip
  if (typeof window === 'undefined') return Promise.resolve();

  return new Promise(resolve => {
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('compilationComplete', handler);
    };
    const timer = setTimeout(() => { cleanup(); resolve(); }, timeoutMs);
    const handler = () => { cleanup(); resolve(); };
    window.addEventListener('compilationComplete', handler, { once: true });
  });
}

/**
 * Format drained errors into a message suitable for the LLM.
 */
export function formatCompileErrors(errors: CompileError[]): string {
  const grouped = new Map<string, string[]>();
  for (const { file, error } of errors) {
    const list = grouped.get(file) || [];
    list.push(error);
    grouped.set(file, list);
  }

  const parts: string[] = [];
  for (const [file, errs] of grouped) {
    parts.push(`${file}:\n${errs.map(e => `  - ${e}`).join('\n')}`);
  }

  const hasEsbuildErrors = errors.some(e => e.error.startsWith('[esbuild]'));
  const hasScriptErrors = errors.some(e => e.file === 'script' || e.file.endsWith('.py') || e.file.endsWith('.lua'));
  const prefix = hasScriptErrors
    ? 'Runtime errors detected during script execution. Fix these issues:\n\n'
    : hasEsbuildErrors
      ? 'Build errors detected during compilation. Fix these issues:\n\n'
      : 'The preview detected possible Handlebars template issues after compilation. Verify whether these are still present — they may already be resolved by recent edits:\n\n';

  return `${prefix}${parts.join('\n\n')}`;
}
