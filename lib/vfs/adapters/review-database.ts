/**
 * Review Database Manager
 *
 * Manages the review portion of per-deployment SQLite databases containing:
 * - Participants (the people commenting on a review copy of a deployment)
 * - Comments (anchored to a page, optionally to an element on it)
 * - Notification state (how far the email digest has got, per recipient)
 *
 * Each deployment gets its own review database at deployments/{deploymentId}/review.sqlite, so
 * review data is created, backed up and deleted with the deployment it belongs to.
 */

import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { getReviewDatabaseConnection, closeReviewDatabase } from './sqlite-connection';

export type ReviewCommentStatus = 'open' | 'resolved';
export type ReviewRecipientKind = 'participant' | 'user';

/**
 * Every timestamp in this database is an ISO-8601 string at second resolution, produced by this
 * one expression. SQLite's own datetime() emits a space-separated format instead, which sorts
 * inconsistently against the ISO strings callers hold; keeping a single format across all three
 * tables means comparisons are plain text ones and stay on their index.
 */
const ISO_NOW = `strftime('%Y-%m-%dT%H:%M:%SZ','now')`;

const ISO_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * Reduce a timestamp to the stored format so it can be compared as text.
 *
 * Callers reach for `new Date().toISOString()`, which carries milliseconds that stored values do
 * not have. Left alone, '...:00.000Z' sorts *below* the stored '...:00Z' — '.' before 'Z' — so a
 * comment exactly on the watermark would come back as new every time. Truncating rather than
 * rounding keeps the error on the side of re-sending a comment rather than dropping one.
 */
