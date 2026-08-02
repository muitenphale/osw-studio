import type { ShellEnv, ShellResult } from '../types';

/** `sqlite3` — run SQL against a deployment database (Server Mode). */
export async function sqlite3Command(_env: ShellEnv): Promise<ShellResult> {
          // This case is reached when sqlite3 is called without a deploymentId context
          // When deploymentId is available, tool-registry.ts routes the call to the server API
          return {
            stdout: '',
            stderr: `sqlite3: requires Server Mode with a published deployment

  The sqlite3 command requires:
  1. Server Mode (not Browser Mode)
  2. A deployment to be selected and published

  If you are in Server Mode with a published deployment, this error indicates the deployment context is not set.
  Please ensure the deployment is selected in the workspace before using sqlite3.

  Alternative: Use edge functions for database access via db.query() and db.run()`,
            exitCode: 1
          };
}
