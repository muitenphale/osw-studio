/**
 * SQLite Storage Adapter
 *
 * Implements StorageAdapter interface using SQLite via better-sqlite3.
 * This adapter handles the core database (osws.sqlite) for:
 * - Projects (metadata)
 * - Files and File Tree Nodes (synced project files)
 * - Sites (publish settings and configuration)
 * - Custom Templates
 * - Skills
 *
 * Site-specific databases (sites/{siteId}/site.sqlite) are ONLY created
 * when a site explicitly enables the "Database" feature for edge functions.
 * Analytics data is stored in these optional site databases.
 */

import type { Database } from 'better-sqlite3';
import { StorageAdapter } from './types';
import { Project, VirtualFile, FileTreeNode, CustomTemplate, Site } from '../types';
import { Skill } from '../skills/types';
import {
  getCoreDatabase,
  getSiteDatabase,
  closeSiteDatabase,
  deleteSiteDatabase,
  listSiteIds,
  siteExists,
  closeAllConnections
} from './sqlite-connection';
import { SiteDatabase } from './site-database';
import type { AnalyticsConfig, ComplianceConfig, SeoConfig } from '../types';

// Default configs for Site
const DEFAULT_ANALYTICS: AnalyticsConfig = {
  enabled: false,
  provider: 'builtin',
  privacyMode: true,
};

const DEFAULT_COMPLIANCE: ComplianceConfig = {
  enabled: false,
  bannerPosition: 'bottom',
  bannerStyle: 'bar',
  message: 'This site uses cookies to improve your experience.',
  acceptButtonText: 'Accept',
  declineButtonText: 'Decline',
  mode: 'opt-in',
  blockAnalytics: true,
};

const DEFAULT_SEO: SeoConfig = {};

// Migration definitions
interface Migration {
  id: string;
  up: (db: Database) => void;
}

