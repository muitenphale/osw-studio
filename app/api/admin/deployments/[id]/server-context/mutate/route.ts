import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
import { DeploymentDatabase } from '@/lib/vfs/adapters/deployment-database';
import {
  validateEdgeFunctionData,
  validateServerFunctionData,
  validateSecretData,
  validateScheduledFunctionData,
  generateEdgeFunctionFile,
  generateServerFunctionFile,
  generateSecretFile,
  generateScheduledFunctionFile,
} from '@/lib/vfs/server-context';
import cronParser from 'cron-parser';

interface MutationRequest {
  operation: 'update' | 'create' | 'delete';
  path: string;
  content?: string;
}

interface MutationResponse {
  success: boolean;
  error?: string;
  file?: {
    path: string;
    content: string;
    isReadOnly: boolean;
  };
}

/**
 * POST /api/admin/deployments/[id]/server-context/mutate
 * Handles create/update/delete operations on server context files
 *
 * File structure:
 * - /.server/secrets/{NAME}.json - individual secret files (SCREAMING_SNAKE_CASE)
 * - /.server/db/schema.sql - read-only
 * - /.server/edge-functions/{name}.json - individual edge functions
 * - /.server/server-functions/{name}.json - individual server functions
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<MutationResponse>> {
  try {
    await requireAuth();
    const { id: deploymentId } = await context.params;
    const body: MutationRequest = await request.json();
    const { operation, path, content } = body;

    if (!path) {
      return NextResponse.json({ success: false, error: 'Path is required' }, { status: 400 });
    }

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Verify deployment exists
    const deployment = await adapter.getDeployment(deploymentId);
    if (!deployment) {
      return NextResponse.json({ success: false, error: 'Deployment not found' }, { status: 404 });
    }

    const deploymentDb = adapter.getDeploymentDatabaseForAnalytics(deploymentId);
    if (!deploymentDb) {
      return NextResponse.json({ success: false, error: 'Deployment database not available' }, { status: 500 });
    }

    // Handle delete operation
    if (operation === 'delete') {
      return handleDelete(path, deploymentDb);
    }

    // For create/update, content is required
    if (!content) {
      return NextResponse.json({ success: false, error: 'Content is required for create/update' }, { status: 400 });
    }

    // Check for read-only files
    if (path === '/.server/db/schema.sql') {
      return NextResponse.json({ success: false, error: `Cannot modify ${path} - read-only file` }, { status: 400 });
    }

    // Route to appropriate handler based on path
    if (path.startsWith('/.server/secrets/') && path.endsWith('.json')) {
      return handleSecretUpdate(path, content, deploymentDb);
    }

    if (path.startsWith('/.server/edge-functions/') && path.endsWith('.json')) {
      return handleEdgeFunctionUpdate(path, content, deploymentDb);
    }

    if (path.startsWith('/.server/server-functions/') && path.endsWith('.json')) {
      return handleServerFunctionUpdate(path, content, deploymentDb);
    }

    if (path.startsWith('/.server/scheduled-functions/') && path.endsWith('.json')) {
      return handleScheduledFunctionUpdate(path, content, deploymentDb);
    }

    return NextResponse.json({ success: false, error: `Unrecognized server context path: ${path}` }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[API] Server context mutation failed:', error);
    return NextResponse.json(
      { success: false, error: 'Mutation failed' },
      { status: 500 }
    );
  }
}

function handleDelete(path: string, deploymentDb: DeploymentDatabase): NextResponse<MutationResponse> {
  // Handle individual secret file deletion
  if (path.startsWith('/.server/secrets/') && path.endsWith('.json')) {
    const filename = path.split('/').pop()!.replace('.json', '');

    const secret = deploymentDb.getSecretByName(filename);
    if (!secret) {
      return NextResponse.json({ success: false, error: `Secret not found: ${filename}` }, { status: 404 });
    }

    deploymentDb.deleteSecret(secret.id);
    return NextResponse.json({ success: true });
  }

  // Handle edge function deletion
  if (path.startsWith('/.server/edge-functions/') && path.endsWith('.json')) {
    const filename = path.split('/').pop()!.replace('.json', '');

    const fn = deploymentDb.getFunctionByName(filename);
    if (!fn) {
      return NextResponse.json({ success: false, error: `Edge function not found: ${filename}` }, { status: 404 });
    }

    deploymentDb.deleteFunction(fn.id);
    return NextResponse.json({ success: true });
  }

  // Handle server function deletion
  if (path.startsWith('/.server/server-functions/') && path.endsWith('.json')) {
    const filename = path.split('/').pop()!.replace('.json', '');

    const fn = deploymentDb.getServerFunctionByName(filename);
    if (!fn) {
      return NextResponse.json({ success: false, error: `Server function not found: ${filename}` }, { status: 404 });
    }

    deploymentDb.deleteServerFunction(fn.id);
    return NextResponse.json({ success: true });
  }

  // Handle scheduled function deletion
  if (path.startsWith('/.server/scheduled-functions/') && path.endsWith('.json')) {
    const filename = path.split('/').pop()!.replace('.json', '');

    const fn = deploymentDb.getScheduledFunctionByName(filename);
    if (!fn) {
      return NextResponse.json({ success: false, error: `Scheduled function not found: ${filename}` }, { status: 404 });
    }

    deploymentDb.deleteScheduledFunction(fn.id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: `Cannot delete ${path}` }, { status: 400 });
}

/**
 * Handle update to individual secret file /.server/secrets/{NAME}.json
 * Creates or updates a single secret in the database
 */
