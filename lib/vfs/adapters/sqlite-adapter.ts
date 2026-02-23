/**
 * SQLite Storage Adapter
 *
 * Implements StorageAdapter interface using SQLite via better-sqlite3.
 * This adapter handles the core database (osws.sqlite) for:
 * - Projects (metadata)
 * - Files and File Tree Nodes (synced project files)
 * - Deployments (publish settings and configuration)
 * - Custom Templates
 * - Skills
 *
 * Deployment-specific databases (deployments/{deploymentId}/deployment.sqlite) are ONLY created
 * when a deployment explicitly enables the "Database" feature for edge functions.
 * Analytics data is stored in these optional deployment databases.
 */

import type { Database } from 'better-sqlite3';
import { StorageAdapter } from './types';
import { Project, VirtualFile, FileTreeNode, CustomTemplate, Deployment, EdgeFunction, ServerFunction, Secret, ScheduledFunction } from '../types';
import { Skill } from '../skills/types';
import {
  getCoreDatabase,
  getDeploymentDatabase,
  closeDeploymentDatabase,
  deleteDeploymentDatabase,
  deleteProjectDatabase,
  listDeploymentIds,
  deploymentExists,
  closeAllConnections
} from './sqlite-connection';
import { DeploymentDatabase } from './deployment-database';
import { AnalyticsDatabase } from './analytics-database';
import { ProjectDatabase } from './project-database';
import type { AnalyticsConfig, ComplianceConfig, SeoConfig } from '../types';

