/**
 * Public Deployments Route - Root
 *
 * Serves index.html from public/deployments/[id]/
 * GET /deployments/[id] - Serve deployment index
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { logRequest } from '@/lib/logging/request-logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let statusCode = 200;
  const { id } = await params;

  try {
    // Construct absolute path to index.html
    const indexPath = path.join(
      process.cwd(),
      'public',
      'sites',
      id,
      'index.html'
    );

    // Check if file exists
    try {
      await fs.access(indexPath);
    } catch {
      // Deployment not found or not published
      statusCode = 404;
      logRequest({
        deploymentId: id,
        path: '/index.html',
        statusCode,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || '',
      });
      return new NextResponse('Deployment not found', { status: 404 });
    }

    // Read file content
    const content = await fs.readFile(indexPath, 'utf-8');

    // Log request (fire-and-forget)
    logRequest({
      deploymentId: id,
      path: '/index.html',
      statusCode,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || '',
    });

    // Return HTML
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error) {
    console.error('[Deployments Route] Error:', error);
    logRequest({
      deploymentId: id,
      path: '/index.html',
      statusCode: 500,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || '',
    });
    return new NextResponse('Internal server error', { status: 500 });
  }
}
