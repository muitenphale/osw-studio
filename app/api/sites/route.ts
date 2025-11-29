/**
 * API Routes for Sites (published versions of projects)
 * GET /api/sites - List all sites
 * POST /api/sites - Create a new site
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { Site } from '@/lib/vfs/types';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  try {
    const adapter = await createServerAdapter();
    await adapter.init();

    const sites = await adapter.listSites?.() || [];

    await adapter.close?.();

    return NextResponse.json(sites);
  } catch (error) {
    console.error('[Sites API] ❌ Error listing sites:', error);
    return NextResponse.json(
      { error: 'Failed to list sites' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, name, slug } = body;

    if (!projectId || !name) {
      return NextResponse.json(
        { error: 'projectId and name are required' },
        { status: 400 }
      );
    }

    const adapter = await createServerAdapter();
    await adapter.init();

    // Check if project exists
    const project = await adapter.getProject(projectId);
    if (!project) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Create new site
    const site: Site = {
      id: uuidv4(),
      projectId,
      name,
      slug: slug || undefined,
      enabled: false,
      underConstruction: false,
      headScripts: [],
      bodyScripts: [],
      cdnLinks: [],
      analytics: {
        enabled: false,
        provider: 'builtin',
        privacyMode: true,
      },
      seo: {},
      compliance: {
        enabled: false,
        bannerPosition: 'bottom' as const,
        bannerStyle: 'bar' as const,
        message: '',
        acceptButtonText: 'Accept',
        declineButtonText: 'Decline',
        mode: 'opt-in' as const,
        blockAnalytics: true,
      },
      settingsVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (adapter.createSite) {
      await adapter.createSite(site);
    }
    await adapter.close?.();

    return NextResponse.json(site, { status: 201 });
  } catch (error) {
    console.error('[Sites API] Error creating site:', error);
    return NextResponse.json(
      { error: 'Failed to create site' },
      { status: 500 }
    );
  }
}