// Default configs for Deployment
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

      // Sites table - deployment settings and publishing info (renamed to deployments in v4 migration)
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

      // Index for deployment lookups (renamed in v4 migration)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sites_project_id ON sites(project_id)
      `);
    }
  },
  {
    id: 'add_request_log_v3',
    up: (db) => {
      // Request log for tracking deployment traffic (server-level analytics)
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
  },
  {
    id: 'rename_sites_to_deployments_v4',
    up: (db) => {
      // Rename sites table to deployments
      // NOTE: request_log.site_id was intentionally NOT renamed to deployment_id because
      // SQLite ALTER TABLE does not support column renames without full table recreation.
      // The column is correctly aliased as `deploymentId` in TypeScript queries (see request-logger.ts).
      db.exec(`ALTER TABLE sites RENAME TO deployments`);

      // Drop old index and create new one with updated name
      db.exec(`DROP INDEX IF EXISTS idx_sites_project_id`);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_deployments_project_id ON deployments(project_id)
      `);
    }
  },
  {
    id: 'add_project_server_features_v5',
    up: (db) => {
      // Project-scoped edge functions
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_edge_functions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          code TEXT NOT NULL,
          method TEXT NOT NULL DEFAULT 'GET' CHECK(method IN ('GET', 'POST', 'PUT', 'DELETE', 'ANY')),
          enabled INTEGER DEFAULT 1,
          timeout_ms INTEGER DEFAULT 5000,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(project_id, name),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_project_edge_functions_project_id ON project_edge_functions(project_id)`);

      // Project-scoped server functions
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_server_functions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          code TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(project_id, name),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_project_server_functions_project_id ON project_server_functions(project_id)`);

      // Project-scoped secrets
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_secrets (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          has_value INTEGER DEFAULT 0,
          value TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(project_id, name),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_project_secrets_project_id ON project_secrets(project_id)`);

      // Project-scoped scheduled functions
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_scheduled_functions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          function_id TEXT NOT NULL,
          cron_expression TEXT NOT NULL,
          timezone TEXT DEFAULT 'UTC',
          config TEXT DEFAULT '{}',
          enabled INTEGER DEFAULT 1,
          last_run_at TEXT,
          next_run_at TEXT,
          last_status TEXT,
          last_error TEXT,
          last_duration_ms INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(project_id, name),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_project_scheduled_functions_project_id ON project_scheduled_functions(project_id)`);
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
  private deploymentDatabases = new Map<string, DeploymentDatabase>();
  private analyticsDatabases = new Map<string, AnalyticsDatabase>();
  private projectDatabases = new Map<string, ProjectDatabase>();

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
    // Close all deployment databases
    for (const [, deploymentDb] of this.deploymentDatabases) {
      deploymentDb.close();
    }
    this.deploymentDatabases.clear();

    // Close all analytics databases
    for (const [, analyticsDb] of this.analyticsDatabases) {
      analyticsDb.close();
    }
    this.analyticsDatabases.clear();

    // Close all project databases
    for (const [, projectDb] of this.projectDatabases) {
      projectDb.close();
    }
    this.projectDatabases.clear();

    // Close core database via connection manager
    closeAllConnections();
    this.db = null;
    this.initialized = false;
  }

  /**
   * Get or create a ProjectDatabase instance for a project
   */
  getProjectDatabase(projectId: string): ProjectDatabase {
    let projectDb = this.projectDatabases.get(projectId);
    if (!projectDb) {
      projectDb = new ProjectDatabase(projectId);
      projectDb.init();
      this.projectDatabases.set(projectId, projectDb);
    }
    return projectDb;
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
   * Get or create a DeploymentDatabase instance for a deployment with database enabled
   * This only creates the database when explicitly requested for analytics
   */
  private getOrCreateDeploymentDB(deploymentId: string): DeploymentDatabase {
    let deploymentDb = this.deploymentDatabases.get(deploymentId);
    if (!deploymentDb) {
      deploymentDb = new DeploymentDatabase(deploymentId);
      deploymentDb.init();
      this.deploymentDatabases.set(deploymentId, deploymentDb);
    }
    return deploymentDb;
  }

  // ============================================
  // Edge Functions (Project-scoped)
  // ============================================

  async createEdgeFunction(fn: EdgeFunction): Promise<void> {
    const db = this.getDB();
    db.prepare(`
      INSERT INTO project_edge_functions (id, project_id, name, description, code, method, enabled, timeout_ms, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(fn.id, fn.projectId, fn.name, fn.description || null, fn.code, fn.method, fn.enabled ? 1 : 0, fn.timeoutMs, toISOStringRequired(fn.createdAt), toISOStringRequired(fn.updatedAt));
  }

  async getEdgeFunction(id: string): Promise<EdgeFunction | null> {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM project_edge_functions WHERE id = ?').get(id) as any;
    return row ? this.rowToEdgeFunction(row) : null;
  }

  async listEdgeFunctions(projectId: string): Promise<EdgeFunction[]> {
    const db = this.getDB();
    const rows = db.prepare('SELECT * FROM project_edge_functions WHERE project_id = ? ORDER BY name').all(projectId) as any[];
    return rows.map((row) => this.rowToEdgeFunction(row));
  }

  async updateEdgeFunction(fn: EdgeFunction): Promise<void> {
    const db = this.getDB();
    db.prepare(`
      UPDATE project_edge_functions SET name = ?, description = ?, code = ?, method = ?, enabled = ?, timeout_ms = ?, updated_at = ?
      WHERE id = ?
    `).run(fn.name, fn.description || null, fn.code, fn.method, fn.enabled ? 1 : 0, fn.timeoutMs, toISOStringRequired(fn.updatedAt), fn.id);
  }

  async deleteEdgeFunction(id: string): Promise<void> {
    const db = this.getDB();
    db.prepare('DELETE FROM project_edge_functions WHERE id = ?').run(id);
  }

  private rowToEdgeFunction(row: any): EdgeFunction {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description || undefined,
      code: row.code,
      method: row.method as EdgeFunction['method'],
      enabled: row.enabled === 1,
      timeoutMs: row.timeout_ms,
      createdAt: parseDate(row.created_at),
      updatedAt: parseDate(row.updated_at),
    };
  }

  // ============================================
  // Server Functions (Project-scoped)
  // ============================================

  async createServerFunction(fn: ServerFunction): Promise<void> {
    const db = this.getDB();
    db.prepare(`
      INSERT INTO project_server_functions (id, project_id, name, description, code, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(fn.id, fn.projectId, fn.name, fn.description || null, fn.code, fn.enabled ? 1 : 0, toISOStringRequired(fn.createdAt), toISOStringRequired(fn.updatedAt));
  }

  async getServerFunction(id: string): Promise<ServerFunction | null> {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM project_server_functions WHERE id = ?').get(id) as any;
    return row ? this.rowToServerFunction(row) : null;
  }

  async listServerFunctions(projectId: string): Promise<ServerFunction[]> {
    const db = this.getDB();
    const rows = db.prepare('SELECT * FROM project_server_functions WHERE project_id = ? ORDER BY name').all(projectId) as any[];
    return rows.map((row) => this.rowToServerFunction(row));
  }

  async updateServerFunction(fn: ServerFunction): Promise<void> {
    const db = this.getDB();
    db.prepare(`
      UPDATE project_server_functions SET name = ?, description = ?, code = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `).run(fn.name, fn.description || null, fn.code, fn.enabled ? 1 : 0, toISOStringRequired(fn.updatedAt), fn.id);
  }

  async deleteServerFunction(id: string): Promise<void> {
    const db = this.getDB();
    db.prepare('DELETE FROM project_server_functions WHERE id = ?').run(id);
  }

  private rowToServerFunction(row: any): ServerFunction {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description || undefined,
      code: row.code,
      enabled: row.enabled === 1,
      createdAt: parseDate(row.created_at),
      updatedAt: parseDate(row.updated_at),
    };
  }

  // ============================================
  // Secrets (Project-scoped)
  // ============================================

  async createSecret(secret: Secret): Promise<void> {
    const db = this.getDB();
    db.prepare(`
      INSERT INTO project_secrets (id, project_id, name, description, has_value, value, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(secret.id, secret.projectId, secret.name, secret.description || null, secret.hasValue ? 1 : 0, secret.value || null, toISOStringRequired(secret.createdAt), toISOStringRequired(secret.updatedAt));
  }

  async getSecret(id: string): Promise<Secret | null> {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM project_secrets WHERE id = ?').get(id) as any;
    return row ? this.rowToSecret(row) : null;
  }

  async listSecrets(projectId: string): Promise<Secret[]> {
    const db = this.getDB();
    const rows = db.prepare('SELECT * FROM project_secrets WHERE project_id = ? ORDER BY name').all(projectId) as any[];
    return rows.map((row) => this.rowToSecret(row));
  }

  async updateSecret(secret: Secret): Promise<void> {
    const db = this.getDB();
    db.prepare(`
      UPDATE project_secrets SET name = ?, description = ?, has_value = ?, value = ?, updated_at = ?
      WHERE id = ?
    `).run(secret.name, secret.description || null, secret.hasValue ? 1 : 0, secret.value || null, toISOStringRequired(secret.updatedAt), secret.id);
  }

  async deleteSecret(id: string): Promise<void> {
    const db = this.getDB();
    db.prepare('DELETE FROM project_secrets WHERE id = ?').run(id);
  }

  private rowToSecret(row: any): Secret {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description || undefined,
      hasValue: row.has_value === 1,
      value: row.value || undefined,
      createdAt: parseDate(row.created_at),
      updatedAt: parseDate(row.updated_at),
    };
  }

  // ============================================
  // Scheduled Functions (Project-scoped)
  // ============================================

  async createScheduledFunction(fn: ScheduledFunction): Promise<void> {
    const db = this.getDB();
    db.prepare(`
      INSERT INTO project_scheduled_functions (id, project_id, name, description, function_id, cron_expression, timezone, config, enabled, last_run_at, next_run_at, last_status, last_error, last_duration_ms, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(fn.id, fn.projectId, fn.name, fn.description || null, fn.functionId, fn.cronExpression, fn.timezone, JSON.stringify(fn.config), fn.enabled ? 1 : 0, toISOString(fn.lastRunAt ?? null), toISOString(fn.nextRunAt ?? null), fn.lastStatus || null, fn.lastError || null, fn.lastDurationMs ?? null, toISOStringRequired(fn.createdAt), toISOStringRequired(fn.updatedAt));
  }

  async getScheduledFunction(id: string): Promise<ScheduledFunction | null> {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM project_scheduled_functions WHERE id = ?').get(id) as any;
    return row ? this.rowToScheduledFunction(row) : null;
  }

  async listScheduledFunctions(projectId: string): Promise<ScheduledFunction[]> {
    const db = this.getDB();
    const rows = db.prepare('SELECT * FROM project_scheduled_functions WHERE project_id = ? ORDER BY name').all(projectId) as any[];
    return rows.map((row) => this.rowToScheduledFunction(row));
  }

  async updateScheduledFunction(fn: ScheduledFunction): Promise<void> {
    const db = this.getDB();
    db.prepare(`
      UPDATE project_scheduled_functions SET name = ?, description = ?, function_id = ?, cron_expression = ?, timezone = ?, config = ?, enabled = ?, last_run_at = ?, next_run_at = ?, last_status = ?, last_error = ?, last_duration_ms = ?, updated_at = ?
      WHERE id = ?
    `).run(fn.name, fn.description || null, fn.functionId, fn.cronExpression, fn.timezone, JSON.stringify(fn.config), fn.enabled ? 1 : 0, toISOString(fn.lastRunAt ?? null), toISOString(fn.nextRunAt ?? null), fn.lastStatus || null, fn.lastError || null, fn.lastDurationMs ?? null, toISOStringRequired(fn.updatedAt), fn.id);
  }

  async deleteScheduledFunction(id: string): Promise<void> {
    const db = this.getDB();
    db.prepare('DELETE FROM project_scheduled_functions WHERE id = ?').run(id);
  }

  private rowToScheduledFunction(row: any): ScheduledFunction {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description || undefined,
      functionId: row.function_id,
      cronExpression: row.cron_expression,
      timezone: row.timezone,
      config: parseJSON(row.config, {}),
      enabled: row.enabled === 1,
      lastRunAt: row.last_run_at ? parseDate(row.last_run_at) : undefined,
      nextRunAt: row.next_run_at ? parseDate(row.next_run_at) : undefined,
      lastStatus: row.last_status || undefined,
      lastError: row.last_error || undefined,
      lastDurationMs: row.last_duration_ms ?? undefined,
      createdAt: parseDate(row.created_at),
      updatedAt: parseDate(row.updated_at),
    };
  }

  /**
   * Enable database for a deployment (creates the deployment.sqlite file)
   * Called when user enables "Database" feature in deployment settings
   */
  async enableDeploymentDatabase(deploymentId: string): Promise<void> {
    const db = this.getDB();

    // Update the deployment record
    db.prepare('UPDATE deployments SET database_enabled = 1 WHERE id = ?').run(deploymentId);

    // Create the deployment database
    this.getOrCreateDeploymentDB(deploymentId);
  }

  /**
   * Disable database for a deployment (deletes the deployment.sqlite file)
   */
  async disableDeploymentDatabase(deploymentId: string): Promise<void> {
    const db = this.getDB();

    // Update the deployment record
    db.prepare('UPDATE deployments SET database_enabled = 0 WHERE id = ?').run(deploymentId);

    // Close and delete the deployment database
    const deploymentDb = this.deploymentDatabases.get(deploymentId);
    if (deploymentDb) {
      deploymentDb.close();
      this.deploymentDatabases.delete(deploymentId);
    }

    if (deploymentExists(deploymentId)) {
      deleteDeploymentDatabase(deploymentId);
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

    // Delete deployment database if it exists
    if (deploymentExists(id)) {
      this.deploymentDatabases.delete(id);
      deleteDeploymentDatabase(id);
    }

    // Delete project database if it exists
    this.projectDatabases.delete(id);
    deleteProjectDatabase(id);
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
        // Strip data URL prefix if present (e.g., "data:image/jpeg;base64,")
        let base64Data = rawContent;
        if (rawContent.startsWith('data:')) {
          const commaIndex = rawContent.indexOf(',');
          if (commaIndex !== -1) {
            base64Data = rawContent.slice(commaIndex + 1);
          }
        }
        const buffer = Buffer.from(base64Data, 'base64');
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
  // Deployments (stored in core database)
  // ============================================

  async createDeployment(deployment: Deployment): Promise<void> {
    const db = this.getDB();
    const stmt = db.prepare(`
      INSERT INTO deployments (
        id, project_id, name, slug, enabled, under_construction,
        custom_domain, head_scripts, body_scripts, cdn_links,
        analytics, seo, compliance, settings_version,
        last_published_version, preview_image, preview_updated_at,
        database_enabled, created_at, updated_at, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      deployment.id,
      deployment.projectId,
      deployment.name,
      deployment.slug ?? null,
      deployment.enabled ? 1 : 0,
      deployment.underConstruction ? 1 : 0,
      deployment.customDomain ?? null,
      JSON.stringify(deployment.headScripts ?? []),
      JSON.stringify(deployment.bodyScripts ?? []),
      JSON.stringify(deployment.cdnLinks ?? []),
      JSON.stringify(deployment.analytics ?? DEFAULT_ANALYTICS),
      JSON.stringify(deployment.seo ?? DEFAULT_SEO),
      JSON.stringify(deployment.compliance ?? DEFAULT_COMPLIANCE),
      deployment.settingsVersion ?? 1,
      deployment.lastPublishedVersion ?? null,
      deployment.previewImage ?? null,
      toISOString(deployment.previewUpdatedAt),
      deployment.databaseEnabled ? 1 : 0,
      toISOStringRequired(deployment.createdAt),
      toISOStringRequired(deployment.updatedAt),
      toISOString(deployment.publishedAt)
    );
  }

  async getDeployment(deploymentId: string): Promise<Deployment | null> {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM deployments WHERE id = ?').get(deploymentId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToDeployment(row);
  }

  async getDeploymentBySlug(slug: string): Promise<Deployment | null> {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM deployments WHERE slug = ?').get(slug) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToDeployment(row);
  }

  async listDeployments(): Promise<Deployment[]> {
    const db = this.getDB();
    const rows = db.prepare('SELECT * FROM deployments ORDER BY updated_at DESC').all() as Record<string, unknown>[];

    return rows.map(row => this.rowToDeployment(row));
  }

  async listDeploymentsByProject(projectId: string): Promise<Deployment[]> {
    const db = this.getDB();
    const rows = db.prepare('SELECT * FROM deployments WHERE project_id = ? ORDER BY created_at').all(projectId) as Record<string, unknown>[];

    return rows.map(row => this.rowToDeployment(row));
  }

  async updateDeployment(deployment: Deployment): Promise<void> {
    const db = this.getDB();
    const stmt = db.prepare(`
      UPDATE deployments SET
        project_id = ?, name = ?, slug = ?, enabled = ?, under_construction = ?,
        custom_domain = ?, head_scripts = ?, body_scripts = ?, cdn_links = ?,
        analytics = ?, seo = ?, compliance = ?, settings_version = ?,
        last_published_version = ?, preview_image = ?, preview_updated_at = ?,
        database_enabled = ?, updated_at = ?, published_at = ?
      WHERE id = ?
    `);

    stmt.run(
      deployment.projectId,
      deployment.name,
      deployment.slug ?? null,
      deployment.enabled ? 1 : 0,
      deployment.underConstruction ? 1 : 0,
      deployment.customDomain ?? null,
      JSON.stringify(deployment.headScripts ?? []),
      JSON.stringify(deployment.bodyScripts ?? []),
      JSON.stringify(deployment.cdnLinks ?? []),
      JSON.stringify(deployment.analytics ?? DEFAULT_ANALYTICS),
      JSON.stringify(deployment.seo ?? DEFAULT_SEO),
      JSON.stringify(deployment.compliance ?? DEFAULT_COMPLIANCE),
      deployment.settingsVersion ?? 1,
      deployment.lastPublishedVersion ?? null,
      deployment.previewImage ?? null,
      toISOString(deployment.previewUpdatedAt),
      deployment.databaseEnabled ? 1 : 0,
      toISOStringRequired(deployment.updatedAt),
      toISOString(deployment.publishedAt),
      deployment.id
    );
  }

  async deleteDeployment(deploymentId: string): Promise<void> {
    const db = this.getDB();

    // Delete from core database
    db.prepare('DELETE FROM deployments WHERE id = ?').run(deploymentId);

    // If deployment had database enabled, also delete the deployment database file
    const deploymentDb = this.deploymentDatabases.get(deploymentId);
    if (deploymentDb) {
      deploymentDb.close();
      this.deploymentDatabases.delete(deploymentId);
    }

    if (deploymentExists(deploymentId)) {
      deleteDeploymentDatabase(deploymentId);
    }
  }

  private rowToDeployment(row: Record<string, unknown>): Deployment {
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
  // Analytics Access (via DeploymentDatabase)
  // ============================================

  /**
   * Get the DeploymentDatabase for analytics operations
   * Only returns a database if the deployment has database enabled
   * This allows API routes to access analytics methods
   */
  getDeploymentDatabaseForAnalytics(deploymentId: string): DeploymentDatabase | null {
    // First check if the deployment exists and has database enabled
    const deployment = this.getDeploymentSync(deploymentId);
    if (!deployment || !deployment.databaseEnabled) return null;

    // Get or create the deployment database (since database is enabled)
    return this.getOrCreateDeploymentDB(deploymentId);
  }

  /**
   * Get the AnalyticsDatabase for analytics operations
   * Only returns a database if the deployment exists and has database enabled
   */
  getAnalyticsDatabaseInstance(deploymentId: string): AnalyticsDatabase | null {
    const deployment = this.getDeploymentSync(deploymentId);
    if (!deployment || !deployment.databaseEnabled) return null;

    let analyticsDb = this.analyticsDatabases.get(deploymentId);
    if (!analyticsDb) {
      analyticsDb = new AnalyticsDatabase(deploymentId);
      analyticsDb.init();
      this.analyticsDatabases.set(deploymentId, analyticsDb);
    }
    return analyticsDb;
  }

  /**
   * Synchronous version of getDeployment for internal use
   */
  private getDeploymentSync(deploymentId: string): Deployment | null {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM deployments WHERE id = ?').get(deploymentId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToDeployment(row);
  }
}