const MIGRATIONS: Migration[] = [
  {
    id: 'initial_schema_v1',
    up: (db) => {
      // Migration tracking
      db.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      // Projects (metadata only)
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_saved_at TEXT,
          last_saved_checkpoint_id TEXT,
          settings TEXT DEFAULT '{}',
          cost_tracking TEXT DEFAULT '{}',
          preview_image TEXT,
          last_synced_at TEXT,
          server_updated_at TEXT
        )
      `);

      // Custom Templates
      db.exec(`
        CREATE TABLE IF NOT EXISTS custom_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          version TEXT,
          files TEXT DEFAULT '[]',
          directories TEXT DEFAULT '[]',
          assets TEXT DEFAULT '[]',
          metadata TEXT DEFAULT '{}',
          imported_at TEXT NOT NULL
        )
      `);

      // Skills
      db.exec(`
        CREATE TABLE IF NOT EXISTS skills (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          content TEXT NOT NULL,
          markdown TEXT NOT NULL,
          is_built_in INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      // Index for skills
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_skills_is_built_in ON skills(is_built_in)
      `);
    }
  },
  {
    id: 'add_files_and_tree_v2',
    up: (db) => {
      // Files - synced project files stored in core database
      db.exec(`
        CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          path TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('html', 'css', 'js', 'json', 'text', 'template', 'image', 'video', 'binary')),
          content TEXT,
          mime_type TEXT,
          size INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          metadata TEXT DEFAULT '{}',
          UNIQUE(project_id, path),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);

      // Index for efficient file lookups
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id)
      `);

      // File tree nodes - hierarchical structure for file explorer
      db.exec(`
        CREATE TABLE IF NOT EXISTS file_tree_nodes (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          path TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('file', 'directory')),
          parent_path TEXT,
          is_expanded INTEGER DEFAULT 0,
          metadata TEXT DEFAULT '{}',
          UNIQUE(project_id, path),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);

      // Index for efficient tree lookups
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tree_nodes_project_id ON file_tree_nodes(project_id)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tree_nodes_parent ON file_tree_nodes(project_id, parent_path)
      `);

      // Sites table - site settings and publishing info (no per-site DB)
      db.exec(`
        CREATE TABLE IF NOT EXISTS sites (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          slug TEXT,
          enabled INTEGER DEFAULT 1,
          under_construction INTEGER DEFAULT 0,
          custom_domain TEXT,
          head_scripts TEXT DEFAULT '[]',
          body_scripts TEXT DEFAULT '[]',
          cdn_links TEXT DEFAULT '[]',
          analytics TEXT DEFAULT '{}',
          seo TEXT DEFAULT '{}',
          compliance TEXT DEFAULT '{}',
          settings_version INTEGER DEFAULT 1,
          last_published_version INTEGER,
          preview_image TEXT,
          preview_updated_at TEXT,
          database_enabled INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          published_at TEXT,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);

      // Index for site lookups
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sites_project_id ON sites(project_id)
      `);
    }
  },
  {
    id: 'add_request_log_v3',
    up: (db) => {
      // Request log for tracking site traffic (server-level analytics)
      db.exec(`
        CREATE TABLE IF NOT EXISTS request_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          site_id TEXT NOT NULL,
          path TEXT NOT NULL,
          status_code INTEGER NOT NULL,
          ip_hash TEXT,
          user_agent TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      // Indexes for efficient querying
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_request_log_timestamp ON request_log(timestamp)
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_request_log_site_id ON request_log(site_id)
      `);
    }
  }
];

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

/**
 * SQLite Storage Adapter Implementation
 */
export class SQLiteAdapter implements StorageAdapter {
  private db: Database | null = null;
  private initialized = false;
  private siteDatabases = new Map<string, SiteDatabase>();

  /**
   * Initialize the adapter - sets up database and runs migrations
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    this.db = getCoreDatabase();
    await this.runMigrations();
    this.initialized = true;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    // Close all site databases
    for (const [, siteDb] of this.siteDatabases) {
      siteDb.close();
    }
    this.siteDatabases.clear();

    // Close core database via connection manager
    closeAllConnections();
    this.db = null;
    this.initialized = false;
  }

  /**
   * Get the core database, ensuring it's initialized
   */
  private getDB(): Database {
    if (!this.db) {
      throw new Error('SQLiteAdapter not initialized. Call init() first.');
    }
    return this.db;
  }

  /**
   * Get or create a SiteDatabase instance for a site with database enabled
   * This only creates the database when explicitly requested for analytics
   */
  private getOrCreateSiteDB(siteId: string): SiteDatabase {
    let siteDb = this.siteDatabases.get(siteId);
    if (!siteDb) {
      siteDb = new SiteDatabase(siteId);
      siteDb.init();
      this.siteDatabases.set(siteId, siteDb);
    }
    return siteDb;
  }

  /**
   * Enable database for a site (creates the site.sqlite file)
   * Called when user enables "Database" feature in site settings
   */
  async enableSiteDatabase(siteId: string): Promise<void> {
    const db = this.getDB();

    // Update the site record
    db.prepare('UPDATE sites SET database_enabled = 1 WHERE id = ?').run(siteId);

    // Create the site database
    this.getOrCreateSiteDB(siteId);
  }

  /**
   * Disable database for a site (deletes the site.sqlite file)
   */
  async disableSiteDatabase(siteId: string): Promise<void> {
    const db = this.getDB();

    // Update the site record
    db.prepare('UPDATE sites SET database_enabled = 0 WHERE id = ?').run(siteId);

    // Close and delete the site database
    const siteDb = this.siteDatabases.get(siteId);
    if (siteDb) {
      siteDb.close();
      this.siteDatabases.delete(siteId);
    }

    if (siteExists(siteId)) {
      deleteSiteDatabase(siteId);
    }
  }

  /**
   * Run pending migrations
   */
  private async runMigrations(): Promise<void> {
    const db = this.getDB();

    // Create migrations table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Get applied migrations
    const rows = db.prepare('SELECT id FROM _migrations').all() as Array<{ id: string }>;
    const applied = new Set(rows.map((row) => row.id));

    // Run pending migrations in a transaction
    const runMigration = db.transaction((migration: Migration) => {
      if (!applied.has(migration.id)) {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (id) VALUES (?)').run(migration.id);
      }
    });

    for (const migration of MIGRATIONS) {
      runMigration(migration);
    }
  }

  // ============================================
  // Projects
  // ============================================

  async createProject(project: Project): Promise<void> {
    const db = this.getDB();
    const stmt = db.prepare(`
      INSERT INTO projects (
        id, name, description, created_at, updated_at,
        last_saved_at, last_saved_checkpoint_id, settings,
        cost_tracking, preview_image, last_synced_at, server_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      project.id,
      project.name,
      project.description ?? null,
      toISOStringRequired(project.createdAt),
      toISOStringRequired(project.updatedAt),
      toISOString(project.lastSavedAt),
      project.lastSavedCheckpointId ?? null,
      JSON.stringify(project.settings ?? {}),
      JSON.stringify(project.costTracking ?? {}),
      project.previewImage ?? null,
      toISOString(project.lastSyncedAt),
      toISOString(project.serverUpdatedAt)
    );
  }

  async getProject(id: string): Promise<Project | null> {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.rowToProject(row);
  }

  async updateProject(project: Project): Promise<void> {
    const db = this.getDB();
    const stmt = db.prepare(`
      UPDATE projects SET
        name = ?,
        description = ?,
        updated_at = ?,
        last_saved_at = ?,
        last_saved_checkpoint_id = ?,
        settings = ?,
        cost_tracking = ?,
        preview_image = ?,
        last_synced_at = ?,
        server_updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      project.name,
      project.description ?? null,
      toISOStringRequired(project.updatedAt),
      toISOString(project.lastSavedAt),
      project.lastSavedCheckpointId ?? null,
      JSON.stringify(project.settings ?? {}),
      JSON.stringify(project.costTracking ?? {}),
      project.previewImage ?? null,
      toISOString(project.lastSyncedAt),
      toISOString(project.serverUpdatedAt),
      project.id
    );
  }

  async deleteProject(id: string): Promise<void> {
    const db = this.getDB();

    // Delete from core database
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);

    // Delete site database if it exists
    if (siteExists(id)) {
      this.siteDatabases.delete(id);
      deleteSiteDatabase(id);
    }
  }

  async listProjects(fields?: string[]): Promise<Project[]> {
    const db = this.getDB();

    // If specific fields requested, build a selective query
    // For now, always return full projects (field filtering can be added later)
    const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Record<string, unknown>[];

    return rows.map(row => this.rowToProject(row));
  }

  /**
   * Convert a database row to a Project object
   */
  private rowToProject(row: Record<string, unknown>): Project {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      createdAt: parseDate(row.created_at as string),
      updatedAt: parseDate(row.updated_at as string),
      lastSavedAt: row.last_saved_at ? parseDate(row.last_saved_at as string) : undefined,
      lastSavedCheckpointId: row.last_saved_checkpoint_id as string | undefined,
      settings: parseJSON(row.settings as string, {}),
      costTracking: parseJSON(row.cost_tracking as string, undefined),
      previewImage: row.preview_image as string | undefined,
      lastSyncedAt: row.last_synced_at ? parseDate(row.last_synced_at as string) : undefined,
      serverUpdatedAt: row.server_updated_at ? parseDate(row.server_updated_at as string) : undefined,
    };
  }

  // ============================================
  // Files (stored in core database)
  // ============================================

  async createFile(file: VirtualFile): Promise<void> {
    const db = this.getDB();

    // Handle ArrayBuffer content (binary files)
    // Also handle {} from JSON-serialized ArrayBuffer (becomes empty object during sync)
    let content: string;
    if (file.content instanceof ArrayBuffer) {
      content = Buffer.from(file.content).toString('base64');
    } else if (typeof file.content === 'string') {
      content = file.content;
    } else {
      content = '';
    }

    const stmt = db.prepare(`
      INSERT INTO files (
        id, project_id, path, name, type, content,
        mime_type, size, created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      file.id,
      file.projectId,
      file.path,
      file.name,
      file.type,
      content,
      file.mimeType ?? null,
      file.size ?? 0,
      toISOStringRequired(file.createdAt),
      toISOStringRequired(file.updatedAt),
      JSON.stringify(file.metadata ?? {})
    );
  }

  async getFile(projectId: string, path: string): Promise<VirtualFile | null> {
    const db = this.getDB();
    const row = db.prepare(
      'SELECT * FROM files WHERE project_id = ? AND path = ?'
    ).get(projectId, path) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToFile(row, projectId);
  }

  async updateFile(file: VirtualFile): Promise<void> {
    const db = this.getDB();

    // Handle ArrayBuffer content
    // Also handle {} from JSON-serialized ArrayBuffer (becomes empty object during sync)
    let content: string;
    if (file.content instanceof ArrayBuffer) {
      content = Buffer.from(file.content).toString('base64');
    } else if (typeof file.content === 'string') {
      content = file.content;
    } else {
      content = '';
    }

    const stmt = db.prepare(`
      UPDATE files SET
        name = ?, type = ?, content = ?, mime_type = ?,
        size = ?, updated_at = ?, metadata = ?
      WHERE project_id = ? AND path = ?
    `);

    stmt.run(
      file.name,
      file.type,
      content,
      file.mimeType ?? null,
      file.size ?? 0,
      toISOStringRequired(file.updatedAt),
      JSON.stringify(file.metadata ?? {}),
      file.projectId,
      file.path
    );
  }

  async deleteFile(projectId: string, path: string): Promise<void> {
    const db = this.getDB();
    db.prepare('DELETE FROM files WHERE project_id = ? AND path = ?').run(projectId, path);
  }

  async listFiles(projectId: string): Promise<VirtualFile[]> {
    const db = this.getDB();
    const rows = db.prepare(
      'SELECT * FROM files WHERE project_id = ? ORDER BY path'
    ).all(projectId) as Record<string, unknown>[];

    return rows.map(row => this.rowToFile(row, projectId));
  }

  async deleteProjectFiles(projectId: string): Promise<void> {
    const db = this.getDB();
    db.prepare('DELETE FROM files WHERE project_id = ?').run(projectId);
  }

  private rowToFile(row: Record<string, unknown>, projectId: string): VirtualFile {
    const type = row.type as VirtualFile['type'];
    const rawContent = row.content as string;

    // Binary file types (image, video) are stored as base64 - convert back to ArrayBuffer
    let content: string | ArrayBuffer = rawContent;
    if ((type === 'image' || type === 'video') && rawContent) {
      try {
        const buffer = Buffer.from(rawContent, 'base64');
        content = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      } catch {
        // If conversion fails, keep as string
        content = rawContent;
      }
    }

    return {
      id: row.id as string,
      projectId,
      path: row.path as string,
      name: row.name as string,
      type,
      content,
      mimeType: row.mime_type as string,
      size: row.size as number,
      createdAt: parseDate(row.created_at as string),
      updatedAt: parseDate(row.updated_at as string),
      metadata: parseJSON(row.metadata as string, {}),
    };
  }

  // ============================================
  // File Tree (stored in core database)
  // ============================================

  async createTreeNode(node: FileTreeNode): Promise<void> {
    const db = this.getDB();
    const stmt = db.prepare(`
      INSERT INTO file_tree_nodes (
        id, project_id, path, name, type, parent_path, is_expanded, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      node.id,
      node.projectId,
      node.path,
      node.name,
      node.type,
      node.parentPath ?? null,
      node.isExpanded ? 1 : 0,
      JSON.stringify(node.metadata ?? {})
    );
  }

  async getTreeNode(projectId: string, path: string): Promise<FileTreeNode | null> {
    const db = this.getDB();
    const row = db.prepare(
      'SELECT * FROM file_tree_nodes WHERE project_id = ? AND path = ?'
    ).get(projectId, path) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToTreeNode(row, projectId);
  }

  async updateTreeNode(node: FileTreeNode): Promise<void> {
    const db = this.getDB();
    const stmt = db.prepare(`
      UPDATE file_tree_nodes SET
        name = ?, type = ?, parent_path = ?, is_expanded = ?, metadata = ?
      WHERE project_id = ? AND path = ?
    `);

    stmt.run(
      node.name,
      node.type,
      node.parentPath ?? null,
      node.isExpanded ? 1 : 0,
      JSON.stringify(node.metadata ?? {}),
      node.projectId,
      node.path
    );
  }

  async deleteTreeNode(projectId: string, path: string): Promise<void> {
    const db = this.getDB();
    db.prepare('DELETE FROM file_tree_nodes WHERE project_id = ? AND path = ?').run(projectId, path);
  }

  async getChildNodes(projectId: string, parentPath: string | null): Promise<FileTreeNode[]> {
    const db = this.getDB();
    let rows: Record<string, unknown>[];

    if (parentPath === null) {
      rows = db.prepare(
        'SELECT * FROM file_tree_nodes WHERE project_id = ? AND parent_path IS NULL ORDER BY type DESC, name'
      ).all(projectId) as Record<string, unknown>[];
    } else {
      rows = db.prepare(
        'SELECT * FROM file_tree_nodes WHERE project_id = ? AND parent_path = ? ORDER BY type DESC, name'
      ).all(projectId, parentPath) as Record<string, unknown>[];
    }

    return rows.map(row => this.rowToTreeNode(row, projectId));
  }

  async getAllTreeNodes(projectId: string): Promise<FileTreeNode[]> {
    const db = this.getDB();
    const rows = db.prepare(
      'SELECT * FROM file_tree_nodes WHERE project_id = ? ORDER BY path'
    ).all(projectId) as Record<string, unknown>[];

    return rows.map(row => this.rowToTreeNode(row, projectId));
  }

  private rowToTreeNode(row: Record<string, unknown>, projectId: string): FileTreeNode {
    return {
      id: row.id as string,
      projectId,
      path: row.path as string,
      name: row.name as string,
      type: row.type as 'file' | 'directory',
      parentPath: row.parent_path as string | null,
      isExpanded: Boolean(row.is_expanded),
      metadata: parseJSON(row.metadata as string, {}),
    };
  }

  // ============================================
  // Custom Templates (core database)
  // ============================================

  async saveCustomTemplate(template: CustomTemplate): Promise<void> {
    const db = this.getDB();

    // Check if exists for upsert
    const existing = db.prepare('SELECT id FROM custom_templates WHERE id = ?').get(template.id);

    if (existing) {
      const stmt = db.prepare(`
        UPDATE custom_templates SET
          name = ?, description = ?, version = ?,
          files = ?, directories = ?, assets = ?,
          metadata = ?
        WHERE id = ?
      `);
      stmt.run(
        template.name,
        template.description,
        template.version,
        JSON.stringify(template.files ?? []),
        JSON.stringify(template.directories ?? []),
        JSON.stringify(template.assets ?? []),
        JSON.stringify(template.metadata ?? {}),
        template.id
      );
    } else {
      const stmt = db.prepare(`
        INSERT INTO custom_templates (
          id, name, description, version,
          files, directories, assets, metadata, imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        template.id,
        template.name,
        template.description,
        template.version,
        JSON.stringify(template.files ?? []),
        JSON.stringify(template.directories ?? []),
        JSON.stringify(template.assets ?? []),
        JSON.stringify(template.metadata ?? {}),
        toISOStringRequired(template.importedAt)
      );
    }
  }

  async getCustomTemplate(id: string): Promise<CustomTemplate | null> {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM custom_templates WHERE id = ?').get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.rowToTemplate(row);
  }

  async getAllCustomTemplates(): Promise<CustomTemplate[]> {
    const db = this.getDB();
    const rows = db.prepare('SELECT * FROM custom_templates ORDER BY imported_at DESC').all() as Record<string, unknown>[];

    return rows.map(row => this.rowToTemplate(row));
  }

  async deleteCustomTemplate(id: string): Promise<void> {
    const db = this.getDB();
    db.prepare('DELETE FROM custom_templates WHERE id = ?').run(id);
  }

  private rowToTemplate(row: Record<string, unknown>): CustomTemplate {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      version: row.version as string,
      files: parseJSON(row.files as string, []),
      directories: parseJSON(row.directories as string, []),
      assets: parseJSON(row.assets as string, []),
      metadata: parseJSON(row.metadata as string, { license: 'personal' }),
      importedAt: parseDate(row.imported_at as string),
    };
  }

  // ============================================
  // Skills (core database)
  // ============================================

  async createSkill(skill: Omit<Skill, 'isBuiltIn'>): Promise<void> {
    const db = this.getDB();
    const stmt = db.prepare(`
      INSERT INTO skills (
        id, name, description, content, markdown,
        is_built_in, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `);

    stmt.run(
      skill.id,
      skill.name,
      skill.description,
      skill.content,
      skill.markdown,
      toISOStringRequired(skill.createdAt),
      toISOStringRequired(skill.updatedAt)
    );
  }

  async getSkill(id: string): Promise<Skill | null> {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.rowToSkill(row);
  }

  async updateSkill(skill: Omit<Skill, 'isBuiltIn'>): Promise<void> {
    const db = this.getDB();
    const stmt = db.prepare(`
      UPDATE skills SET
        name = ?, description = ?, content = ?,
        markdown = ?, updated_at = ?
      WHERE id = ? AND is_built_in = 0
    `);

    stmt.run(
      skill.name,
      skill.description,
      skill.content,
      skill.markdown,
      toISOStringRequired(skill.updatedAt),
      skill.id
    );
  }

  async deleteSkill(id: string): Promise<void> {
    const db = this.getDB();
    // Only delete non-built-in skills
    db.prepare('DELETE FROM skills WHERE id = ? AND is_built_in = 0').run(id);
  }

  async getAllSkills(): Promise<Skill[]> {
    const db = this.getDB();
    const rows = db.prepare('SELECT * FROM skills ORDER BY name').all() as Record<string, unknown>[];

    return rows.map(row => this.rowToSkill(row));
  }

  private rowToSkill(row: Record<string, unknown>): Skill {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      content: row.content as string,
      markdown: row.markdown as string,
      isBuiltIn: Boolean(row.is_built_in),
      createdAt: parseDate(row.created_at as string),
      updatedAt: parseDate(row.updated_at as string),
    };
  }

  // ============================================
  // Sites (stored in core database)
  // ============================================

  async createSite(site: Site): Promise<void> {
    const db = this.getDB();
    const stmt = db.prepare(`
      INSERT INTO sites (
        id, project_id, name, slug, enabled, under_construction,
        custom_domain, head_scripts, body_scripts, cdn_links,
        analytics, seo, compliance, settings_version,
        last_published_version, preview_image, preview_updated_at,
        database_enabled, created_at, updated_at, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      site.id,
      site.projectId,
      site.name,
      site.slug ?? null,
      site.enabled ? 1 : 0,
      site.underConstruction ? 1 : 0,
      site.customDomain ?? null,
      JSON.stringify(site.headScripts ?? []),
      JSON.stringify(site.bodyScripts ?? []),
      JSON.stringify(site.cdnLinks ?? []),
      JSON.stringify(site.analytics ?? DEFAULT_ANALYTICS),
      JSON.stringify(site.seo ?? DEFAULT_SEO),
      JSON.stringify(site.compliance ?? DEFAULT_COMPLIANCE),
      site.settingsVersion ?? 1,
      site.lastPublishedVersion ?? null,
      site.previewImage ?? null,
      toISOString(site.previewUpdatedAt),
      site.databaseEnabled ? 1 : 0,
      toISOStringRequired(site.createdAt),
      toISOStringRequired(site.updatedAt),
      toISOString(site.publishedAt)
    );
  }

  async getSite(siteId: string): Promise<Site | null> {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToSite(row);
  }

  async listSites(): Promise<Site[]> {
    const db = this.getDB();
    const rows = db.prepare('SELECT * FROM sites ORDER BY updated_at DESC').all() as Record<string, unknown>[];

    return rows.map(row => this.rowToSite(row));
  }

  async listSitesByProject(projectId: string): Promise<Site[]> {
    const db = this.getDB();
    const rows = db.prepare('SELECT * FROM sites WHERE project_id = ? ORDER BY created_at').all(projectId) as Record<string, unknown>[];

    return rows.map(row => this.rowToSite(row));
  }

  async updateSite(site: Site): Promise<void> {
    const db = this.getDB();
    const stmt = db.prepare(`
      UPDATE sites SET
        name = ?, slug = ?, enabled = ?, under_construction = ?,
        custom_domain = ?, head_scripts = ?, body_scripts = ?, cdn_links = ?,
        analytics = ?, seo = ?, compliance = ?, settings_version = ?,
        last_published_version = ?, preview_image = ?, preview_updated_at = ?,
        database_enabled = ?, updated_at = ?, published_at = ?
      WHERE id = ?
    `);

    stmt.run(
      site.name,
      site.slug ?? null,
      site.enabled ? 1 : 0,
      site.underConstruction ? 1 : 0,
      site.customDomain ?? null,
      JSON.stringify(site.headScripts ?? []),
      JSON.stringify(site.bodyScripts ?? []),
      JSON.stringify(site.cdnLinks ?? []),
      JSON.stringify(site.analytics ?? DEFAULT_ANALYTICS),
      JSON.stringify(site.seo ?? DEFAULT_SEO),
      JSON.stringify(site.compliance ?? DEFAULT_COMPLIANCE),
      site.settingsVersion ?? 1,
      site.lastPublishedVersion ?? null,
      site.previewImage ?? null,
      toISOString(site.previewUpdatedAt),
      site.databaseEnabled ? 1 : 0,
      toISOStringRequired(site.updatedAt),
      toISOString(site.publishedAt),
      site.id
    );
  }

  async deleteSite(siteId: string): Promise<void> {
    const db = this.getDB();

    // Delete from core database
    db.prepare('DELETE FROM sites WHERE id = ?').run(siteId);

    // If site had database enabled, also delete the site database file
    const siteDb = this.siteDatabases.get(siteId);
    if (siteDb) {
      siteDb.close();
      this.siteDatabases.delete(siteId);
    }

    if (siteExists(siteId)) {
      deleteSiteDatabase(siteId);
    }
  }

  private rowToSite(row: Record<string, unknown>): Site {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      name: row.name as string,
      slug: row.slug as string | undefined,
      enabled: Boolean(row.enabled),
      underConstruction: Boolean(row.under_construction),
      customDomain: row.custom_domain as string | undefined,
      headScripts: parseJSON(row.head_scripts as string, []),
      bodyScripts: parseJSON(row.body_scripts as string, []),
      cdnLinks: parseJSON(row.cdn_links as string, []),
      analytics: parseJSON(row.analytics as string, DEFAULT_ANALYTICS),
      seo: parseJSON(row.seo as string, DEFAULT_SEO),
      compliance: parseJSON(row.compliance as string, DEFAULT_COMPLIANCE),
      settingsVersion: row.settings_version as number ?? 1,
      lastPublishedVersion: row.last_published_version as number | undefined,
      previewImage: row.preview_image as string | undefined,
      previewUpdatedAt: row.preview_updated_at ? parseDate(row.preview_updated_at as string) : undefined,
      databaseEnabled: Boolean(row.database_enabled),
      createdAt: parseDate(row.created_at as string),
      updatedAt: parseDate(row.updated_at as string),
      publishedAt: row.published_at ? parseDate(row.published_at as string) : undefined,
    };
  }

  // ============================================
  // Analytics Access (via SiteDatabase)
  // ============================================

  /**
   * Get the SiteDatabase for analytics operations
   * Only returns a database if the site has database enabled
   * This allows API routes to access analytics methods
   */
  getSiteDatabaseForAnalytics(siteId: string): SiteDatabase | null {
    // First check if the site exists and has database enabled
    const site = this.getSiteSync(siteId);
    if (!site || !site.databaseEnabled) return null;

    // Get or create the site database (since database is enabled)
    return this.getOrCreateSiteDB(siteId);
  }

  /**
   * Synchronous version of getSite for internal use
   */
  private getSiteSync(siteId: string): Site | null {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToSite(row);
  }
}
