/**
 * API Route for Deployment Settings
 * GET /api/deployments/[id]/settings - Get deployment settings
 * PUT /api/deployments/[id]/settings - Update deployment settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { buildStaticDeployment } from '@/lib/compiler/static-builder';

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

    // Return only settings-related fields
    const settings = {
      enabled: deployment.enabled,
      underConstruction: deployment.underConstruction,
      customDomain: deployment.customDomain,
      headScripts: deployment.headScripts,
      bodyScripts: deployment.bodyScripts,
      cdnLinks: deployment.cdnLinks,
      analytics: deployment.analytics,
      seo: deployment.seo,
      compliance: deployment.compliance,
      settingsVersion: deployment.settingsVersion,
      lastPublishedVersion: deployment.lastPublishedVersion,
    };

    return NextResponse.json(settings);
  } catch (error) {
    console.error('[Deployments API] Error getting deployment settings:', error);
    return NextResponse.json(
      { error: 'Failed to get deployment settings' },
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

    // Update deployment with new settings and increment version
    const updatedDeployment = {
      ...existingDeployment,
      enabled: body.enabled ?? existingDeployment.enabled,
      underConstruction: body.underConstruction ?? existingDeployment.underConstruction,
      customDomain: body.customDomain ?? existingDeployment.customDomain,
      headScripts: body.headScripts ?? existingDeployment.headScripts,
      bodyScripts: body.bodyScripts ?? existingDeployment.bodyScripts,
      cdnLinks: body.cdnLinks ?? existingDeployment.cdnLinks,
      analytics: body.analytics ?? existingDeployment.analytics,
      seo: body.seo ?? existingDeployment.seo,
      compliance: body.compliance ?? existingDeployment.compliance,
      settingsVersion: existingDeployment.settingsVersion + 1,
      updatedAt: new Date(),
    };

    if (adapter.updateDeployment) {
      await adapter.updateDeployment(updatedDeployment);
    }
    await adapter.close?.();

    // Return updated settings (lastPublishedVersion unchanged until publish)
    const settings = {
      enabled: updatedDeployment.enabled,
      underConstruction: updatedDeployment.underConstruction,
      customDomain: updatedDeployment.customDomain,
      headScripts: updatedDeployment.headScripts,
      bodyScripts: updatedDeployment.bodyScripts,
      cdnLinks: updatedDeployment.cdnLinks,
      analytics: updatedDeployment.analytics,
      seo: updatedDeployment.seo,
      compliance: updatedDeployment.compliance,
      settingsVersion: updatedDeployment.settingsVersion,
      lastPublishedVersion: existingDeployment.lastPublishedVersion, // Unchanged until publish
    };

    return NextResponse.json(settings);
  } catch (error) {
    console.error('[Deployments API] Error updating deployment settings:', error);
    return NextResponse.json(
      { error: 'Failed to update deployment settings' },
      { status: 500 }
    );
  }
}
