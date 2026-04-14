/**
 * Workspace-Scoped Admin API: Single Secret Operations
 *
 * GET    - Get secret metadata (no value)
 * PUT    - Update secret
 * DELETE - Delete secret
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { isEncryptionConfigured } from '@/lib/edge-functions/secrets-crypto';

function validateSecretName(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return 'Secret name is required';
  }
  if (name.length > 64) {
    return 'Secret name must be 64 characters or less';
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    return 'Secret name must be SCREAMING_SNAKE_CASE (uppercase letters, numbers, underscores; must start with letter)';
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string; secretId: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');
    const { id: deploymentId, secretId } = await params;

    const deployment = await adapter.getDeployment?.(deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }
    if (!deployment.databaseEnabled) {
      return NextResponse.json({ error: 'Deployment database not enabled' }, { status: 400 });
    }

    const deploymentDb = adapter.getDeploymentDatabaseForAnalytics(deploymentId);
    if (!deploymentDb) {
      return NextResponse.json({ error: 'Deployment database not available' }, { status: 500 });
    }

    const secret = deploymentDb.getSecret(secretId);
    if (!secret) {
      return NextResponse.json({ error: 'Secret not found' }, { status: 404 });
    }

    return NextResponse.json({ secret });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Admin Secrets API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string; secretId: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id: deploymentId, secretId } = await params;
    const body = await request.json();

    const deployment = await adapter.getDeployment?.(deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }
    if (!deployment.databaseEnabled) {
      return NextResponse.json({ error: 'Deployment database not enabled' }, { status: 400 });
    }

    const deploymentDb = adapter.getDeploymentDatabaseForAnalytics(deploymentId);
    if (!deploymentDb) {
      return NextResponse.json({ error: 'Deployment database not available' }, { status: 500 });
    }

    const existing = deploymentDb.getSecret(secretId);
    if (!existing) {
      return NextResponse.json({ error: 'Secret not found' }, { status: 404 });
    }

    // Update value if provided
    if (body.value !== undefined && body.value !== '') {
      if (!isEncryptionConfigured()) {
        return NextResponse.json(
          { error: 'Secrets encryption not configured. Set SECRETS_ENCRYPTION_KEY environment variable.' },
          { status: 500 }
        );
      }
      deploymentDb.updateSecretValue(secretId, body.value);
    }

    const metadataUpdates: { name?: string; description?: string } = {};

    if (body.name !== undefined && body.name !== existing.name) {
      const nameError = validateSecretName(body.name);
      if (nameError) {
        return NextResponse.json({ error: nameError }, { status: 400 });
      }
      const duplicate = deploymentDb.getSecretByName(body.name);
      if (duplicate && duplicate.id !== secretId) {
        return NextResponse.json({ error: 'A secret with this name already exists' }, { status: 409 });
      }
      metadataUpdates.name = body.name;
    }

    if (body.description !== undefined) {
      metadataUpdates.description = body.description;
    }

    if (Object.keys(metadataUpdates).length > 0) {
      deploymentDb.updateSecretMetadata(secretId, metadataUpdates);
    }

    const secret = deploymentDb.getSecret(secretId);

    return NextResponse.json({ secret });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Admin Secrets API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string; secretId: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id: deploymentId, secretId } = await params;

    const deployment = await adapter.getDeployment?.(deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }
    if (!deployment.databaseEnabled) {
      return NextResponse.json({ error: 'Deployment database not enabled' }, { status: 400 });
    }

    const deploymentDb = adapter.getDeploymentDatabaseForAnalytics(deploymentId);
    if (!deploymentDb) {
      return NextResponse.json({ error: 'Deployment database not available' }, { status: 500 });
    }

    const secret = deploymentDb.getSecret(secretId);
    if (!secret) {
      return NextResponse.json({ error: 'Secret not found' }, { status: 404 });
    }

    deploymentDb.deleteSecret(secretId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Admin Secrets API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