function handleSecretUpdate(path: string, content: string, deploymentDb: DeploymentDatabase): NextResponse<MutationResponse> {
  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: `Invalid JSON: ${message}` }, { status: 400 });
  }

  // Validate
  const validation = validateSecretData(data);
  if (!validation.valid) {
    return NextResponse.json({ success: false, error: `Validation failed: ${validation.errors.join('; ')}` }, { status: 400 });
  }

  const secretData = data as { name: string; description?: string };

  // Get filename from path
  const filename = path.split('/').pop()!.replace('.json', '');

  // Check if secret exists
  const existingSecret = deploymentDb.getSecretByName(filename);

  if (existingSecret) {
    // Update existing secret
    deploymentDb.updateSecretMetadata(existingSecret.id, {
      name: secretData.name,
      description: secretData.description || ''
    });
  } else {
    // Create new secret placeholder
    deploymentDb.createSecretPlaceholder(secretData.name, secretData.description || '');
  }

  // Get the updated secret
  const updated = deploymentDb.getSecretByName(secretData.name)!;
  const newPath = `/.server/secrets/${secretData.name}.json`;

  return NextResponse.json({
    success: true,
    file: {
      path: newPath,
      content: generateSecretFile(updated),
      isReadOnly: false,
    }
  });
}

function handleEdgeFunctionUpdate(path: string, content: string, deploymentDb: DeploymentDatabase): NextResponse<MutationResponse> {
  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: `Invalid JSON: ${message}` }, { status: 400 });
  }

  // Validate
  const validation = validateEdgeFunctionData(data);
  if (!validation.valid) {
    return NextResponse.json({ success: false, error: `Validation failed: ${validation.errors.join('; ')}` }, { status: 400 });
  }

  const fnData = data as { name: string; method: string; code: string; description?: string; enabled?: boolean; timeoutMs?: number };

  // Get filename from path
  const filename = path.split('/').pop()!.replace('.json', '');

  // Check if function exists
  const existingFn = deploymentDb.getFunctionByName(filename);

  if (existingFn) {
    // Update existing function
    deploymentDb.updateFunction(existingFn.id, {
      name: fnData.name,
      code: fnData.code,
      method: fnData.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY',
      description: fnData.description,
      enabled: fnData.enabled ?? true,
      timeoutMs: fnData.timeoutMs ?? 5000,
    });
  } else {
    // Create new function
    deploymentDb.createFunction({
      name: fnData.name,
      code: fnData.code,
      method: fnData.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY',
      description: fnData.description,
      enabled: fnData.enabled ?? true,
      timeoutMs: fnData.timeoutMs ?? 5000,
    });
  }

  // Get the updated function
  const updated = deploymentDb.getFunctionByName(fnData.name)!;
  const newPath = `/.server/edge-functions/${fnData.name}.json`;

  return NextResponse.json({
    success: true,
    file: {
      path: newPath,
      content: generateEdgeFunctionFile(updated),
      isReadOnly: false,
    }
  });
}

