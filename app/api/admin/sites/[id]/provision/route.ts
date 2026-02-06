/**
 * Admin API: Bulk Site Template Provisioning
 *
 * POST /api/admin/sites/[id]/provision - Provision all backend features from a site template
 *
 * Accepts a SiteTemplateFeatures object and creates all backend infrastructure
 * (database schema, edge functions, server functions, secret placeholders) in one request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
import { SiteTemplateFeatures } from '@/lib/vfs/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST - Provision backend features for a site from a template
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: siteId } = await params;
    const body = await request.json();

    const siteFeatures = body.siteFeatures as SiteTemplateFeatures | undefined;
    if (!siteFeatures) {
      return NextResponse.json({ error: 'siteFeatures is required' }, { status: 400 });
    }

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check site exists
    const site = await adapter.getSite?.(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // 1. Enable site database
    if (!site.databaseEnabled) {
      site.databaseEnabled = true;
      await adapter.enableSiteDatabase(siteId);
      await adapter.updateSite?.(site);
    }

    const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
    if (!siteDb) {
      return NextResponse.json({ error: 'Site database not available' }, { status: 500 });
    }

    const provisioned = {
      edgeFunctions: 0,
      serverFunctions: 0,
      secrets: 0,
      databaseSchemaApplied: false,
    };

    // 2. Execute DDL schema (before functions so tables exist for queries)
    if (siteFeatures.databaseSchema) {
      siteDb.executeDDL(siteFeatures.databaseSchema);
      provisioned.databaseSchemaApplied = true;
    }

    // 3. Create edge functions (skip duplicates)
    if (siteFeatures.edgeFunctions) {
      for (const fn of siteFeatures.edgeFunctions) {
        const existing = siteDb.getFunctionByName(fn.name);
        if (existing) continue;

        siteDb.createFunction({
          name: fn.name,
          description: fn.description,
          code: fn.code,
          method: fn.method || 'ANY',
          enabled: fn.enabled !== false,
          timeoutMs: fn.timeoutMs || 5000,
        });
        provisioned.edgeFunctions++;
      }
    }

    // 4. Create server functions (skip duplicates)
    if (siteFeatures.serverFunctions) {
      for (const fn of siteFeatures.serverFunctions) {
        const existing = siteDb.getServerFunctionByName(fn.name);
        if (existing) continue;

        siteDb.createServerFunction({
          name: fn.name,
          description: fn.description,
          code: fn.code,
          enabled: fn.enabled !== false,
        });
        provisioned.serverFunctions++;
      }
    }

    // 5. Create secret placeholders (skip duplicates)
    if (siteFeatures.secrets) {
      for (const secret of siteFeatures.secrets) {
        const existing = siteDb.getSecretByName(secret.name);
        if (existing) continue;

        siteDb.createSecretPlaceholder(secret.name, secret.description);
        provisioned.secrets++;
      }
    }

    return NextResponse.json({ provisioned }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Provision API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
