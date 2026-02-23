/**
 * Admin API: Secrets Management
 *
 * GET  /api/admin/deployments/[id]/secrets - List all secrets (metadata only)
 * POST /api/admin/deployments/[id]/secrets - Create a new secret
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
import { isEncryptionConfigured } from '@/lib/edge-functions/secrets-crypto';

interface RouteParams {
  params: Promise<{ id: string }>;
}

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

  // Must be SCREAMING_SNAKE_CASE: uppercase letters, numbers, underscores
  // Must start with a letter
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    return 'Secret name must be SCREAMING_SNAKE_CASE (uppercase letters, numbers, underscores; must start with letter)';
  }

  return null;
}

/**
 * GET - List all secrets for a deployment (metadata only, no values)
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: deploymentId } = await params;

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check deployment exists
    const deployment = await adapter.getDeployment?.(deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    // Check database is enabled
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
    console.error('[Admin Secrets API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST - Create a new secret
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: deploymentId } = await params;
    const body = await request.json();

    // Check encryption is configured
    if (!isEncryptionConfigured()) {
      return NextResponse.json(
        { error: 'Secrets encryption not configured. Set SECRETS_ENCRYPTION_KEY environment variable.' },
        { status: 500 }
      );
    }

    // Validate required fields
    if (!body.name) {
      return NextResponse.json({ error: 'Secret name is required' }, { status: 400 });
    }
    if (!body.value) {
      return NextResponse.json({ error: 'Secret value is required' }, { status: 400 });
    }

    // Validate name
    const nameError = validateSecretName(body.name);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check deployment exists
    const deployment = await adapter.getDeployment?.(deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    // Enable database if not already enabled
    if (!deployment.databaseEnabled) {
      deployment.databaseEnabled = true;
      await adapter.enableDeploymentDatabase(deploymentId);
      await adapter.updateDeployment?.(deployment);
    }

    const deploymentDb = adapter.getDeploymentDatabaseForAnalytics(deploymentId);
    if (!deploymentDb) {
      return NextResponse.json({ error: 'Deployment database not available' }, { status: 500 });
    }

    // Check for duplicate name
    const existing = deploymentDb.getSecretByName(body.name);
    if (existing) {
      return NextResponse.json({ error: 'A secret with this name already exists' }, { status: 409 });
    }

    // Create the secret (value is encrypted inside createSecret)
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
    console.error('[Admin Secrets API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
