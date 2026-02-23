/**
 * API Route for Deployment Thumbnail
 * PUT /api/deployments/[id]/thumbnail - Update deployment preview thumbnail
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

    const deployment = await adapter.getDeployment?.(id);
    if (!deployment) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

    const updatedDeployment = {
      ...deployment,
      previewImage: isClearing ? undefined : previewImage,
      previewUpdatedAt: isClearing ? undefined : new Date(),
      updatedAt: new Date(),
    };

    if (adapter.updateDeployment) {
      await adapter.updateDeployment(updatedDeployment);
    }
    await adapter.close?.();

    return NextResponse.json({
      success: true,
      previewImage: updatedDeployment.previewImage ?? null,
      previewUpdatedAt: updatedDeployment.previewUpdatedAt ?? null,
    });
  } catch (error) {
    console.error('[Deployments API] Error updating deployment thumbnail:', error);
    return NextResponse.json(
      { error: 'Failed to update deployment thumbnail' },
      { status: 500 }
    );
  }
}
