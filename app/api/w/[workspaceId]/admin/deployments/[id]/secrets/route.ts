/**
 * Workspace-Scoped Admin API: Secrets Management
 *
 * GET  - List all secrets (metadata only)
 * POST - Create a new secret
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { isEncryptionConfigured } from '@/lib/edge-functions/secrets-crypto';

/**
 * Validate secret name (SCREAMING_SNAKE_CASE)
 */
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
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');
    const { id: deploymentId } = await params;

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

    const secrets = deploymentDb.listSecrets();

    return NextResponse.json({
      secrets,
      encryptionConfigured: isEncryptionConfigured(),
    });
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id: deploymentId } = await params;
    const body = await request.json();

    if (!isEncryptionConfigured()) {
      return NextResponse.json(
        { error: 'Secrets encryption not configured. Set SECRETS_ENCRYPTION_KEY environment variable.' },
        { status: 500 }
      );
    }

    if (!body.name) {
      return NextResponse.json({ error: 'Secret name is required' }, { status: 400 });
    }
    if (!body.value) {
      return NextResponse.json({ error: 'Secret value is required' }, { status: 400 });
    }

    const nameError = validateSecretName(body.name);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

    const deployment = await adapter.getDeployment?.(deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    if (!deployment.databaseEnabled) {
      deployment.databaseEnabled = true;
      await adapter.enableDeploymentDatabase(deploymentId);
      await adapter.updateDeployment?.(deployment);
    }

    const deploymentDb = adapter.getDeploymentDatabaseForAnalytics(deploymentId);
    if (!deploymentDb) {
      return NextResponse.json({ error: 'Deployment database not available' }, { status: 500 });
    }

    const existing = deploymentDb.getSecretByName(body.name);
    if (existing) {
      return NextResponse.json({ error: 'A secret with this name already exists' }, { status: 409 });
    }

    const id = deploymentDb.createSecret(
      body.name,
      body.value,
      body.description || undefined
    );

    const secret = deploymentDb.getSecret(id);

    return NextResponse.json({ secret }, { status: 201 });
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
