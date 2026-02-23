/**
 * Shell Execute API Route
 *
 * Proxies server-requiring shell commands (like sqlite3) from the browser-side
 * orchestrator to server-side execution.
 *
 * POST /api/shell/execute
 * Body: { deploymentId: string, cmd: string[] }
 * Response: { stdout: string, stderr: string, exitCode: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';

interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * POST - Execute a server-side shell command
 */
export async function POST(request: NextRequest): Promise<NextResponse<ShellResult>> {
  try {
    // Require authentication
    await requireAuth();

    const body = await request.json();
    const { deploymentId, cmd } = body;

    // Validate request
    if (!deploymentId || typeof deploymentId !== 'string') {
      return NextResponse.json({
        stdout: '',
        stderr: 'deploymentId is required',
        exitCode: 1
      }, { status: 400 });
    }

    if (!cmd || !Array.isArray(cmd) || cmd.length === 0) {
      return NextResponse.json({
        stdout: '',
        stderr: 'cmd array is required',
        exitCode: 1
      }, { status: 400 });
    }

    const command = cmd[0];

    // Handle sqlite3 command
    if (command === 'sqlite3') {
      return handleSqlite3(deploymentId, cmd);
    }

    // Unknown server command
    return NextResponse.json({
      stdout: '',
      stderr: `${command}: not supported on server`,
      exitCode: 1
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({
        stdout: '',
        stderr: 'Unauthorized',
        exitCode: 1
      }, { status: 401 });
    }

    console.error('[Shell Execute API] Error:', error);
    return NextResponse.json({
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Server error',
      exitCode: 1
    }, { status: 500 });
  }
}

/**
 * Handle sqlite3 command execution
 */
async function handleSqlite3(deploymentId: string, cmd: string[]): Promise<NextResponse<ShellResult>> {
  try {
    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check deployment exists
    const deployment = await adapter.getDeployment?.(deploymentId);
    if (!deployment) {
      return NextResponse.json({
        stdout: '',
        stderr: 'sqlite3: deployment not found',
        exitCode: 1
      });
    }

    // Get deployment database
    const deploymentDb = adapter.getDeploymentDatabaseForAnalytics(deploymentId);
    if (!deploymentDb) {
      return NextResponse.json({
        stdout: '',
        stderr: 'sqlite3: deployment database not available',
        exitCode: 1
      });
    }

    // Parse sqlite3 arguments
    // cmd = ['sqlite3', '-json', 'SELECT * FROM users']
    // or cmd = ['sqlite3', 'SELECT * FROM users']
    const outputJson = cmd.includes('-json');

    // Find the query - it's the argument that doesn't start with '-'
    // Skip the first element (command name)
    const query = cmd.slice(1).find(arg => !arg.startsWith('-'));

    if (!query) {
      return NextResponse.json({
        stdout: '',
        stderr: 'sqlite3: no query provided',
        exitCode: 1
      });
    }

    // Execute the query using the protected executeUserQuery method
    const result = deploymentDb.executeUserQuery(query);

    if (result.error) {
      return NextResponse.json({
        stdout: '',
        stderr: `sqlite3: ${result.error}`,
        exitCode: 1
      });
    }

    // Format output
    let stdout = '';

    // Detect if this is a SELECT query
    const isSelectQuery = query.trim().toUpperCase().startsWith('SELECT');

    if (outputJson) {
      // JSON output mode - convert to array of objects
      const rows = result.rows.map(row => {
        const obj: Record<string, unknown> = {};
        result.columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        return obj;
      });
      stdout = JSON.stringify(rows, null, 2);
    } else if (result.rows.length > 0) {
      // Has rows - show column headers and data
      if (result.columns.length > 0) {
        stdout = result.columns.join('|') + '\n';
        stdout += result.rows.map(row => row.join('|')).join('\n');
      } else {
        stdout = result.rows.map(row => row.join('|')).join('\n');
      }
    } else if (isSelectQuery) {
      // SELECT with no rows - show that it's empty, not "OK"
      if (result.columns.length > 0) {
        stdout = result.columns.join('|') + '\n(0 rows)';
      } else {
        stdout = '(0 rows)';
      }
    } else if (result.rowsAffected > 0) {
      stdout = `${result.rowsAffected} row(s) affected`;
    } else {
      stdout = 'OK';
    }

    return NextResponse.json({
      stdout,
      stderr: '',
      exitCode: 0
    });

  } catch (error) {
    console.error('[Shell Execute API] sqlite3 error:', error);
    return NextResponse.json({
      stdout: '',
      stderr: `sqlite3: ${error instanceof Error ? error.message : 'execution failed'}`,
      exitCode: 1
    });
  }
}
