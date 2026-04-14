/**
 * Workspace-Scoped Deployment Settings API
 *
 * GET - Get deployment settings
 * PUT - Update deployment settings
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');
    const { id } = await params;

    const deployment = await adapter.getDeployment?.(id);

    if (!deployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

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
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Deployments API] Error getting deployment settings:', error);
    return NextResponse.json(
      { error: 'Failed to get deployment settings' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id } = await params;
    const body = await request.json();

    const existingDeployment = await adapter.getDeployment?.(id);
    if (!existingDeployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

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
      lastPublishedVersion: existingDeployment.lastPublishedVersion,
    };

    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Deployments API] Error updating deployment settings:', error);
    return NextResponse.json(
      { error: 'Failed to update deployment settings' },
      { status: 500 }
    );
  }
}
