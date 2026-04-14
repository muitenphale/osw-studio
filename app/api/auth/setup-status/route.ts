/**
 * Setup Status API
 *
 * GET /api/auth/setup-status
 * Returns whether the instance needs initial setup (no users exist).
 * Public endpoint — no auth required.
 */

import { NextResponse } from 'next/server';
import { getUserCount } from '@/lib/auth/system-database';

export async function GET() {
  try {
    const userCount = getUserCount();
    const registrationMode = process.env.REGISTRATION_MODE || 'closed';

    return NextResponse.json({
      needsSetup: userCount === 0,
      registrationOpen: registrationMode === 'open' || userCount === 0,
    });
  } catch {
    // System database might not be available in browser mode
    return NextResponse.json({
      needsSetup: false,
      registrationOpen: false,
    });
  }
}
