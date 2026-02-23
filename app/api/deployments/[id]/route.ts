/**
 * API Routes for Individual Deployment Operations
 * GET /api/deployments/[id] - Get deployment by ID
 * PUT /api/deployments/[id] - Update deployment
 * DELETE /api/deployments/[id] - Delete deployment
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { cleanStaticDeployment } from '@/lib/compiler/static-builder';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const adapter = await createServerAdapter();
    await adapter.init();

    const deployment = await adapter.getDeployment?.(id);

    await adapter.close?.();

    if (!deployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(deployment);
  } catch (error) {
    console.error('[Deployments API] Error getting deployment:', error);
    return NextResponse.json(
      { error: 'Failed to get deployment' },
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

    // Get existing deployment
    const existingDeployment = await adapter.getDeployment?.(id);
    if (!existingDeployment) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

    // Update deployment
    const updatedDeployment = {
      ...existingDeployment,
      ...body,
      id, // Ensure ID doesn't change
      updatedAt: new Date(),
    };

    if (adapter.updateDeployment) {
      await adapter.updateDeployment(updatedDeployment);
    }
    await adapter.close?.();

    return NextResponse.json(updatedDeployment);
  } catch (error) {
    console.error('[Deployments API] Error updating deployment:', error);
    return NextResponse.json(
      { error: 'Failed to update deployment' },
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

    // Check if deployment exists
    const deployment = await adapter.getDeployment?.(id);
    if (!deployment) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

    // Delete deployment from database
    if (adapter.deleteDeployment) {
      await adapter.deleteDeployment(id);
    }
    await adapter.close?.();

    // Clean up static files
    await cleanStaticDeployment(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Deployments API] Error deleting deployment:', error);
    return NextResponse.json(
      { error: 'Failed to delete deployment' },
      { status: 500 }
    );
  }
}
