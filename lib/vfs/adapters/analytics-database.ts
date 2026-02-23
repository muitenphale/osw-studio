/**
 * Analytics Database Manager
 *
 * Manages the analytics portion of per-deployment SQLite databases containing:
 * - Pageviews
 * - Interactions (clicks, scrolls, exits)
 * - Sessions
 *
 * Each deployment gets its own analytics database at deployments/{deploymentId}/analytics.sqlite
 */

import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { getAnalyticsDatabaseConnection, closeAnalyticsDatabase } from './sqlite-connection';

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
 * Per-deployment analytics database manager
 */
export class AnalyticsDatabase {
  private db: Database;
  private deploymentId: string;
  private initialized = false;

  constructor(deploymentId: string) {
    this.deploymentId = deploymentId;
    this.db = getAnalyticsDatabaseConnection(deploymentId);
  }

  /**
   * Initialize the database schema
   */
  init(): void {
    if (this.initialized) return;

    // Pageviews
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

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_pageviews_timestamp ON pageviews(timestamp)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_pageviews_session_id ON pageviews(session_id)`);

    // Interactions
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

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_interactions_page_path ON interactions(page_path)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON interactions(timestamp)`);

    // Sessions
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

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at)`);

    this.initialized = true;
  }

  /**
   * Close the database connection
   */
  close(): void {
    closeAnalyticsDatabase(this.deploymentId);
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
    const existing = this.db.prepare(
      'SELECT * FROM sessions WHERE session_id = ?'
    ).get(sessionId) as Record<string, unknown> | undefined;

    if (existing) {
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

    const totalPageviews = (this.db.prepare(`
      SELECT COUNT(*) as count FROM pageviews WHERE timestamp >= ?
    `).get(dateLimitStr) as { count: number }).count;

    const uniqueSessions = (this.db.prepare(`
      SELECT COUNT(DISTINCT session_id) as count FROM pageviews WHERE timestamp >= ?
    `).get(dateLimitStr) as { count: number }).count;

    const avgDuration = (this.db.prepare(`
      SELECT AVG(duration) as avg FROM sessions WHERE created_at >= ? AND duration IS NOT NULL
    `).get(dateLimitStr) as { avg: number | null }).avg ?? 0;

    const bounceData = this.db.prepare(`
      SELECT
        SUM(CASE WHEN is_bounce = 1 THEN 1 ELSE 0 END) as bounces,
        COUNT(*) as total
      FROM sessions WHERE created_at >= ?
    `).get(dateLimitStr) as { bounces: number; total: number };
    const bounceRate = bounceData.total > 0 ? (bounceData.bounces / bounceData.total) * 100 : 0;

    const topPages = this.db.prepare(`
      SELECT page_path as path, COUNT(*) as views
      FROM pageviews WHERE timestamp >= ?
      GROUP BY page_path
      ORDER BY views DESC
      LIMIT 10
    `).all(dateLimitStr) as Array<{ path: string; views: number }>;

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

    const sessionIds = sessions.map(s => s.session_id as string);
    const placeholders = sessionIds.map(() => '?').join(',');
    const pageviews = this.db.prepare(`
      SELECT session_id, page_path, timestamp
      FROM pageviews
      WHERE session_id IN (${placeholders})
      ORDER BY session_id, timestamp ASC
    `).all(...sessionIds) as Array<Record<string, unknown>>;

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

  getEngagementMetrics(days: number = 30): {
    avgTimeOnPage: number;
    avgScrollDepth: number;
    scrollDepthDistribution: Record<number, number>;
    exitPageCounts: Array<{ page: string; count: number }>;
  } {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);
    const dateLimitStr = dateLimit.toISOString();

    const avgTime = (this.db.prepare(`
      SELECT AVG(time_on_page) as avg
      FROM interactions
      WHERE timestamp >= ? AND interaction_type = 'exit' AND time_on_page IS NOT NULL
    `).get(dateLimitStr) as { avg: number | null }).avg ?? 0;

    const avgScroll = (this.db.prepare(`
      SELECT AVG(scroll_depth) as avg
      FROM interactions
      WHERE timestamp >= ? AND interaction_type = 'scroll' AND scroll_depth IS NOT NULL
    `).get(dateLimitStr) as { avg: number | null }).avg ?? 0;

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

    const avgPages = (this.db.prepare(`
      SELECT AVG(page_count) as avg FROM sessions WHERE created_at >= ?
    `).get(dateLimitStr) as { avg: number | null }).avg ?? 0;

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

    const estimatedSizeKB = Math.round((pageviewCount * 200 + interactionCount * 150 + sessionCount * 100) / 1024);

    return {
      pageviewCount,
      interactionCount,
      sessionCount,
      estimatedSizeKB,
    };
  }

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
