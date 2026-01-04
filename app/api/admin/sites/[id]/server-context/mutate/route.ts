import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
import { SiteDatabase } from '@/lib/vfs/adapters/site-database';
import {
  validateEdgeFunctionData,
  validateServerFunctionData,
  validateSecretData,
  generateEdgeFunctionFile,
  generateServerFunctionFile,
  generateSecretFile,
} from '@/lib/vfs/server-context';

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
 * POST /api/admin/sites/[id]/server-context/mutate
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
    const { id: siteId } = await context.params;
    const body: MutationRequest = await request.json();
    const { operation, path, content } = body;

    if (!path) {
      return NextResponse.json({ success: false, error: 'Path is required' }, { status: 400 });
    }

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Verify site exists
    const site = await adapter.getSite(siteId);
    if (!site) {
      return NextResponse.json({ success: false, error: 'Site not found' }, { status: 404 });
    }

    const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
    if (!siteDb) {
      return NextResponse.json({ success: false, error: 'Site database not available' }, { status: 500 });
    }

    // Handle delete operation
    if (operation === 'delete') {
      return handleDelete(path, siteDb);
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
      return handleSecretUpdate(path, content, siteDb);
    }

    if (path.startsWith('/.server/edge-functions/') && path.endsWith('.json')) {
      return handleEdgeFunctionUpdate(path, content, siteDb);
    }

    if (path.startsWith('/.server/server-functions/') && path.endsWith('.json')) {
      return handleServerFunctionUpdate(path, content, siteDb);
    }

    return NextResponse.json({ success: false, error: `Unrecognized server context path: ${path}` }, { status: 400 });
  } catch (error) {
    console.error('[API] Server context mutation failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Mutation failed' },
      { status: 500 }
    );
  }
}

function handleDelete(path: string, siteDb: SiteDatabase): NextResponse<MutationResponse> {
  // Handle individual secret file deletion
  if (path.startsWith('/.server/secrets/') && path.endsWith('.json')) {
    const filename = path.split('/').pop()!.replace('.json', '');

    const secret = siteDb.getSecretByName(filename);
    if (!secret) {
      return NextResponse.json({ success: false, error: `Secret not found: ${filename}` }, { status: 404 });
    }

    siteDb.deleteSecret(secret.id);
    return NextResponse.json({ success: true });
  }

  // Handle edge function deletion
  if (path.startsWith('/.server/edge-functions/') && path.endsWith('.json')) {
    const filename = path.split('/').pop()!.replace('.json', '');

    const fn = siteDb.getFunctionByName(filename);
    if (!fn) {
      return NextResponse.json({ success: false, error: `Edge function not found: ${filename}` }, { status: 404 });
    }

    siteDb.deleteFunction(fn.id);
    return NextResponse.json({ success: true });
  }

  // Handle server function deletion
  if (path.startsWith('/.server/server-functions/') && path.endsWith('.json')) {
    const filename = path.split('/').pop()!.replace('.json', '');

    const fn = siteDb.getServerFunctionByName(filename);
    if (!fn) {
      return NextResponse.json({ success: false, error: `Server function not found: ${filename}` }, { status: 404 });
    }

    siteDb.deleteServerFunction(fn.id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: `Cannot delete ${path}` }, { status: 400 });
}

/**
 * Handle update to individual secret file /.server/secrets/{NAME}.json
 * Creates or updates a single secret in the database
 */
function handleSecretUpdate(path: string, content: string, siteDb: SiteDatabase): NextResponse<MutationResponse> {
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
  const existingSecret = siteDb.getSecretByName(filename);

  if (existingSecret) {
    // Update existing secret
    siteDb.updateSecretMetadata(existingSecret.id, {
      name: secretData.name,
      description: secretData.description || ''
    });
  } else {
    // Create new secret placeholder
    siteDb.createSecretPlaceholder(secretData.name, secretData.description || '');
  }

  // Get the updated secret
  const updated = siteDb.getSecretByName(secretData.name)!;
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

function handleEdgeFunctionUpdate(path: string, content: string, siteDb: SiteDatabase): NextResponse<MutationResponse> {
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
  const existingFn = siteDb.getFunctionByName(filename);

  if (existingFn) {
    // Update existing function
    siteDb.updateFunction(existingFn.id, {
      name: fnData.name,
      code: fnData.code,
      method: fnData.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY',
      description: fnData.description,
      enabled: fnData.enabled ?? true,
      timeoutMs: fnData.timeoutMs ?? 5000,
    });
  } else {
    // Create new function
    siteDb.createFunction({
      name: fnData.name,
      code: fnData.code,
      method: fnData.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY',
      description: fnData.description,
      enabled: fnData.enabled ?? true,
      timeoutMs: fnData.timeoutMs ?? 5000,
    });
  }

  // Get the updated function
  const updated = siteDb.getFunctionByName(fnData.name)!;
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

function handleServerFunctionUpdate(path: string, content: string, siteDb: SiteDatabase): NextResponse<MutationResponse> {
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
  const existingFn = siteDb.getServerFunctionByName(filename);

  if (existingFn) {
    // Update existing function
    siteDb.updateServerFunction(existingFn.id, {
      name: fnData.name,
      code: fnData.code,
      description: fnData.description,
      enabled: fnData.enabled ?? true,
    });
  } else {
    // Create new function
    siteDb.createServerFunction({
      name: fnData.name,
      code: fnData.code,
      description: fnData.description,
      enabled: fnData.enabled ?? true,
    });
  }

  // Get the updated function
  const updated = siteDb.getServerFunctionByName(fnData.name)!;
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
