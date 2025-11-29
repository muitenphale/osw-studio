/**
 * API Route for Site Settings
 * GET /api/sites/[id]/settings - Get site settings
 * PUT /api/sites/[id]/settings - Update site settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { buildStaticSite } from '@/lib/compiler/static-builder';

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

    // Return only settings-related fields
    const settings = {
      enabled: site.enabled,
      underConstruction: site.underConstruction,
      customDomain: site.customDomain,
      headScripts: site.headScripts,
      bodyScripts: site.bodyScripts,
      cdnLinks: site.cdnLinks,
      analytics: site.analytics,
      seo: site.seo,
      compliance: site.compliance,
      settingsVersion: site.settingsVersion,
      lastPublishedVersion: site.lastPublishedVersion,
    };

    return NextResponse.json(settings);
  } catch (error) {
    console.error('[Sites API] Error getting site settings:', error);
    return NextResponse.json(
      { error: 'Failed to get site settings' },
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

    // Update site with new settings and increment version
    const updatedSite = {
      ...existingSite,
      enabled: body.enabled ?? existingSite.enabled,
      underConstruction: body.underConstruction ?? existingSite.underConstruction,
      customDomain: body.customDomain ?? existingSite.customDomain,
      headScripts: body.headScripts ?? existingSite.headScripts,
      bodyScripts: body.bodyScripts ?? existingSite.bodyScripts,
      cdnLinks: body.cdnLinks ?? existingSite.cdnLinks,
      analytics: body.analytics ?? existingSite.analytics,
      seo: body.seo ?? existingSite.seo,
      compliance: body.compliance ?? existingSite.compliance,
      settingsVersion: existingSite.settingsVersion + 1,
      updatedAt: new Date(),
    };

    if (adapter.updateSite) {
      await adapter.updateSite(updatedSite);
    }
    await adapter.close?.();

    // Return updated settings (lastPublishedVersion unchanged until publish)
    const settings = {
      enabled: updatedSite.enabled,
      underConstruction: updatedSite.underConstruction,
      customDomain: updatedSite.customDomain,
      headScripts: updatedSite.headScripts,
      bodyScripts: updatedSite.bodyScripts,
      cdnLinks: updatedSite.cdnLinks,
      analytics: updatedSite.analytics,
      seo: updatedSite.seo,
      compliance: updatedSite.compliance,
      settingsVersion: updatedSite.settingsVersion,
      lastPublishedVersion: existingSite.lastPublishedVersion, // Unchanged until publish
    };

    return NextResponse.json(settings);
  } catch (error) {
    console.error('[Sites API] Error updating site settings:', error);
    return NextResponse.json(
      { error: 'Failed to update site settings' },
      { status: 500 }
    );
  }
}
