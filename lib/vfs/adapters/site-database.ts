/**
 * Site Database Manager
 *
 * Manages per-site SQLite databases containing:
 * - Site info/settings (single row)
 * - Files
 * - File tree nodes
 * - Analytics (pageviews, interactions, sessions)
 *
 * Each site gets its own database at sites/{siteId}/site.sqlite
 * This enables clean isolation and easy export.
 */

import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { VirtualFile, FileTreeNode, Site } from '../types';
import { getSiteDatabase, closeSiteDatabase } from './sqlite-connection';

/**
 * Helper to ensure a value is a Date and convert to ISO string
 * Handles both Date objects and ISO strings (from JSON deserialization)
 */
function toISOString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.toISOString();
}

/**
 * Helper to ensure a value is a Date and convert to ISO string (non-null)
 */
function toISOStringRequired(value: Date | string): string {
  if (typeof value === 'string') return value;
  return value.toISOString();
}

// Analytics types
export interface PageviewData {
  pagePath: string;
  referrer?: string;
  country?: string;
  userAgent?: string;
  deviceType?: string;
  sessionId: string;
  loadTime?: number;
}

export interface InteractionData {
  sessionId: string;
  pagePath: string;
  interactionType: string;
  elementSelector?: string;
  coordinates?: {
    x: number;
    y: number;
    scrollY?: number;
    viewportWidth?: number;
    viewportHeight?: number;
    documentHeight?: number;
  };
  scrollDepth?: number;
  timeOnPage?: number;
}

export interface SessionData {
  sessionId: string;
  entryPage?: string;
  exitPage?: string;
  pageCount?: number;
  duration?: number;
  isBounce?: boolean;
}

export interface AnalyticsStats {
  totalPageviews: number;
  uniqueSessions: number;
  avgSessionDuration: number;
  bounceRate: number;
  topPages: Array<{ path: string; views: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
}

/**
 * Helper to parse JSON safely with a fallback
 */
function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Helper to parse Date from ISO string
 */
function parseDate(value: string | null | undefined): Date {
  if (!value) return new Date();
  return new Date(value);
}

/**
 * Per-site database manager
 */
export class SiteDatabase {
  private db: Database;
  private siteId: string;
  private initialized = false;

  constructor(siteId: string) {
    this.siteId = siteId;
    this.db = getSiteDatabase(siteId);
  }

  /**
   * Initialize the database schema
   */
  init(): void {
    if (this.initialized) return;

    // Site info (single row)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS site_info (
        id TEXT PRIMARY KEY DEFAULT 'main',
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT,
        enabled INTEGER NOT NULL DEFAULT 0,
        under_construction INTEGER NOT NULL DEFAULT 0,
        custom_domain TEXT,
        head_scripts TEXT NOT NULL DEFAULT '[]',
        body_scripts TEXT NOT NULL DEFAULT '[]',
        cdn_links TEXT NOT NULL DEFAULT '[]',
        analytics TEXT NOT NULL DEFAULT '{}',
        seo TEXT NOT NULL DEFAULT '{}',
        compliance TEXT NOT NULL DEFAULT '{}',
        settings_version INTEGER NOT NULL DEFAULT 1,
        last_published_version INTEGER,
        preview_image TEXT,
        preview_updated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT
      )
    `);

    // Files
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata TEXT DEFAULT '{}'
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)
    `);

    // File tree nodes
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_tree_nodes (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        parent_path TEXT,
        is_expanded INTEGER DEFAULT 0,
        children TEXT DEFAULT '[]',
        metadata TEXT DEFAULT '{}'
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tree_nodes_parent_path ON file_tree_nodes(parent_path)
    `);

    // Analytics: Pageviews
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pageviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_path TEXT NOT NULL,
        referrer TEXT,
        country TEXT,
        user_agent TEXT,
        device_type TEXT,
        session_id TEXT NOT NULL,
        load_time INTEGER,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pageviews_timestamp ON pageviews(timestamp)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pageviews_session_id ON pageviews(session_id)
    `);