function toStoredTimestamp(value: string): string {
  if (ISO_SECONDS.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.toISOString().slice(0, 19)}Z`;
}

export interface ReviewParticipant {
  id: string;
  displayName: string;
  email: string | null;
  notify: boolean;
  isTeam: boolean;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface ReviewParticipantInput {
  id: string;
  displayName: string;
  email?: string;
  notify?: boolean;
  isTeam?: boolean;
}

export interface ReviewComment {
  id: string;
  parentId: string | null;
  participantId: string;
  authorName: string;
  isTeam: boolean;
  pagePath: string;
  selector: string | null;
  anchorText: string | null;
  body: string;
  status: ReviewCommentStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface CreateReviewCommentData {
  parentId?: string;
  participantId: string;
  authorName: string;
  isTeam?: boolean;
  pagePath: string;
  selector?: string;
  anchorText?: string;
  body: string;
}

export interface ReviewCommentFilter {
  pagePath?: string;
  status?: ReviewCommentStatus;
}

export interface ReviewNotificationState {
  recipientKind: ReviewRecipientKind;
  recipientId: string;
  lastNotifiedAt: string | null;
  lastNotifiedCommentId: string | null;
}

function mapParticipant(row: Record<string, unknown>): ReviewParticipant {
  return {
    id: row.id as string,
    displayName: row.display_name as string,
    email: (row.email as string | null) ?? null,
    notify: Boolean(row.notify),
    isTeam: Boolean(row.is_team),
    createdAt: row.created_at as string,
    lastSeenAt: (row.last_seen_at as string | null) ?? null,
  };
}

function mapComment(row: Record<string, unknown>): ReviewComment {
  return {
    id: row.id as string,
    parentId: (row.parent_id as string | null) ?? null,
    participantId: row.participant_id as string,
    authorName: row.author_name as string,
    isTeam: Boolean(row.is_team),
    pagePath: row.page_path as string,
    selector: (row.selector as string | null) ?? null,
    anchorText: (row.anchor_text as string | null) ?? null,
    body: row.body as string,
    status: row.status as ReviewCommentStatus,
    createdAt: row.created_at as string,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    resolvedBy: (row.resolved_by as string | null) ?? null,
  };
}

export class ReviewDatabase {
  private db: Database;
  private deploymentId: string;
  private initialized = false;

  constructor(deploymentId: string) {
    this.deploymentId = deploymentId;
    this.db = getReviewDatabaseConnection(deploymentId);
  }

  init(): void {
    if (this.initialized) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        email TEXT,
        notify INTEGER NOT NULL DEFAULT 1,
        is_team INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (${ISO_NOW}),
        last_seen_at TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        participant_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        is_team INTEGER NOT NULL DEFAULT 0,
        page_path TEXT NOT NULL,
        selector TEXT,
        anchor_text TEXT,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL DEFAULT (${ISO_NOW}),
        resolved_at TEXT,
        resolved_by TEXT
      )
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_page ON comments(page_path)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at)`);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notification_state (
        recipient_kind TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        last_notified_at TEXT,
        last_notified_comment_id TEXT,
        PRIMARY KEY (recipient_kind, recipient_id)
      )
    `);

    this.initialized = true;
  }

  close(): void {
    closeReviewDatabase(this.deploymentId);
  }

  upsertParticipant(input: ReviewParticipantInput): ReviewParticipant {
    const existing = this.getParticipant(input.id);

    if (existing) {
      // A returning participant re-identifies themselves with a name and nothing else. Fields they
      // did not resupply have to survive the write, above all the address their notifications go
      // to.
      this.db.prepare(`
        UPDATE participants SET
          display_name = ?,
          email = ?,
          notify = ?,
          is_team = ?,
          last_seen_at = ${ISO_NOW}
        WHERE id = ?
      `).run(
        input.displayName,
        input.email ?? existing.email,
        (input.notify ?? existing.notify) ? 1 : 0,
        (input.isTeam ?? existing.isTeam) ? 1 : 0,
        input.id
      );
    } else {
      this.db.prepare(`
        INSERT INTO participants (id, display_name, email, notify, is_team, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ${ISO_NOW})
      `).run(
        input.id,
        input.displayName,
        input.email ?? null,
        (input.notify ?? true) ? 1 : 0,
        input.isTeam ? 1 : 0
      );
    }

    return this.getParticipant(input.id)!;
  }

  getParticipant(id: string): ReviewParticipant | null {
    const row = this.db.prepare('SELECT * FROM participants WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapParticipant(row) : null;
  }

  createComment(data: CreateReviewCommentData): ReviewComment {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO comments (
        id, parent_id, participant_id, author_name, is_team,
        page_path, selector, anchor_text, body
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.parentId ?? null,
      data.participantId,
      data.authorName,
      data.isTeam ? 1 : 0,
      data.pagePath,
      data.selector ?? null,
      data.anchorText ?? null,
      data.body
    );
    return this.getComment(id)!;
  }

  getComment(id: string): ReviewComment | null {
    const row = this.db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapComment(row) : null;
  }

  listComments(filter: ReviewCommentFilter = {}): ReviewComment[] {
    let query = 'SELECT * FROM comments WHERE 1=1';
    const params: string[] = [];

    if (filter.pagePath) {
      query += ' AND page_path = ?';
      params.push(filter.pagePath);
    }
    if (filter.status) {
      query += ' AND status = ?';
      params.push(filter.status);
    }

    query += ' ORDER BY created_at ASC, rowid ASC';

    const rows = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    return rows.map(mapComment);
  }

  setCommentStatus(id: string, status: ReviewCommentStatus, resolvedBy?: string): void {
    if (status === 'resolved') {
      this.db.prepare(`
        UPDATE comments SET status = 'resolved', resolved_at = ${ISO_NOW}, resolved_by = ?
        WHERE id = ?
      `).run(resolvedBy ?? null, id);
      return;
    }

    // Reopening has to clear the resolution, or the comment reads as both open and resolved by
    // someone.
    this.db.prepare(`
      UPDATE comments SET status = 'open', resolved_at = NULL, resolved_by = NULL
      WHERE id = ?
    `).run(id);
  }

  listCommentsSince(isoTimestamp: string): ReviewComment[] {
    // Strictly greater than: the digest hands back the watermark it stored last time, and a
    // comment sitting exactly on it has already been sent.
    //
    // The comparison is raw text against a raw column so it seeks idx_comments_created rather than
    // scanning it; normalising the argument in JS keeps that seek.
    const rows = this.db.prepare(`
      SELECT * FROM comments WHERE created_at > ?
      ORDER BY created_at ASC, rowid ASC
    `).all(toStoredTimestamp(isoTimestamp)) as Array<Record<string, unknown>>;
    return rows.map(mapComment);
  }

  getNotificationState(
    recipientKind: ReviewRecipientKind,
    recipientId: string
  ): ReviewNotificationState | null {
    const row = this.db.prepare(`
      SELECT * FROM notification_state WHERE recipient_kind = ? AND recipient_id = ?
    `).get(recipientKind, recipientId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      recipientKind: row.recipient_kind as ReviewRecipientKind,
      recipientId: row.recipient_id as string,
      lastNotifiedAt: (row.last_notified_at as string | null) ?? null,
      lastNotifiedCommentId: (row.last_notified_comment_id as string | null) ?? null,
    };
  }

  setNotificationState(
    recipientKind: ReviewRecipientKind,
    recipientId: string,
    state: { lastNotifiedAt: string | null; lastNotifiedCommentId: string | null }
  ): void {
    this.db.prepare(`
      INSERT INTO notification_state (
        recipient_kind, recipient_id, last_notified_at, last_notified_comment_id
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(recipient_kind, recipient_id) DO UPDATE SET
        last_notified_at = excluded.last_notified_at,
        last_notified_comment_id = excluded.last_notified_comment_id
    `).run(
      recipientKind,
      recipientId,
      // This value comes back out as the watermark for listCommentsSince, so it is stored in the
      // same format the comments carry rather than whatever the caller happened to hold.
      state.lastNotifiedAt === null ? null : toStoredTimestamp(state.lastNotifiedAt),
      state.lastNotifiedCommentId
    );
  }
}
