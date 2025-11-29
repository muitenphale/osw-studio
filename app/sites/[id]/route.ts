/**
 * Public Sites Route - Root
 *
 * Serves index.html from public/sites/[id]/
 * GET /sites/[id] - Serve site index
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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
      // Site not found or not published
      return new NextResponse('Site not found', { status: 404 });
    }

    // Read file content
    const content = await fs.readFile(indexPath, 'utf-8');

    // Return HTML
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error) {
    console.error('[Sites Route] Error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
