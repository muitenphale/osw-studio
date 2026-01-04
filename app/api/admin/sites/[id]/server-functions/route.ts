/**
 * Admin API: Server Functions Management
 *
 * GET  /api/admin/sites/[id]/server-functions - List all server functions
 * POST /api/admin/sites/[id]/server-functions - Create a new server function
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
import { validateFunctionCode, validateServerFunctionName } from '@/lib/edge-functions/executor';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET - List all server functions for a site
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: siteId } = await params;

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check site exists
    const site = await adapter.getSite?.(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Check database is enabled
    if (!site.databaseEnabled) {
      return NextResponse.json({ error: 'Site database not enabled' }, { status: 400 });
    }

    const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
    if (!siteDb) {
      return NextResponse.json({ error: 'Site database not available' }, { status: 500 });
    }

    const functions = siteDb.listServerFunctions();

    return NextResponse.json({ functions });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Server Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST - Create a new server function
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: siteId } = await params;
    const body = await request.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json({ error: 'Function name is required' }, { status: 400 });
    }
    if (!body.code) {
      return NextResponse.json({ error: 'Function code is required' }, { status: 400 });
    }

    // Validate name (uses JS identifier validation, not URL-safe)
    const nameError = validateServerFunctionName(body.name);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

    // Validate code
    const codeError = validateFunctionCode(body.code);
    if (codeError) {
      return NextResponse.json({ error: codeError }, { status: 400 });
    }

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check site exists
    const site = await adapter.getSite?.(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Enable database if not already enabled
    if (!site.databaseEnabled) {
      site.databaseEnabled = true;
      await adapter.enableSiteDatabase(siteId);
      await adapter.updateSite?.(site);
    }

    const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
    if (!siteDb) {
      return NextResponse.json({ error: 'Site database not available' }, { status: 500 });
    }

    // Check for duplicate name
    const existing = siteDb.getServerFunctionByName(body.name);
    if (existing) {
      return NextResponse.json({ error: 'A server function with this name already exists' }, { status: 409 });
    }

    // Create the function
    const id = siteDb.createServerFunction({
      name: body.name,
      description: body.description || undefined,
      code: body.code,
      enabled: body.enabled !== false,
    });

    const fn = siteDb.getServerFunction(id);

    return NextResponse.json({ function: fn }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Server Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
