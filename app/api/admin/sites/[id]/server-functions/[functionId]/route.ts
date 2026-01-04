/**
 * Admin API: Single Server Function Operations
 *
 * GET    /api/admin/sites/[id]/server-functions/[functionId] - Get function details
 * PUT    /api/admin/sites/[id]/server-functions/[functionId] - Update function
 * DELETE /api/admin/sites/[id]/server-functions/[functionId] - Delete function
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
import { validateFunctionCode, validateServerFunctionName } from '@/lib/edge-functions/executor';
import { ServerFunction } from '@/lib/vfs/types';

interface RouteParams {
  params: Promise<{ id: string; functionId: string }>;
}

/**
 * GET - Get server function details
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: siteId, functionId } = await params;

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check site exists and database enabled
    const site = await adapter.getSite?.(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    if (!site.databaseEnabled) {
      return NextResponse.json({ error: 'Site database not enabled' }, { status: 400 });
    }

    const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
    if (!siteDb) {
      return NextResponse.json({ error: 'Site database not available' }, { status: 500 });
    }

    const fn = siteDb.getServerFunction(functionId);
    if (!fn) {
      return NextResponse.json({ error: 'Server function not found' }, { status: 404 });
    }

    return NextResponse.json({ function: fn });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Server Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT - Update server function
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: siteId, functionId } = await params;
    const body = await request.json();

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check site exists and database enabled
    const site = await adapter.getSite?.(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    if (!site.databaseEnabled) {
      return NextResponse.json({ error: 'Site database not enabled' }, { status: 400 });
    }

    const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
    if (!siteDb) {
      return NextResponse.json({ error: 'Site database not available' }, { status: 500 });
    }

    // Check function exists
    const existing = siteDb.getServerFunction(functionId);
    if (!existing) {
      return NextResponse.json({ error: 'Server function not found' }, { status: 404 });
    }

    // Build updates object
    const updates: Partial<ServerFunction> = {};

    // Validate and add name if provided
    if (body.name !== undefined && body.name !== existing.name) {
      const nameError = validateServerFunctionName(body.name);
      if (nameError) {
        return NextResponse.json({ error: nameError }, { status: 400 });
      }
      // Check for duplicate name
      const duplicate = siteDb.getServerFunctionByName(body.name);
      if (duplicate && duplicate.id !== functionId) {
        return NextResponse.json({ error: 'A server function with this name already exists' }, { status: 409 });
      }
      updates.name = body.name;
    }

    // Validate and add code if provided
    if (body.code !== undefined) {
      const codeError = validateFunctionCode(body.code);
      if (codeError) {
        return NextResponse.json({ error: codeError }, { status: 400 });
      }
      updates.code = body.code;
    }

    // Add other fields
    if (body.description !== undefined) {
      updates.description = body.description;
    }

    if (body.enabled !== undefined) {
      updates.enabled = body.enabled;
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      siteDb.updateServerFunction(functionId, updates);
    }

    const fn = siteDb.getServerFunction(functionId);

    return NextResponse.json({ function: fn });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Server Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE - Delete server function
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: siteId, functionId } = await params;

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check site exists and database enabled
    const site = await adapter.getSite?.(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    if (!site.databaseEnabled) {
      return NextResponse.json({ error: 'Site database not enabled' }, { status: 400 });
    }

    const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
    if (!siteDb) {
      return NextResponse.json({ error: 'Site database not available' }, { status: 500 });
    }

    // Check function exists
    const fn = siteDb.getServerFunction(functionId);
    if (!fn) {
      return NextResponse.json({ error: 'Server function not found' }, { status: 404 });
    }

    // Delete the function
    siteDb.deleteServerFunction(functionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Server Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
