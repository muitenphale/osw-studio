/**
 * Admin API: Single Secret Operations
 *
 * GET    /api/admin/sites/[id]/secrets/[secretId] - Get secret metadata (no value)
 * PUT    /api/admin/sites/[id]/secrets/[secretId] - Update secret
 * DELETE /api/admin/sites/[id]/secrets/[secretId] - Delete secret
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
import { isEncryptionConfigured } from '@/lib/edge-functions/secrets-crypto';

interface RouteParams {
  params: Promise<{ id: string; secretId: string }>;
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
 * GET - Get secret metadata (no value exposed)
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: siteId, secretId } = await params;

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check site exists and database enabled
    const site = await adapter.getSite?.(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    if (!site.databaseEnabled) {
      return NextResponse.json({ error: 'Site database not enabled' }, { status: 400 });
    }

    const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
    if (!siteDb) {
      return NextResponse.json({ error: 'Site database not available' }, { status: 500 });
    }

    const secret = siteDb.getSecret(secretId);
    if (!secret) {
      return NextResponse.json({ error: 'Secret not found' }, { status: 404 });
    }

    return NextResponse.json({ secret });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Secrets API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT - Update secret (value and/or metadata)
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: siteId, secretId } = await params;
    const body = await request.json();

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check site exists and database enabled
    const site = await adapter.getSite?.(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    if (!site.databaseEnabled) {
      return NextResponse.json({ error: 'Site database not enabled' }, { status: 400 });
    }

    const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
    if (!siteDb) {
      return NextResponse.json({ error: 'Site database not available' }, { status: 500 });
    }

    // Check secret exists
    const existing = siteDb.getSecret(secretId);
    if (!existing) {
      return NextResponse.json({ error: 'Secret not found' }, { status: 404 });
    }

    // Update value if provided (requires encryption to be configured)
    if (body.value !== undefined && body.value !== '') {
      if (!isEncryptionConfigured()) {
        return NextResponse.json(
          { error: 'Secrets encryption not configured. Set SECRETS_ENCRYPTION_KEY environment variable.' },
          { status: 500 }
        );
      }
      siteDb.updateSecretValue(secretId, body.value);
    }

    // Build metadata updates
    const metadataUpdates: { name?: string; description?: string } = {};

    // Validate and add name if provided
    if (body.name !== undefined && body.name !== existing.name) {
      const nameError = validateSecretName(body.name);
      if (nameError) {
        return NextResponse.json({ error: nameError }, { status: 400 });
      }
      // Check for duplicate name
      const duplicate = siteDb.getSecretByName(body.name);
      if (duplicate && duplicate.id !== secretId) {
        return NextResponse.json({ error: 'A secret with this name already exists' }, { status: 409 });
      }
      metadataUpdates.name = body.name;
    }

    // Add description if provided
    if (body.description !== undefined) {
      metadataUpdates.description = body.description;
    }

    // Apply metadata updates
    if (Object.keys(metadataUpdates).length > 0) {
      siteDb.updateSecretMetadata(secretId, metadataUpdates);
    }

    const secret = siteDb.getSecret(secretId);

    return NextResponse.json({ secret });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Secrets API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE - Delete secret
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: siteId, secretId } = await params;

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check site exists and database enabled
    const site = await adapter.getSite?.(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    if (!site.databaseEnabled) {
      return NextResponse.json({ error: 'Site database not enabled' }, { status: 400 });
    }

    const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
    if (!siteDb) {
      return NextResponse.json({ error: 'Site database not available' }, { status: 500 });
    }

    // Check secret exists
    const secret = siteDb.getSecret(secretId);
    if (!secret) {
      return NextResponse.json({ error: 'Secret not found' }, { status: 404 });
    }

    // Delete the secret
    siteDb.deleteSecret(secretId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Secrets API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
