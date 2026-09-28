import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { mcpEnabled } from '@/lib/mcp/auth';
import { MAX_UPLOAD_BYTES, takeTransfer, type Transfer } from '@/lib/mcp/transfers';
import { isTextExtension } from '@/lib/vfs/types';

/**
 * Where the URLs from `files_upload_url` and `files_download_url` lead: PUT stores the request
 * body at the path the URL was issued for, GET answers with the file's bytes.
 *
 * The token in the path is the only credential, so it is spent before anything else happens, and
 * the grant and the account's role are checked again: either may have been withdrawn since the
 * URL was issued. Every refusal is JSON with an `error` a client can show as it is.
 */

type Params = { params: Promise<{ token: string }> };

function refuse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'cache-control': 'no-store' } });
}

const SPENT = 'This URL is unknown, already used, or expired. Ask for a new one.';

/** The grant still stands and the account still holds the role the transfer needs. */
async function stillAllowed(transfer: Transfer): Promise<string | null> {
  if (transfer.grantId !== 'dev') {
    const { getGrant } = await import('@/lib/mcp/store');
    const grant = getGrant(transfer.grantId);
    if (!grant || grant.revoked) return 'The connection this URL was issued to has been revoked.';
  }
  const { verifyWorkspaceAccess } = await import('@/lib/auth/system-database');
  try {
    verifyWorkspaceAccess(transfer.userId, transfer.workspaceId, transfer.kind === 'upload' ? 'editor' : 'viewer');
  } catch (error) {
    return error instanceof Error ? error.message : 'Workspace access denied';
  }
  return null;
}

async function audit(transfer: Transfer, tool: string, refused: boolean) {
  const { recordMcpActivity } = await import('@/lib/mcp/store');
  recordMcpActivity({
    grantId: transfer.grantId, userId: transfer.userId, workspaceId: transfer.workspaceId,
    tool, target: transfer.projectId, refused,
  });
}

/**
 * The body, or null once it passes the cap. Read as a stream so an oversized upload is stopped
 * at the cap rather than held in memory whole first.
 */
async function readCapped(request: NextRequest, cap: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > cap) return null;
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function PUT(request: NextRequest, { params }: Params) {
  if (!mcpEnabled()) return refuse(404, 'Not found');
  const transfer = takeTransfer((await params).token, 'upload');
  if (!transfer) return refuse(404, SPENT);

  const denied = await stillAllowed(transfer);
  if (denied) {
    await audit(transfer, 'files_upload', true);
    return refuse(403, denied);
  }

  let bytes: Uint8Array | null;
  try {
    bytes = await readCapped(request, MAX_UPLOAD_BYTES);
  } catch {
    // The client went away mid-body. Nothing has been written, and the URL is spent.
    await audit(transfer, 'files_upload', true);
    return refuse(400, 'The upload was interrupted before the whole file arrived. Ask for a new URL.');
  }
  if (!bytes) {
    await audit(transfer, 'files_upload', true);
    return refuse(413, `Uploads take up to ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`);
  }

  const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
  const adapter = getWorkspaceAdapter(transfer.workspaceId);
  await adapter.init();
  if (!(await adapter.getProject(transfer.projectId))) {
    await audit(transfer, 'files_upload', true);
    return refuse(404, `No project ${transfer.projectId} in this workspace.`);
  }
  // Checked again here as well as when the URL was issued: something else may have written the
  // path in between.
  if (!transfer.overwrite && await adapter.getFile(transfer.projectId, transfer.path)) {
    await audit(transfer, 'files_upload', true);
    return refuse(409, `${transfer.path} already exists. Ask for a new URL with overwrite: true to replace it.`);
  }

  // Text is stored as text, the way the editor and `bash` store it. Bytes that are not UTF-8
  // under a text extension would be stored mangled, so they are refused instead.
  let body: string | ArrayBuffer;
  if (isTextExtension(transfer.path)) {
    try {
      body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      await audit(transfer, 'files_upload', true);
      return refuse(415, `${transfer.path} has a text extension, but the upload is not UTF-8 text.`);
    }
  } else {
    body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  const { writeProjectFile } = await import('@/lib/mcp/files');
  try {
    const written = await writeProjectFile(
      adapter, { userId: transfer.userId, clientLabel: transfer.clientLabel },
      transfer.projectId, transfer.path, body,
    );
    await audit(transfer, 'files_upload', false);
    return NextResponse.json({
      ...written,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }, { status: written.created ? 201 : 200, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    // The VFS refuses with a message meant for a person: a per-type size limit, or the quota.
    await audit(transfer, 'files_upload', true);
    return refuse(422, error instanceof Error ? error.message : 'The file could not be written.');
  }
}

export async function GET(_request: NextRequest, { params }: Params) {
  if (!mcpEnabled()) return refuse(404, 'Not found');
  const transfer = takeTransfer((await params).token, 'download');
  if (!transfer) return refuse(404, SPENT);

  const denied = await stillAllowed(transfer);
  if (denied) {
    await audit(transfer, 'files_download', true);
    return refuse(403, denied);
  }

  const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
  const adapter = getWorkspaceAdapter(transfer.workspaceId);
  await adapter.init();
  const file = await adapter.getFile(transfer.projectId, transfer.path);
  if (!file) {
    await audit(transfer, 'files_download', true);
    return refuse(404, `No file at ${transfer.path} in this project.`);
  }

  const stored = file.content;
  const bytes = stored instanceof ArrayBuffer
    ? new Uint8Array(stored)
    : new TextEncoder().encode(typeof stored === 'string' ? stored : '');

  await audit(transfer, 'files_download', false);
  // Served as a download, never as a document: this URL is on the studio's own origin, and a
  // project's .html file answered inline would run there with whatever session the viewer holds.
  // `curl -o`, which is what hands this URL its bytes, is unaffected by either header.
  const filename = transfer.path.split('/').pop() || 'download';
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'content-type': file.mimeType || 'application/octet-stream',
      'content-length': String(bytes.byteLength),
      'content-disposition': `attachment; filename="${filename.replace(/["\\]/g, '')}"`,
      'x-content-type-options': 'nosniff',
      'x-content-sha256': createHash('sha256').update(bytes).digest('hex'),
      'cache-control': 'no-store',
    },
  });
}
