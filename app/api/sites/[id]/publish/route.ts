/**
 * API Route for Publishing Sites
 * POST /api/sites/[id]/publish - Build and publish a site
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildStaticSite } from '@/lib/compiler/static-builder';
import { createServerAdapter } from '@/lib/vfs/adapters/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Build the site
    const result = await buildStaticSite(id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to build site' },
        { status: 500 }
      );
    }

    // Update site metadata after successful build
    const adapter = await createServerAdapter();
    await adapter.init();

    const site = await adapter.getSite?.(id);
    if (site && adapter.updateSite) {
      site.lastPublishedVersion = site.settingsVersion;
      site.publishedAt = new Date();
      site.updatedAt = new Date();
      await adapter.updateSite(site);
    }

    await adapter.close?.();

    return NextResponse.json({
      success: true,
      siteId: result.siteId,
      projectId: result.projectId,
      filesWritten: result.filesWritten,
      outputPath: result.outputPath,
    });
  } catch (error) {
    console.error('[Sites API] Error publishing site:', error);
    return NextResponse.json(
      { error: 'Failed to publish site' },
      { status: 500 }
    );
  }
}