function handleServerFunctionUpdate(path: string, content: string, deploymentDb: DeploymentDatabase): NextResponse<MutationResponse> {
  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: `Invalid JSON: ${message}` }, { status: 400 });
  }

  // Validate
  const validation = validateServerFunctionData(data);
  if (!validation.valid) {
    return NextResponse.json({ success: false, error: `Validation failed: ${validation.errors.join('; ')}` }, { status: 400 });
  }

  const fnData = data as { name: string; code: string; description?: string; enabled?: boolean };

  // Get filename from path
  const filename = path.split('/').pop()!.replace('.json', '');

  // Check if function exists
  const existingFn = deploymentDb.getServerFunctionByName(filename);

  if (existingFn) {
    // Update existing function
    deploymentDb.updateServerFunction(existingFn.id, {
      name: fnData.name,
      code: fnData.code,
      description: fnData.description,
      enabled: fnData.enabled ?? true,
    });
  } else {
    // Create new function
    deploymentDb.createServerFunction({
      name: fnData.name,
      code: fnData.code,
      description: fnData.description,
      enabled: fnData.enabled ?? true,
    });
  }

  // Get the updated function
  const updated = deploymentDb.getServerFunctionByName(fnData.name)!;
  const newPath = `/.server/server-functions/${fnData.name}.json`;

  return NextResponse.json({
    success: true,
    file: {
      path: newPath,
      content: generateServerFunctionFile(updated),
      isReadOnly: false,
    }
  });
}

function handleScheduledFunctionUpdate(path: string, content: string, deploymentDb: DeploymentDatabase): NextResponse<MutationResponse> {
  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: `Invalid JSON: ${message}` }, { status: 400 });
  }

  // Validate
  const validation = validateScheduledFunctionData(data);
  if (!validation.valid) {
    return NextResponse.json({ success: false, error: `Validation failed: ${validation.errors.join('; ')}` }, { status: 400 });
  }

  const fnData = data as { name: string; functionName: string; cronExpression: string; timezone?: string; description?: string; enabled?: boolean; config?: Record<string, unknown> };

  // Validate minimum cron interval (5 minutes)
  try {
    const checkInterval = cronParser.parseExpression(fnData.cronExpression);
    const first = checkInterval.next().toDate().getTime();
    const second = checkInterval.next().toDate().getTime();
    if (second - first < 5 * 60 * 1000 - 1000) {
      return NextResponse.json({ success: false, error: 'Minimum interval is 5 minutes' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid cron expression' }, { status: 400 });
  }

  // Resolve functionName -> functionId
  const edgeFn = deploymentDb.getFunctionByName(fnData.functionName);
  if (!edgeFn) {
    return NextResponse.json({ success: false, error: `Edge function not found: ${fnData.functionName}` }, { status: 400 });
  }

  // Get filename from path to check for existing
  const filename = path.split('/').pop()!.replace('.json', '');
  const existingFn = deploymentDb.getScheduledFunctionByName(filename);

  // Check limit (max 50 per deployment) for new functions
  if (!existingFn) {
    const allScheduled = deploymentDb.listScheduledFunctions();
    if (allScheduled.length >= 50) {
      return NextResponse.json({ success: false, error: 'Maximum of 50 scheduled functions per deployment' }, { status: 400 });
    }
  }

  // Calculate nextRunAt
  let nextRunAt: Date | undefined;
  try {
    const interval = cronParser.parseExpression(fnData.cronExpression, { tz: fnData.timezone || 'UTC', currentDate: new Date() });
    nextRunAt = interval.next().toDate();
  } catch {
    // Leave undefined
  }

  if (existingFn) {
    deploymentDb.updateScheduledFunction(existingFn.id, {
      name: fnData.name,
      functionId: edgeFn.id,
      cronExpression: fnData.cronExpression,
      timezone: fnData.timezone || 'UTC',
      description: fnData.description,
      enabled: fnData.enabled ?? true,
      config: fnData.config || {},
      nextRunAt,
    });
  } else {
    deploymentDb.createScheduledFunction({
      name: fnData.name,
      functionId: edgeFn.id,
      cronExpression: fnData.cronExpression,
      timezone: fnData.timezone || 'UTC',
      description: fnData.description,
      enabled: fnData.enabled ?? true,
      config: fnData.config || {},
      nextRunAt,
    });
  }

  // Get the updated function
  const updated = deploymentDb.getScheduledFunctionByName(fnData.name)!;
  const newPath = `/.server/scheduled-functions/${fnData.name}.json`;

  return NextResponse.json({
    success: true,
    file: {
      path: newPath,
      content: generateScheduledFunctionFile(updated, edgeFn.name),
      isReadOnly: false,
    }
  });
}
