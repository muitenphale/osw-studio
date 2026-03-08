/**
 * Compile Error Accumulator
 *
 * Module-level store for compilation errors (Handlebars and esbuild) detected by VirtualServer.
 * VirtualServer pushes errors during compileProject(); the orchestrator drains them
 * before the next LLM turn to give the model feedback.
 *
 * Errors are collated per compilation: each compileProject() call replaces the
 * previous set so the orchestrator always sees the latest state.
 */

export interface CompileError {
  file: string;
  error: string;
}

let pendingErrors: CompileError[] = [];
let stagingErrors: CompileError[] = [];

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
}

/**
 * Called by the orchestrator to consume accumulated errors.
 * Returns all errors and clears the buffer.
 */
export function drainCompileErrors(): CompileError[] {
  const errors = pendingErrors;
  pendingErrors = [];
  return errors;
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
  const prefix = hasEsbuildErrors
    ? 'Build errors detected during compilation. Fix these issues:\n\n'
    : 'The preview detected possible Handlebars template issues after compilation. Verify whether these are still present — they may already be resolved by recent edits:\n\n';

  return `${prefix}${parts.join('\n\n')}`;
}
