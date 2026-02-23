/**
 * Public Deployments Route
 *
 * Serves compiled static files from public/deployments/[id]/
 * GET /deployments/[id]/[...path] - Serve static deployment files
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { logRequest } from '@/lib/logging/request-logger';

const MIME_TYPES: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  eot: 'application/vnd.ms-fontobject',
  txt: 'text/plain',
  pdf: 'application/pdf',
  xml: 'application/xml',
};

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; path?: string[] }> }
) {
  const { id, path: pathSegments = [] } = await params;
  const requestedPath = pathSegments.length > 0 ? pathSegments.join('/') : 'index.html';

  try {
    // Construct absolute path to static file
    const staticFilePath = path.join(
      process.cwd(),
      'public',
      'sites',
      id,
      requestedPath
    );

    // Check if file exists
    try {
      await fs.access(staticFilePath);
    } catch {
      // File not found, return 404
      logRequest({
        deploymentId: id,
        path: '/' + requestedPath,
        statusCode: 404,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || '',
      });
      return new NextResponse('File not found', { status: 404 });
    }

    // Read file content
    const content = await fs.readFile(staticFilePath);

    // Determine MIME type
    const mimeType = getMimeType(requestedPath);

    // Log request (fire-and-forget)
    logRequest({
      deploymentId: id,
      path: '/' + requestedPath,
      statusCode: 200,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || '',
    });

    // Return file with correct MIME type
    // Use Uint8Array for binary compatibility with NextResponse
    return new NextResponse(new Uint8Array(content), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error) {
    console.error('[Deployments Route] Error:', error);
    logRequest({
      deploymentId: id,
      path: '/' + requestedPath,
      statusCode: 500,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || '',
    });
    return new NextResponse('Internal server error', { status: 500 });
  }
}
