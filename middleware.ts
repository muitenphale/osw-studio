/**
 * Next.js Middleware
 *
 * Handles authentication and routing for Server mode.
 * In Browser mode, server-only routes are blocked.
 * In Server mode, all data routes require authentication.
 *
 * Workspace routing:
 * - /w/[workspaceId]/* pages require auth
 * - /api/w/[workspaceId]/* routes require auth
 * - Legacy /admin/{view} paths redirect to /w/{defaultWorkspaceId}/{view}
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/session';

// Views that have moved from /admin/{view} to /w/{workspaceId}/{view}
const WORKSPACE_VIEWS = ['projects', 'dashboard', 'deployments', 'settings', 'skills', 'templates', 'docs'];

export async function middleware(request: NextRequest) {
  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';
  const { pathname } = request.nextUrl;
  const isDesktop = process.env.OSW_DESKTOP === 'true';

  // Desktop app: skip all auth
  if (isDesktop) return NextResponse.next();

  // ============================================
  // Workspace page routes: /w/[workspaceId]/*
  // ============================================
  if (pathname.startsWith('/w/')) {
    if (!isServerMode) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    const token = request.cookies.get('osw_session')?.value;
    if (!token) return NextResponse.redirect(new URL('/admin/login', request.url));

    const session = await verifySession(token);
    if (!session) return NextResponse.redirect(new URL('/admin/login', request.url));

    return NextResponse.next();
  }

  // ============================================
  // Workspace API routes: /api/w/[workspaceId]/*
  // ============================================
  if (pathname.startsWith('/api/w/')) {
    if (!isServerMode) {
      return NextResponse.json({ error: 'Not available in Browser mode' }, { status: 404 });
    }

    const token = request.cookies.get('osw_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.next();
  }

  // ============================================
  // Admin API routes: /api/admin/*
  // ============================================
  if (pathname.startsWith('/api/admin')) {
    if (!isServerMode) {
      return NextResponse.json({ error: 'Not available in Browser mode' }, { status: 404 });
    }
    // Defense-in-depth: verify session for admin API routes
    const token = request.cookies.get('osw_session')?.value;
    const apiKey = request.headers.get('x-instance-api-key');
    if (!token && !apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (token) {
      const session = await verifySession(token);
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    return NextResponse.next();
  }

  // ============================================
  // Admin pages: /admin/*
  // ============================================
  if (pathname.startsWith('/admin')) {
    if (!isServerMode) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Allow login and register pages without auth
    // (Register API enforces REGISTRATION_MODE + zero-users check server-side)
    if (pathname === '/admin/login' || pathname === '/admin/register') {
      return NextResponse.next();
    }

    const token = request.cookies.get('osw_session')?.value;
    if (!token) return NextResponse.redirect(new URL('/admin/login', request.url));

    const session = await verifySession(token);
    if (!session) return NextResponse.redirect(new URL('/admin/login', request.url));

    // Only admins can access user/workspace management
    if (!session.isAdmin && (pathname.startsWith('/admin/users') || pathname.startsWith('/admin/workspaces'))) {
      // Redirect non-admin to their default workspace
      const workspaceId = request.cookies.get('osw_workspace')?.value;
      if (workspaceId) {
        return NextResponse.redirect(new URL(`/w/${workspaceId}/projects`, request.url));
      }
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    // Legacy redirect: /admin/{view} -> /w/{workspaceId}/{view}
    for (const view of WORKSPACE_VIEWS) {
      if (pathname === `/admin/${view}` || pathname.startsWith(`/admin/${view}/`)) {
        const workspaceId = request.cookies.get('osw_workspace')?.value;
        if (workspaceId) {
          const newPath = pathname.replace(`/admin/${view}`, `/w/${workspaceId}/${view}`);
          return NextResponse.redirect(new URL(newPath, request.url));
        }
        // No workspace cookie — redirect to login
        return NextResponse.redirect(new URL('/admin/login', request.url));
      }
    }

    // /admin root redirect
    if (pathname === '/admin' || pathname === '/admin/') {
      const workspaceId = request.cookies.get('osw_workspace')?.value;
      if (workspaceId) {
        return NextResponse.redirect(new URL(`/w/${workspaceId}/projects`, request.url));
      }
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