    // Analytics: Interactions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS interactions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        page_path TEXT NOT NULL,
        interaction_type TEXT NOT NULL,
        element_selector TEXT,
        coordinates TEXT,
        scroll_depth INTEGER,
        time_on_page INTEGER,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_interactions_page_path ON interactions(page_path)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON interactions(timestamp)
    `);

    // Analytics: Sessions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        entry_page TEXT,
        exit_page TEXT,
        page_count INTEGER DEFAULT 1,
        duration INTEGER,
        is_bounce INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at)
    `);

    this.initialized = true;
  }

  /**
   * Close the database connection
   */
  close(): void {
    closeSiteDatabase(this.siteId);
  }

  // ============================================
  // Site Info
  // ============================================

  createSiteInfo(site: Site): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO site_info (
        id, project_id, name, slug, enabled, under_construction,
        custom_domain, head_scripts, body_scripts, cdn_links,
        analytics, seo, compliance, settings_version,
        last_published_version, preview_image, preview_updated_at,
        created_at, updated_at, published_at
      ) VALUES (
        'main', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      site.projectId,
      site.name,
      site.slug ?? null,
      site.enabled ? 1 : 0,
      site.underConstruction ? 1 : 0,
      site.customDomain ?? null,
      JSON.stringify(site.headScripts ?? []),
      JSON.stringify(site.bodyScripts ?? []),
      JSON.stringify(site.cdnLinks ?? []),
      JSON.stringify(site.analytics ?? {}),
      JSON.stringify(site.seo ?? {}),
      JSON.stringify(site.compliance ?? {}),
      site.settingsVersion ?? 1,
      site.lastPublishedVersion ?? null,
      site.previewImage ?? null,
      toISOString(site.previewUpdatedAt),
      toISOStringRequired(site.createdAt),
      toISOStringRequired(site.updatedAt),
      toISOString(site.publishedAt)
    );
  }

  getSiteInfo(): Site | null {
    const row = this.db.prepare('SELECT * FROM site_info WHERE id = ?').get('main') as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      id: this.siteId,
      projectId: row.project_id as string,
      name: row.name as string,
      slug: row.slug as string | undefined,
      enabled: Boolean(row.enabled),
      underConstruction: Boolean(row.under_construction),
      customDomain: row.custom_domain as string | undefined,
      headScripts: parseJSON(row.head_scripts as string, []),
      bodyScripts: parseJSON(row.body_scripts as string, []),
      cdnLinks: parseJSON(row.cdn_links as string, []),
      analytics: parseJSON(row.analytics as string, { enabled: false, provider: 'builtin' as const, privacyMode: true }),
      seo: parseJSON(row.seo as string, {}),
      compliance: parseJSON(row.compliance as string, { enabled: false, bannerPosition: 'bottom' as const, bannerStyle: 'bar' as const, message: '', acceptButtonText: 'Accept', declineButtonText: 'Decline', mode: 'opt-in' as const, blockAnalytics: false }),
      settingsVersion: row.settings_version as number,
      lastPublishedVersion: row.last_published_version as number | undefined,
      previewImage: row.preview_image as string | undefined,
      previewUpdatedAt: row.preview_updated_at ? parseDate(row.preview_updated_at as string) : undefined,
      createdAt: parseDate(row.created_at as string),
      updatedAt: parseDate(row.updated_at as string),
      publishedAt: row.published_at ? parseDate(row.published_at as string) : null,
    };
  }

  updateSiteInfo(site: Partial<Site>): void {
    // Build dynamic update query based on provided fields
    const updates: string[] = [];
    const values: unknown[] = [];

    if (site.name !== undefined) { updates.push('name = ?'); values.push(site.name); }
    if (site.slug !== undefined) { updates.push('slug = ?'); values.push(site.slug); }
    if (site.enabled !== undefined) { updates.push('enabled = ?'); values.push(site.enabled ? 1 : 0); }
    if (site.underConstruction !== undefined) { updates.push('under_construction = ?'); values.push(site.underConstruction ? 1 : 0); }
    if (site.customDomain !== undefined) { updates.push('custom_domain = ?'); values.push(site.customDomain); }
    if (site.headScripts !== undefined) { updates.push('head_scripts = ?'); values.push(JSON.stringify(site.headScripts)); }
    if (site.bodyScripts !== undefined) { updates.push('body_scripts = ?'); values.push(JSON.stringify(site.bodyScripts)); }
    if (site.cdnLinks !== undefined) { updates.push('cdn_links = ?'); values.push(JSON.stringify(site.cdnLinks)); }
    if (site.analytics !== undefined) { updates.push('analytics = ?'); values.push(JSON.stringify(site.analytics)); }
    if (site.seo !== undefined) { updates.push('seo = ?'); values.push(JSON.stringify(site.seo)); }
    if (site.compliance !== undefined) { updates.push('compliance = ?'); values.push(JSON.stringify(site.compliance)); }
    if (site.settingsVersion !== undefined) { updates.push('settings_version = ?'); values.push(site.settingsVersion); }
    if (site.lastPublishedVersion !== undefined) { updates.push('last_published_version = ?'); values.push(site.lastPublishedVersion); }
    if (site.previewImage !== undefined) { updates.push('preview_image = ?'); values.push(site.previewImage); }
    if (site.previewUpdatedAt !== undefined) { updates.push('preview_updated_at = ?'); values.push(toISOString(site.previewUpdatedAt)); }
    if (site.updatedAt !== undefined) { updates.push('updated_at = ?'); values.push(toISOStringRequired(site.updatedAt)); }
    if (site.publishedAt !== undefined) { updates.push('published_at = ?'); values.push(toISOString(site.publishedAt)); }

    if (updates.length === 0) return;

    // Always update updated_at
    if (!site.updatedAt) {
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
    }

    const sql = `UPDATE site_info SET ${updates.join(', ')} WHERE id = 'main'`;
    this.db.prepare(sql).run(...values);
  }

  // ============================================
  // Files
  // ============================================

  createFile(file: VirtualFile): void {
    const stmt = this.db.prepare(`
      INSERT INTO files (
        id, path, name, type, content, mime_type, size,
        created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Handle ArrayBuffer content
    let content: string;
    if (file.content instanceof ArrayBuffer) {
      content = Buffer.from(file.content).toString('base64');
    } else {
      content = file.content;
    }

    stmt.run(
      file.id,
      file.path,
      file.name,
      file.type,
      content,
      file.mimeType,
      file.size,
      toISOStringRequired(file.createdAt),
      toISOStringRequired(file.updatedAt),
      JSON.stringify(file.metadata ?? {})
    );
  }

  getFile(path: string): VirtualFile | null {
    const row = this.db.prepare('SELECT * FROM files WHERE path = ?').get(path) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.rowToFile(row);
  }

  updateFile(file: VirtualFile): void {
    const stmt = this.db.prepare(`
      UPDATE files SET
        name = ?, type = ?, content = ?, mime_type = ?,
        size = ?, updated_at = ?, metadata = ?
      WHERE path = ?
    `);

    // Handle ArrayBuffer content
    let content: string;
    if (file.content instanceof ArrayBuffer) {
      content = Buffer.from(file.content).toString('base64');
    } else {
      content = file.content;
    }

    stmt.run(
      file.name,
      file.type,
      content,
      file.mimeType,
      file.size,
      toISOStringRequired(file.updatedAt),
      JSON.stringify(file.metadata ?? {}),
      file.path
    );
  }

  deleteFile(path: string): void {
    this.db.prepare('DELETE FROM files WHERE path = ?').run(path);
  }

  listFiles(): VirtualFile[] {
    const rows = this.db.prepare('SELECT * FROM files ORDER BY path').all() as Record<string, unknown>[];
    return rows.map(row => this.rowToFile(row));
  }

  deleteAllFiles(): void {
    this.db.prepare('DELETE FROM files').run();
  }

  private rowToFile(row: Record<string, unknown>): VirtualFile {
    const metadata = parseJSON(row.metadata as string, {});
    const type = row.type as VirtualFile['type'];

    // Detect if content is base64-encoded binary
    let content: string | ArrayBuffer = row.content as string;
    if (type === 'image' || type === 'video' || type === 'binary') {
      // Convert base64 back to ArrayBuffer
      try {
        content = Buffer.from(content, 'base64').buffer;
      } catch {
        // Keep as string if conversion fails
      }
    }

    return {
      id: row.id as string,
      projectId: this.siteId,
      path: row.path as string,
      name: row.name as string,
      type,
      content,
      mimeType: row.mime_type as string,
      size: row.size as number,
      createdAt: parseDate(row.created_at as string),
      updatedAt: parseDate(row.updated_at as string),
      metadata,
    };
  }

  // ============================================
  // File Tree Nodes
  // ============================================

  createTreeNode(node: FileTreeNode): void {
    const stmt = this.db.prepare(`
      INSERT INTO file_tree_nodes (id, path, name, type, parent_path, is_expanded, children, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      node.id,
      node.path,
      node.name,
      node.type,
      node.parentPath,
      node.isExpanded ? 1 : 0,
      JSON.stringify(node.children ?? []),
      JSON.stringify(node.metadata ?? {})
    );
  }

  getTreeNode(path: string): FileTreeNode | null {
    const row = this.db.prepare('SELECT * FROM file_tree_nodes WHERE path = ?').get(path) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.rowToTreeNode(row);
  }

  updateTreeNode(node: FileTreeNode): void {
    const stmt = this.db.prepare(`
      UPDATE file_tree_nodes SET
        name = ?, type = ?, parent_path = ?, is_expanded = ?, children = ?, metadata = ?
      WHERE path = ?
    `);

    stmt.run(
      node.name,
      node.type,
      node.parentPath,
      node.isExpanded ? 1 : 0,
      JSON.stringify(node.children ?? []),
      JSON.stringify(node.metadata ?? {}),
      node.path
    );
  }

  deleteTreeNode(path: string): void {
    this.db.prepare('DELETE FROM file_tree_nodes WHERE path = ?').run(path);
  }

  getChildNodes(parentPath: string | null): FileTreeNode[] {
    const rows = this.db.prepare(
      'SELECT * FROM file_tree_nodes WHERE parent_path IS ? ORDER BY type DESC, path'
    ).all(parentPath) as Record<string, unknown>[];

    return rows.map(row => this.rowToTreeNode(row));
  }

  getAllTreeNodes(): FileTreeNode[] {
    const rows = this.db.prepare('SELECT * FROM file_tree_nodes ORDER BY path').all() as Record<string, unknown>[];
    return rows.map(row => this.rowToTreeNode(row));
  }

  private rowToTreeNode(row: Record<string, unknown>): FileTreeNode {
    return {
      id: row.id as string,
      projectId: this.siteId,
      path: row.path as string,
      name: row.name as string,
      type: row.type as 'file' | 'directory',
      parentPath: row.parent_path as string | null,
      isExpanded: Boolean(row.is_expanded),
      children: parseJSON(row.children as string, []),
      metadata: parseJSON(row.metadata as string, {}),
    };
  }

  // ============================================
  // Analytics: Recording
  // ============================================

  recordPageview(data: PageviewData): void {
    const stmt = this.db.prepare(`
      INSERT INTO pageviews (
        page_path, referrer, country, user_agent,
        device_type, session_id, load_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.pagePath,
      data.referrer ?? null,
      data.country ?? null,
      data.userAgent ?? null,
      data.deviceType ?? null,
      data.sessionId,
      data.loadTime ?? null
    );
  }

  recordInteraction(data: InteractionData): void {
    const stmt = this.db.prepare(`
      INSERT INTO interactions (
        id, session_id, page_path, interaction_type,
        element_selector, coordinates, scroll_depth, time_on_page
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      uuidv4(),
      data.sessionId,
      data.pagePath,
      data.interactionType,
      data.elementSelector ?? null,
      data.coordinates ? JSON.stringify(data.coordinates) : null,
      data.scrollDepth ?? null,
      data.timeOnPage ?? null
    );
  }

  upsertSession(sessionId: string, pagePath: string): void {
    // Check if session exists
    const existing = this.db.prepare(
      'SELECT * FROM sessions WHERE session_id = ?'
    ).get(sessionId) as Record<string, unknown> | undefined;

    if (existing) {
      // Update existing session
      const pageCount = (existing.page_count as number) + 1;
      this.db.prepare(`
        UPDATE sessions SET
          exit_page = ?,
          page_count = ?,
          is_bounce = 0,
          ended_at = datetime('now')
        WHERE session_id = ?
      `).run(pagePath, pageCount, sessionId);
    } else {
      // Create new session
      this.db.prepare(`
        INSERT INTO sessions (
          id, session_id, entry_page, exit_page,
          page_count, is_bounce
        ) VALUES (?, ?, ?, ?, 1, 1)
      `).run(uuidv4(), sessionId, pagePath, pagePath);
    }
  }

  updateSessionDuration(sessionId: string, duration: number): void {
    this.db.prepare(`
      UPDATE sessions SET duration = ?, ended_at = datetime('now')
      WHERE session_id = ?
    `).run(duration, sessionId);
  }

  // ============================================
  // Analytics: Queries
  // ============================================

  getStats(days: number = 30): AnalyticsStats {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);
    const dateLimitStr = dateLimit.toISOString();

    // Total pageviews
    const totalPageviews = (this.db.prepare(`
      SELECT COUNT(*) as count FROM pageviews WHERE timestamp >= ?
    `).get(dateLimitStr) as { count: number }).count;

    // Unique sessions
    const uniqueSessions = (this.db.prepare(`
      SELECT COUNT(DISTINCT session_id) as count FROM pageviews WHERE timestamp >= ?
    `).get(dateLimitStr) as { count: number }).count;

    // Average session duration
    const avgDuration = (this.db.prepare(`
      SELECT AVG(duration) as avg FROM sessions WHERE created_at >= ? AND duration IS NOT NULL
    `).get(dateLimitStr) as { avg: number | null }).avg ?? 0;

    // Bounce rate
    const bounceData = this.db.prepare(`
      SELECT
        SUM(CASE WHEN is_bounce = 1 THEN 1 ELSE 0 END) as bounces,
        COUNT(*) as total
      FROM sessions WHERE created_at >= ?
    `).get(dateLimitStr) as { bounces: number; total: number };
    const bounceRate = bounceData.total > 0 ? (bounceData.bounces / bounceData.total) * 100 : 0;

    // Top pages
    const topPages = this.db.prepare(`
      SELECT page_path as path, COUNT(*) as views
      FROM pageviews WHERE timestamp >= ?
      GROUP BY page_path
      ORDER BY views DESC
      LIMIT 10
    `).all(dateLimitStr) as Array<{ path: string; views: number }>;

    // Top referrers
    const topReferrers = this.db.prepare(`
      SELECT referrer, COUNT(*) as count
      FROM pageviews WHERE timestamp >= ? AND referrer IS NOT NULL AND referrer != ''
      GROUP BY referrer
      ORDER BY count DESC
      LIMIT 10
    `).all(dateLimitStr) as Array<{ referrer: string; count: number }>;

    return {
      totalPageviews,
      uniqueSessions,
      avgSessionDuration: avgDuration,
      bounceRate,
      topPages,
      topReferrers,
    };
  }

  getTopPages(days: number = 30, limit: number = 10): Array<{ path: string; views: number }> {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);

    return this.db.prepare(`
      SELECT page_path as path, COUNT(*) as views
      FROM pageviews WHERE timestamp >= ?
      GROUP BY page_path
      ORDER BY views DESC
      LIMIT ?
    `).all(dateLimit.toISOString(), limit) as Array<{ path: string; views: number }>;
  }

  getTopReferrers(days: number = 30, limit: number = 10): Array<{ referrer: string; count: number }> {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);

    return this.db.prepare(`
      SELECT referrer, COUNT(*) as count
      FROM pageviews WHERE timestamp >= ? AND referrer IS NOT NULL AND referrer != ''
      GROUP BY referrer
      ORDER BY count DESC
      LIMIT ?
    `).all(dateLimit.toISOString(), limit) as Array<{ referrer: string; count: number }>;
  }

  getPageviewsOverTime(days: number = 30): Array<{ date: string; views: number }> {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);

    return this.db.prepare(`
      SELECT DATE(timestamp) as date, COUNT(*) as views
      FROM pageviews WHERE timestamp >= ?
      GROUP BY DATE(timestamp)
      ORDER BY date
    `).all(dateLimit.toISOString()) as Array<{ date: string; views: number }>;
  }

  getHeatmapData(pagePath: string, interactionType: string = 'click'): Array<{
    x: number;
    y: number;
    count: number;
  }> {
    const rows = this.db.prepare(`
      SELECT coordinates, COUNT(*) as count
      FROM interactions
      WHERE page_path = ? AND interaction_type = ? AND coordinates IS NOT NULL
      GROUP BY coordinates
    `).all(pagePath, interactionType) as Array<{ coordinates: string; count: number }>;

    return rows.map(row => {
      const coords = parseJSON(row.coordinates, { x: 0, y: 0 });
      return {
        x: coords.x,
        y: coords.y,
        count: row.count,
      };
    });
  }

  /**
   * Get raw click data for heatmap visualization
   */
  getClickData(pagePath: string, dateFrom?: string, dateTo?: string, limit: number = 10000): Array<{
    coordinates: string;
    elementSelector: string | null;
    timestamp: string;
  }> {
    let query = `
      SELECT coordinates, element_selector, timestamp
      FROM interactions
      WHERE page_path = ? AND interaction_type = 'click' AND coordinates IS NOT NULL
    `;
    const params: (string | number)[] = [pagePath];

    if (dateFrom) {
      query += ' AND timestamp >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      query += ' AND timestamp <= ?';
      params.push(dateTo);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(query).all(...params) as Array<{
      coordinates: string;
      elementSelector: string | null;
      timestamp: string;
    }>;
  }

  /**
   * Get raw scroll data for scroll heatmap
   */
  getScrollData(pagePath: string, dateFrom?: string, dateTo?: string, limit: number = 10000): Array<{
    scrollDepth: number;
    timeOnPage: number | null;
    timestamp: string;
  }> {
    let query = `
      SELECT scroll_depth, time_on_page, timestamp
      FROM interactions
      WHERE page_path = ? AND interaction_type = 'scroll' AND scroll_depth IS NOT NULL
    `;
    const params: (string | number)[] = [pagePath];

    if (dateFrom) {
      query += ' AND timestamp >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      query += ' AND timestamp <= ?';
      params.push(dateTo);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    return rows.map(row => ({
      scrollDepth: row.scroll_depth as number,
      timeOnPage: row.time_on_page as number | null,
      timestamp: row.timestamp as string,
    }));
  }

  /**
   * Get session journeys with pageviews
   */
  getSessionsWithJourneys(dateFrom?: string, dateTo?: string, limit: number = 100): Array<{
    sessionId: string;
    entryPage: string;
    exitPage: string;
    pageCount: number;
    duration: number | null;
    isBounce: boolean;
    createdAt: string;
    endedAt: string | null;
    pages: Array<{ path: string; timestamp: string }>;
  }> {
    // Fetch sessions
    let sessionQuery = `
      SELECT id, session_id, entry_page, exit_page, page_count, duration, is_bounce, created_at, ended_at
      FROM sessions
      WHERE 1=1
    `;
    const sessionParams: (string | number)[] = [];

    if (dateFrom) {
      sessionQuery += ' AND created_at >= ?';
      sessionParams.push(dateFrom);
    }
    if (dateTo) {
      sessionQuery += ' AND created_at <= ?';
      sessionParams.push(dateTo);
    }

    sessionQuery += ' ORDER BY created_at DESC LIMIT ?';
    sessionParams.push(limit);

    const sessions = this.db.prepare(sessionQuery).all(...sessionParams) as Array<Record<string, unknown>>;

    if (sessions.length === 0) {
      return [];
    }

    // Fetch pageviews for these sessions
    const sessionIds = sessions.map(s => s.session_id as string);
    const placeholders = sessionIds.map(() => '?').join(',');
    const pageviews = this.db.prepare(`
      SELECT session_id, page_path, timestamp
      FROM pageviews
      WHERE session_id IN (${placeholders})
      ORDER BY session_id, timestamp ASC
    `).all(...sessionIds) as Array<Record<string, unknown>>;

    // Group pageviews by session
    const pageviewsBySession = new Map<string, Array<{ path: string; timestamp: string }>>();
    for (const pv of pageviews) {
      const sessionId = pv.session_id as string;
      if (!pageviewsBySession.has(sessionId)) {
        pageviewsBySession.set(sessionId, []);
      }
      pageviewsBySession.get(sessionId)!.push({
        path: pv.page_path as string,
        timestamp: pv.timestamp as string,
      });
    }

    // Build result
    return sessions.map(s => ({
      sessionId: s.session_id as string,
      entryPage: s.entry_page as string,
      exitPage: s.exit_page as string,
      pageCount: s.page_count as number,
      duration: s.duration as number | null,
      isBounce: Boolean(s.is_bounce),
      createdAt: s.created_at as string,
      endedAt: s.ended_at as string | null,
      pages: pageviewsBySession.get(s.session_id as string) || [],
    }));
  }

  /**
   * Get engagement metrics (avg time on page, scroll depth distribution)
   */
  getEngagementMetrics(days: number = 30): {
    avgTimeOnPage: number;
    avgScrollDepth: number;
    scrollDepthDistribution: Record<number, number>;
    exitPageCounts: Array<{ page: string; count: number }>;
  } {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);
    const dateLimitStr = dateLimit.toISOString();

    // Average time on page from exit interactions
    const avgTime = (this.db.prepare(`
      SELECT AVG(time_on_page) as avg
      FROM interactions
      WHERE timestamp >= ? AND interaction_type = 'exit' AND time_on_page IS NOT NULL
    `).get(dateLimitStr) as { avg: number | null }).avg ?? 0;

    // Average scroll depth
    const avgScroll = (this.db.prepare(`
      SELECT AVG(scroll_depth) as avg
      FROM interactions
      WHERE timestamp >= ? AND interaction_type = 'scroll' AND scroll_depth IS NOT NULL
    `).get(dateLimitStr) as { avg: number | null }).avg ?? 0;

    // Scroll depth distribution
    const scrollRows = this.db.prepare(`
      SELECT scroll_depth, COUNT(*) as count
      FROM interactions
      WHERE timestamp >= ? AND interaction_type = 'scroll' AND scroll_depth IS NOT NULL
      GROUP BY scroll_depth
    `).all(dateLimitStr) as Array<{ scroll_depth: number; count: number }>;

    const scrollDepthDistribution: Record<number, number> = {};
    for (const row of scrollRows) {
      scrollDepthDistribution[row.scroll_depth] = row.count;
    }

    // Exit page counts
    const exitPages = this.db.prepare(`
      SELECT exit_page as page, COUNT(*) as count
      FROM sessions
      WHERE created_at >= ? AND exit_page IS NOT NULL
      GROUP BY exit_page
      ORDER BY count DESC
      LIMIT 10
    `).all(dateLimitStr) as Array<{ page: string; count: number }>;

    return {
      avgTimeOnPage: avgTime,
      avgScrollDepth: avgScroll,
      scrollDepthDistribution,
      exitPageCounts: exitPages,
    };
  }

  /**
   * Get overview statistics for admin dashboard
   */
  getOverviewStats(days: number = 30): {
    totalPageviews: number;
    uniqueSessions: number;
    bounceRate: number;
    avgSessionDuration: number;
    avgPagesPerSession: number;
    deviceBreakdown: Array<{ device: string; count: number }>;
  } {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);
    const dateLimitStr = dateLimit.toISOString();

    const stats = this.getStats(days);

    // Average pages per session
    const avgPages = (this.db.prepare(`
      SELECT AVG(page_count) as avg FROM sessions WHERE created_at >= ?
    `).get(dateLimitStr) as { avg: number | null }).avg ?? 0;

    // Device breakdown
    const devices = this.db.prepare(`
      SELECT device_type as device, COUNT(*) as count
      FROM pageviews
      WHERE timestamp >= ? AND device_type IS NOT NULL
      GROUP BY device_type
      ORDER BY count DESC
    `).all(dateLimitStr) as Array<{ device: string; count: number }>;

    return {
      totalPageviews: stats.totalPageviews,
      uniqueSessions: stats.uniqueSessions,
      bounceRate: stats.bounceRate,
      avgSessionDuration: stats.avgSessionDuration,
      avgPagesPerSession: avgPages,
      deviceBreakdown: devices,
    };
  }

  getSessionJourneys(limit: number = 50): Array<{
    sessionId: string;
    entryPage: string;
    exitPage: string;
    pageCount: number;
    duration: number;
    isBounce: boolean;
  }> {
    const rows = this.db.prepare(`
      SELECT session_id, entry_page, exit_page, page_count, duration, is_bounce
      FROM sessions
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      sessionId: row.session_id as string,
      entryPage: row.entry_page as string,
      exitPage: row.exit_page as string,
      pageCount: row.page_count as number,
      duration: row.duration as number ?? 0,
      isBounce: Boolean(row.is_bounce),
    }));
  }

  // ============================================
  // Analytics: Management
  // ============================================

  clearAnalytics(type?: 'pageviews' | 'interactions' | 'sessions', beforeDate?: Date): void {
    const tables = type ? [type] : ['pageviews', 'interactions', 'sessions'];

    for (const table of tables) {
      if (beforeDate) {
        this.db.prepare(`DELETE FROM ${table} WHERE timestamp < ? OR created_at < ?`)
          .run(beforeDate.toISOString(), beforeDate.toISOString());
      } else {
        this.db.prepare(`DELETE FROM ${table}`).run();
      }
    }
  }

  getAnalyticsStorageInfo(): {
    pageviewCount: number;
    interactionCount: number;
    sessionCount: number;
    estimatedSizeKB: number;
  } {
    const pageviewCount = (this.db.prepare('SELECT COUNT(*) as count FROM pageviews').get() as { count: number }).count;
    const interactionCount = (this.db.prepare('SELECT COUNT(*) as count FROM interactions').get() as { count: number }).count;
    const sessionCount = (this.db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }).count;

    // Rough estimate: 200 bytes per pageview, 150 per interaction, 100 per session
    const estimatedSizeKB = Math.round((pageviewCount * 200 + interactionCount * 150 + sessionCount * 100) / 1024);

    return {
      pageviewCount,
      interactionCount,
      sessionCount,
      estimatedSizeKB,
    };
  }

  /**
   * Export analytics data for backup/download
   */
  exportAnalyticsData(type: 'all' | 'pageviews' | 'interactions' | 'sessions' = 'all'): {
    pageviews?: Array<Record<string, unknown>>;
    interactions?: Array<Record<string, unknown>>;
    sessions?: Array<Record<string, unknown>>;
  } {
    const data: {
      pageviews?: Array<Record<string, unknown>>;
      interactions?: Array<Record<string, unknown>>;
      sessions?: Array<Record<string, unknown>>;
    } = {};

    if (type === 'all' || type === 'pageviews') {
      data.pageviews = this.db.prepare(`
        SELECT id, page_path, referrer, country, user_agent, session_id,
               load_time, device_type, timestamp
        FROM pageviews
        ORDER BY timestamp DESC
      `).all() as Array<Record<string, unknown>>;
    }

    if (type === 'all' || type === 'interactions') {
      data.interactions = this.db.prepare(`
        SELECT id, session_id, page_path, interaction_type, element_selector,
               coordinates, scroll_depth, time_on_page, timestamp
        FROM interactions
        ORDER BY timestamp DESC
      `).all() as Array<Record<string, unknown>>;
    }

    if (type === 'all' || type === 'sessions') {
      data.sessions = this.db.prepare(`
        SELECT id, session_id, entry_page, exit_page, page_count,
               duration, is_bounce, created_at, ended_at
        FROM sessions
        ORDER BY created_at DESC
      `).all() as Array<Record<string, unknown>>;
    }

    return data;
  }
}
