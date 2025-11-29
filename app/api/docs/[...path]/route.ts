/**
 * API Route for Documentation Files
 * GET /api/docs/[...path] - Serve documentation files from /docs/
 *
 * This prevents docs from being publicly accessible in /public/
 * while still allowing the admin interface to read them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;

    // Security: prevent path traversal
    const filename = path.join('/');
    if (filename.includes('..') || filename.startsWith('/')) {
      return NextResponse.json(
        { error: 'Invalid path' },
        { status: 400 }
      );
    }

    // Read file from /docs/ directory
    const docsPath = join(process.cwd(), 'docs', filename);
    const content = await readFile(docsPath, 'utf-8');

    // Return as plain text with markdown content type
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('[Docs API] Error reading file:', error);

    // Check if file doesn't exist
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to read document' },
      { status: 500 }
    );
  }
}
