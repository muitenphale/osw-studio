/**
 * API Routes for Individual Site Operations
 * GET /api/sites/[id] - Get site by ID
 * PUT /api/sites/[id] - Update site
 * DELETE /api/sites/[id] - Delete site
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { cleanStaticSite } from '@/lib/compiler/static-builder';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const adapter = await createServerAdapter();
    await adapter.init();

    const site = await adapter.getSite?.(id);

    await adapter.close?.();

    if (!site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(site);
  } catch (error) {
    console.error('[Sites API] Error getting site:', error);
    return NextResponse.json(
      { error: 'Failed to get site' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const adapter = await createServerAdapter();
    await adapter.init();

    // Get existing site
    const existingSite = await adapter.getSite?.(id);
    if (!existingSite) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }

    // Update site
    const updatedSite = {
      ...existingSite,
      ...body,
      id, // Ensure ID doesn't change
      updatedAt: new Date(),
    };

    if (adapter.updateSite) {
      await adapter.updateSite(updatedSite);
    }
    await adapter.close?.();

    return NextResponse.json(updatedSite);
  } catch (error) {
    console.error('[Sites API] Error updating site:', error);
    return NextResponse.json(
      { error: 'Failed to update site' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const adapter = await createServerAdapter();
    await adapter.init();

    // Check if site exists
    const site = await adapter.getSite?.(id);
    if (!site) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }

    // Delete site from database
    if (adapter.deleteSite) {
      await adapter.deleteSite(id);
    }
    await adapter.close?.();

    // Clean up static files
    await cleanStaticSite(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Sites API] Error deleting site:', error);
    return NextResponse.json(
      { error: 'Failed to delete site' },
      { status: 500 }
    );
  }
}
