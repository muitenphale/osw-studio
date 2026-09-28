import { randomBytes } from 'crypto';

/**
 * One-time URLs for moving a file's bytes between a client's disk and a project.
 *
 * An MCP tool's arguments and results pass through the model, so a file sent as base64 is
 * written out by the model token by token: a 56KB image cost tens of thousands of output tokens
 * and minutes of generation. `files_upload_url` and `files_download_url` hand out a URL instead,
 * and the client moves the bytes with its own `curl`, so only the URL passes through the model.
 *
 * The server cannot read the client's files itself: it is an HTTP endpoint that may be a hosted
 * instance on another machine, and one that opened paths it was given would expose its own disk.
 *
 * A URL is bound to one grant, workspace, project, path and direction, is spent on first use and
 * expires after ten minutes. Held in memory, pinned to globalThis for the same reason as the
 * pending agent runs: Next can load this module more than once, and the route that spends a URL
 * must see the map the tool filled. A restart forgets outstanding URLs, which costs a client one
 * more tool call.
 */

export const TRANSFER_TTL_MS = 10 * 60 * 1000;

/** Largest body an upload accepts, whatever the file type's own limit allows. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface Transfer {
  kind: 'upload' | 'download';
  grantId: string;
  userId: string;
  workspaceId: string;
  projectId: string;
  path: string;
  /** Uploads only: replace a file already at `path` rather than refuse. */
  overwrite: boolean;
  clientLabel: string;
  expiresAt: number;
}

const g = globalThis as unknown as { __mcpTransfers?: Map<string, Transfer> };

function transfers(): Map<string, Transfer> {
  g.__mcpTransfers ??= new Map();
  return g.__mcpTransfers;
}

function sweep(now: number) {
  for (const [token, transfer] of transfers()) {
    if (transfer.expiresAt <= now) transfers().delete(token);
  }
}

export function createTransfer(input: Omit<Transfer, 'expiresAt'>): { token: string; expiresAt: number } {
  const now = Date.now();
  sweep(now);
  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + TRANSFER_TTL_MS;
  transfers().set(token, { ...input, expiresAt });
  return { token, expiresAt };
}

/**
 * Spends a URL: the transfer it names, or undefined when it is unknown, expired, already used or
 * for the other direction. Removed before the caller does anything with it, so a second request
 * racing the first cannot use it too. A token for the wrong direction is left alone.
 */
export function takeTransfer(token: string, kind: Transfer['kind']): Transfer | undefined {
  const now = Date.now();
  const transfer = transfers().get(token);
  if (!transfer || transfer.kind !== kind) return undefined;
  transfers().delete(token);
  if (transfer.expiresAt <= now) return undefined;
  return transfer;
}
