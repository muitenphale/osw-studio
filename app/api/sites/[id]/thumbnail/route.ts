/**
 * API Route for Site Thumbnail
 * PUT /api/sites/[id]/thumbnail - Update site preview thumbnail
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { previewImage } = await request.json();

    // Allow null / empty string to clear thumbnail
    const isClearing = previewImage === null || previewImage === '';

    if (!isClearing) {
      if (!previewImage || typeof previewImage !== 'string') {
        return NextResponse.json(
          { error: 'previewImage (base64 data URL) is required' },
          { status: 400 }
        );
      }
      if (!previewImage.startsWith('data:image/')) {
        return NextResponse.json(
          { error: 'previewImage must be a base64 data URL (data:image/...)' },
          { status: 400 }
        );
      }
    }

    const adapter = await createServerAdapter();
    await adapter.init();

    const site = await adapter.getSite?.(id);
    if (!site) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }

    const updatedSite = {
      ...site,
      previewImage: isClearing ? undefined : previewImage,
      previewUpdatedAt: isClearing ? undefined : new Date(),
      updatedAt: new Date(),
    };

    if (adapter.updateSite) {
      await adapter.updateSite(updatedSite);
    }
    await adapter.close?.();

    return NextResponse.json({
      success: true,
      previewImage: updatedSite.previewImage ?? null,
      previewUpdatedAt: updatedSite.previewUpdatedAt ?? null,
    });
  } catch (error) {
    console.error('[Sites API] Error updating site thumbnail:', error);
    return NextResponse.json(
      { error: 'Failed to update site thumbnail' },
      { status: 500 }
    );
  }
}
