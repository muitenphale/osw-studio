/**
 * Workspace-Scoped Deployment Thumbnail API
 *
 * PUT - Update deployment preview thumbnail
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params);
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

    const deployment = await adapter.getDeployment?.(id);
    if (!deployment) {
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

    return NextResponse.json({
      success: true,
      previewImage: updatedDeployment.previewImage ?? null,
      previewUpdatedAt: updatedDeployment.previewUpdatedAt ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Deployments API] Error updating deployment thumbnail:', error);
    return NextResponse.json(
      { error: 'Failed to update deployment thumbnail' },
      { status: 500 }
    );
  }
}
