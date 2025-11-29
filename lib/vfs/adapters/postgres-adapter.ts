/**
 * PostgreSQL Storage Adapter
 *
 * Server-side persistence adapter for Server mode.
 * Used by middleware and API routes to store projects, files, templates, and skills.
 * NOT used for checkpoints/conversations (those remain browser-only in IndexedDB).
 */

import postgres from 'postgres';
import { Project, VirtualFile, FileTreeNode, CustomTemplate, Site } from '../types';
import { Skill } from '../skills/types';
import { StorageAdapter } from './types';
import { getPostgresPool } from './postgres-pool';

export class PostgresAdapter implements StorageAdapter {
  private sql: postgres.Sql | null = null;
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  async init(): Promise<void> {
    // Get shared connection pool
    this.sql = getPostgresPool(this.connectionString);

    // Run migrations (with database-level tracking)
    await this.runMigrations();
  }

  async close(): Promise<void> {
    // Don't close the shared pool - it persists across requests
    this.sql = null;
  }

  public getSQL(): postgres.Sql {
    if (!this.sql) {
      throw new Error('PostgresAdapter not initialized. Call init() first.');
    }
    return this.sql;
  }

  /**
   * Run database migrations to create tables if they don't exist
   */
  private async runMigrations(): Promise<void> {
    const sql = this.getSQL();

    // Create migrations tracking table first
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Check which migrations have been run
    const appliedMigrations = await sql`
      SELECT id FROM _migrations
    `;
    const appliedIds = new Set(appliedMigrations.map((m: any) => m.id));

    const shouldRunInitialSchema = !appliedIds.has('initial_schema_v1');

    // ============================================
    // INITIAL SCHEMA MIGRATION
    // ============================================
    if (shouldRunInitialSchema) {
      console.log('[PostgresAdapter] Running initial schema migration...');

    // Projects table
    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        last_saved_at TIMESTAMPTZ,
        last_saved_checkpoint_id TEXT,
        settings JSONB DEFAULT '{}',
        cost_tracking JSONB DEFAULT '{}',
        preview_image TEXT,
        published BOOLEAN DEFAULT false,
        published_at TIMESTAMPTZ
      )
    `;

    // Add published columns to existing tables (safe migration)
    await sql`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT false
    `;

    await sql`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ
    `;

    // Add sync tracking columns to existing tables (safe migration)
    await sql`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ
    `;

    await sql`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS server_updated_at TIMESTAMPTZ
    `;

    // Add publish_settings column for Published Sites feature
    await sql`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS publish_settings JSONB DEFAULT NULL
    `;

    // Files table
    await sql`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        metadata JSONB DEFAULT '{}',
        UNIQUE(project_id, path)
      )
    `;

    // Create index on project_id for faster queries
    await sql`
      CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id)
    `;

    // File tree nodes table
    await sql`
      CREATE TABLE IF NOT EXISTS file_tree_nodes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        type TEXT NOT NULL,
        parent_path TEXT,
        children JSONB DEFAULT '[]',
        UNIQUE(project_id, path)
      )
    `;

    // Create index on project_id and parent_path
    await sql`
      CREATE INDEX IF NOT EXISTS idx_tree_nodes_project_id ON file_tree_nodes(project_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_tree_nodes_parent_path ON file_tree_nodes(project_id, parent_path)
    `;

    // Custom templates table
    await sql`
      CREATE TABLE IF NOT EXISTS custom_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        version TEXT,
        files JSONB DEFAULT '[]',
        directories JSONB DEFAULT '[]',
        assets JSONB DEFAULT '[]',
        imported_at TIMESTAMPTZ NOT NULL
      )
    `;

    // Custom skills table
    await sql`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        markdown TEXT NOT NULL,
        is_built_in BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `;

    // Create index for custom skills only
    await sql`
      CREATE INDEX IF NOT EXISTS idx_skills_is_built_in ON skills(is_built_in)
    `;

    // Sites table (published versions of projects)
    await sql`
      CREATE TABLE IF NOT EXISTS sites (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT,
        enabled BOOLEAN NOT NULL DEFAULT false,
        under_construction BOOLEAN NOT NULL DEFAULT false,
        custom_domain TEXT,
        head_scripts JSONB NOT NULL DEFAULT '[]',
        body_scripts JSONB NOT NULL DEFAULT '[]',
        cdn_links JSONB NOT NULL DEFAULT '[]',
        analytics JSONB NOT NULL DEFAULT '{"enabled":false,"provider":"builtin","privacyMode":true}',
        seo JSONB NOT NULL DEFAULT '{}',
        settings_version INTEGER NOT NULL DEFAULT 1,
        last_published_version INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ,
        UNIQUE(project_id, slug)
      )
    `;

    // Create indexes for sites
    await sql`
      CREATE INDEX IF NOT EXISTS idx_sites_project_id ON sites(project_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_sites_enabled ON sites(enabled)
    `;

    // Clean up old project columns (if they exist)
    await sql`
      ALTER TABLE projects DROP COLUMN IF EXISTS publish_settings
    `;

    await sql`
      ALTER TABLE projects DROP COLUMN IF EXISTS published
    `;

    await sql`
      ALTER TABLE projects DROP COLUMN IF EXISTS published_at
    `;

    // Add preview_image columns to sites table (migration)
    await sql`
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS preview_image TEXT
    `;

    await sql`
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS preview_updated_at TIMESTAMPTZ
    `;

    // Add compliance column to sites table (migration)
    await sql`
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS compliance JSONB DEFAULT '{"enabled":false,"bannerPosition":"bottom","bannerStyle":"bar","message":"We use cookies to improve your experience. By using this site, you accept our use of cookies.","acceptButtonText":"Accept","declineButtonText":"Decline","mode":"opt-in","blockAnalytics":true}'
    `;

    // Create pageviews table for built-in analytics
    await sql`
      CREATE TABLE IF NOT EXISTS pageviews (
        id SERIAL PRIMARY KEY,
        site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        page_path TEXT NOT NULL,
        referrer TEXT,
        country TEXT,
        user_agent TEXT,
        session_id TEXT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Create indexes for pageviews
    await sql`
      CREATE INDEX IF NOT EXISTS idx_pageviews_site_id ON pageviews(site_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_pageviews_timestamp ON pageviews(timestamp)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_pageviews_session_id ON pageviews(session_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_pageviews_site_timestamp ON pageviews(site_id, timestamp)
    `;

      // Mark initial schema migration as complete
      await sql`
        INSERT INTO _migrations (id) VALUES ('initial_schema_v1')
        ON CONFLICT (id) DO NOTHING
      `;
      console.log('[PostgresAdapter] Initial schema migration completed');
    }

    // ============================================
    // ENHANCED ANALYTICS MIGRATION
    // ============================================
    if (!appliedIds.has('enhanced_analytics_v1')) {
      console.log('[PostgresAdapter] Running enhanced analytics migration...');

    // Add enhanced analytics columns to pageviews (safe migration)
    await sql`
      ALTER TABLE pageviews
      ADD COLUMN IF NOT EXISTS load_time INTEGER
    `;

    await sql`
      ALTER TABLE pageviews
      ADD COLUMN IF NOT EXISTS exit_time TIMESTAMPTZ
    `;

    await sql`
      ALTER TABLE pageviews
      ADD COLUMN IF NOT EXISTS device_type TEXT
    `;

    // Create interactions table for heatmaps and click tracking
    await sql`
      CREATE TABLE IF NOT EXISTS interactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL,
        page_path TEXT NOT NULL,
        interaction_type TEXT NOT NULL,
        element_selector TEXT,
        coordinates JSONB,
        scroll_depth INTEGER,
        time_on_page INTEGER,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Create indexes for interactions
    await sql`
      CREATE INDEX IF NOT EXISTS idx_interactions_site_id ON interactions(site_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_interactions_page_path ON interactions(page_path)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON interactions(timestamp)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_interactions_site_page ON interactions(site_id, page_path)
    `;

    // Create sessions table for journey tracking
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL,
        entry_page TEXT,
        exit_page TEXT,
        page_count INTEGER DEFAULT 1,
        duration INTEGER,
        is_bounce BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ
      )
    `;

    // Create indexes for sessions
    await sql`
      CREATE INDEX IF NOT EXISTS idx_sessions_site_id ON sessions(site_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at)
    `;

      // Mark enhanced analytics migration as complete
      await sql`
        INSERT INTO _migrations (id) VALUES ('enhanced_analytics_v1')
        ON CONFLICT (id) DO NOTHING
      `;
      console.log('[PostgresAdapter] Enhanced analytics migration completed');
    }

    // ============================================
    // CUSTOM DOMAIN MIGRATION
    // ============================================
    if (!appliedIds.has('add_custom_domain_v1')) {
      console.log('[PostgresAdapter] Running custom domain migration...');

      // Add custom_domain column to sites table
      await sql`
        ALTER TABLE sites
        ADD COLUMN IF NOT EXISTS custom_domain TEXT
      `;

      // Mark custom domain migration as complete
      await sql`
        INSERT INTO _migrations (id) VALUES ('add_custom_domain_v1')
        ON CONFLICT (id) DO NOTHING
      `;
      console.log('[PostgresAdapter] Custom domain migration completed');
    }
  }

  // ============================================
  // Projects
  // ============================================

  async createProject(project: Project): Promise<void> {
    const sql = this.getSQL();
    await sql`
      INSERT INTO projects (
        id, name, description, created_at, updated_at, last_saved_at,
        last_saved_checkpoint_id, settings, cost_tracking, preview_image,
        published, published_at, publish_settings
      ) VALUES (
        ${project.id},
        ${project.name},
        ${project.description || null},
        ${project.createdAt},
        ${project.updatedAt},
        ${project.lastSavedAt || null},
        ${project.lastSavedCheckpointId || null},
        ${JSON.stringify(project.settings || {})},
        ${JSON.stringify(project.costTracking || {})},
        ${project.previewImage || null},
        ${false},
        ${null},
        ${null}
      )
    `;
  }

  async getProject(id: string): Promise<Project | null> {
    const sql = this.getSQL();
    const result = await sql<any[]>`
      SELECT * FROM projects WHERE id = ${id}
    `;

    if (result.length === 0) return null;

    const row = result[0];

    // Parse publish_settings if it's a string (shouldn't be needed for JSONB, but just in case)
    let publishSettings = row.publish_settings;
    if (typeof publishSettings === 'string') {
      try {
        publishSettings = JSON.parse(publishSettings);
      } catch (e) {
        console.error('[PostgresAdapter] Failed to parse publish_settings:', e);
        publishSettings = undefined;
      }
    }

    const project = {
      ...row,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastSavedAt: row.last_saved_at ? new Date(row.last_saved_at) : null,
      publishedAt: row.published_at ? new Date(row.published_at) : null,
      publishSettings: publishSettings || undefined,
    };

    return project;
  }

  async updateProject(project: Project): Promise<void> {
    const sql = this.getSQL();
    await sql`
      UPDATE projects SET
        name = ${project.name},
        description = ${project.description || null},
        updated_at = ${project.updatedAt},
        last_saved_at = ${project.lastSavedAt || null},
        last_saved_checkpoint_id = ${project.lastSavedCheckpointId || null},
        settings = ${JSON.stringify(project.settings || {})},
        cost_tracking = ${JSON.stringify(project.costTracking || {})},
        preview_image = ${project.previewImage || null}
      WHERE id = ${project.id}
    `;
  }

  // DEPRECATED: Legacy method for old publishing system (replaced by Sites)
  // async updateProjectPublishSettings(projectId: string, publishSettings: import('../types').PublishSettings): Promise<void> {
  //   const sql = this.getSQL();
  //   await sql`
  //     UPDATE projects SET
  //       publish_settings = ${JSON.stringify(publishSettings)},
  //       updated_at = ${new Date()}
  //     WHERE id = ${projectId}
  //   `;
  // }

  async deleteProject(id: string): Promise<void> {
    const sql = this.getSQL();
    // ON DELETE CASCADE will handle files and tree nodes
    await sql`
      DELETE FROM projects WHERE id = ${id}
    `;
  }

  async listProjects(fields?: string[]): Promise<Project[]> {
    const sql = this.getSQL();

    // Map camelCase fields to snake_case database columns
    const fieldMap: Record<string, string> = {
      id: 'id',
      name: 'name',
      description: 'description',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      lastSavedAt: 'last_saved_at',
      lastSavedCheckpointId: 'last_saved_checkpoint_id',
      settings: 'settings',
      costTracking: 'cost_tracking',
      previewImage: 'preview_image',
      published: 'published',
      publishedAt: 'published_at',
      publishSettings: 'publish_settings',
      lastSyncedAt: 'last_synced_at',
      serverUpdatedAt: 'server_updated_at',
    };

    // If specific fields requested, only SELECT those (plus updated_at for sorting)
    let selectClause = '*';
    if (fields && fields.length > 0) {
      const dbFields = fields.map(f => fieldMap[f] || f);
      // Always include updated_at for sorting if not already included
      if (!dbFields.includes('updated_at')) {
        dbFields.push('updated_at');
      }
      selectClause = dbFields.join(', ');
    }

    const result = await sql.unsafe(`
      SELECT ${selectClause} FROM projects ORDER BY updated_at DESC
    `);

    return result.map(row => {
      return {
        ...row,
        createdAt: row.created_at ? new Date(row.created_at) : undefined,
        updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
        lastSavedAt: row.last_saved_at ? new Date(row.last_saved_at) : null,
      } as any;
    }) as Project[];
  }

  // ============================================
  // Files
  // ============================================

  async createFile(file: VirtualFile): Promise<void> {
    const sql = this.getSQL();

    // Convert ArrayBuffer to base64 if needed
    const content = file.content instanceof ArrayBuffer
      ? Buffer.from(file.content).toString('base64')
      : file.content;

    await sql`
      INSERT INTO files (
        id, project_id, path, name, type, content, mime_type,
        size, created_at, updated_at, metadata
      ) VALUES (
        ${file.id},
        ${file.projectId},
        ${file.path},
        ${file.name},
        ${file.type},
        ${content},
        ${file.mimeType},
        ${file.size},
        ${file.createdAt},
        ${file.updatedAt},
        ${JSON.stringify(file.metadata || {})}
      )
    `;
  }

  async getFile(projectId: string, path: string): Promise<VirtualFile | null> {
    const sql = this.getSQL();
    const result = await sql<VirtualFile[]>`
      SELECT * FROM files
      WHERE project_id = ${projectId} AND path = ${path}
    `;

    if (result.length === 0) return null;

    const row = result[0];
    return {
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      metadata: row.metadata || {},
    };
  }

  async updateFile(file: VirtualFile): Promise<void> {
    const sql = this.getSQL();

    // Convert ArrayBuffer to base64 if needed
    const content = file.content instanceof ArrayBuffer
      ? Buffer.from(file.content).toString('base64')
      : file.content;

    await sql`
      UPDATE files SET
        content = ${content},
        size = ${file.size},
        updated_at = ${file.updatedAt},
        metadata = ${JSON.stringify(file.metadata || {})}
      WHERE id = ${file.id}
    `;
  }

  async deleteFile(projectId: string, path: string): Promise<void> {
    const sql = this.getSQL();
    await sql`
      DELETE FROM files
      WHERE project_id = ${projectId} AND path = ${path}
    `;
  }

  async listFiles(projectId: string): Promise<VirtualFile[]> {
    const sql = this.getSQL();
    const result = await sql<VirtualFile[]>`
      SELECT * FROM files
      WHERE project_id = ${projectId}
      ORDER BY path
    `;

    return result.map(row => ({
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      metadata: row.metadata || {},
    }));
  }

  async deleteProjectFiles(projectId: string): Promise<void> {
    const sql = this.getSQL();
    await sql`
      DELETE FROM files WHERE project_id = ${projectId}
    `;
  }

  // ============================================
  // File Tree
  // ============================================

  async createTreeNode(node: FileTreeNode): Promise<void> {
    const sql = this.getSQL();
    await sql`
      INSERT INTO file_tree_nodes (
        id, project_id, path, type, parent_path, children
      ) VALUES (
        ${node.id},
        ${node.projectId},
        ${node.path},
        ${node.type},
        ${node.parentPath || null},
        ${JSON.stringify(node.children || [])}
      )
    `;
  }

  async getTreeNode(projectId: string, path: string): Promise<FileTreeNode | null> {
    const sql = this.getSQL();
    const result = await sql<FileTreeNode[]>`
      SELECT * FROM file_tree_nodes
      WHERE project_id = ${projectId} AND path = ${path}
    `;

    if (result.length === 0) return null;

    return result[0];
  }

  async updateTreeNode(node: FileTreeNode): Promise<void> {
    const sql = this.getSQL();
    await sql`
      UPDATE file_tree_nodes SET
        children = ${JSON.stringify(node.children || [])}
      WHERE id = ${node.id}
    `;
  }

  async deleteTreeNode(projectId: string, path: string): Promise<void> {
    const sql = this.getSQL();
    await sql`
      DELETE FROM file_tree_nodes
      WHERE project_id = ${projectId} AND path = ${path}
    `;
  }

  async getChildNodes(projectId: string, parentPath: string | null): Promise<FileTreeNode[]> {
    const sql = this.getSQL();

    let result: FileTreeNode[];
    if (parentPath === null) {
      result = await sql<FileTreeNode[]>`
        SELECT * FROM file_tree_nodes
        WHERE project_id = ${projectId} AND parent_path IS NULL
        ORDER BY path
      `;
    } else {
      result = await sql<FileTreeNode[]>`
        SELECT * FROM file_tree_nodes
        WHERE project_id = ${projectId} AND parent_path = ${parentPath}
        ORDER BY path
      `;
    }

    return result;
  }

  async getAllTreeNodes(projectId: string): Promise<FileTreeNode[]> {
    const sql = this.getSQL();
    const result = await sql<FileTreeNode[]>`
      SELECT * FROM file_tree_nodes
      WHERE project_id = ${projectId}
      ORDER BY path
    `;

    return result;
  }

  // ============================================
  // Custom Templates
  // ============================================

  async saveCustomTemplate(template: CustomTemplate): Promise<void> {
    const sql = this.getSQL();
    await sql`
      INSERT INTO custom_templates (
        id, name, description, version, files, directories, assets, imported_at
      ) VALUES (
        ${template.id},
        ${template.name},
        ${template.description || null},
        ${template.version || null},
        ${JSON.stringify(template.files || [])},
        ${JSON.stringify(template.directories || [])},
        ${JSON.stringify(template.assets || [])},
        ${template.importedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        version = EXCLUDED.version,
        files = EXCLUDED.files,
        directories = EXCLUDED.directories,
        assets = EXCLUDED.assets
    `;
  }

  async getCustomTemplate(id: string): Promise<CustomTemplate | null> {
    const sql = this.getSQL();
    const result = await sql<CustomTemplate[]>`
      SELECT * FROM custom_templates WHERE id = ${id}
    `;

    if (result.length === 0) return null;

    const row = result[0];
    return {
      ...row,
      importedAt: new Date(row.importedAt),
    };
  }

  async getAllCustomTemplates(): Promise<CustomTemplate[]> {
    const sql = this.getSQL();
    const result = await sql<CustomTemplate[]>`
      SELECT * FROM custom_templates ORDER BY imported_at DESC
    `;

    return result.map(row => ({
      ...row,
      importedAt: new Date(row.importedAt),
    }));
  }

  async deleteCustomTemplate(id: string): Promise<void> {
    const sql = this.getSQL();
    await sql`
      DELETE FROM custom_templates WHERE id = ${id}
    `;
  }

  // ============================================
  // Custom Skills
  // ============================================

  async createSkill(skill: Omit<Skill, 'isBuiltIn'>): Promise<void> {
    const sql = this.getSQL();
    await sql`
      INSERT INTO skills (
        id, name, description, content, markdown, is_built_in,
        created_at, updated_at
      ) VALUES (
        ${skill.id},
        ${skill.name},
        ${skill.description},
        ${skill.content},
        ${skill.markdown},
        ${false},
        ${skill.createdAt},
        ${skill.updatedAt}
      )
    `;
  }

  async getSkill(id: string): Promise<Skill | null> {
    const sql = this.getSQL();
    const result = await sql<Skill[]>`
      SELECT * FROM skills WHERE id = ${id}
    `;

    if (result.length === 0) return null;

    const row = result[0];
    return {
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async updateSkill(skill: Omit<Skill, 'isBuiltIn'>): Promise<void> {
    const sql = this.getSQL();
    await sql`
      UPDATE skills SET
        name = ${skill.name},
        description = ${skill.description},
        content = ${skill.content},
        markdown = ${skill.markdown},
        updated_at = ${skill.updatedAt}
      WHERE id = ${skill.id}
    `;
  }

  async deleteSkill(id: string): Promise<void> {
    const sql = this.getSQL();
    await sql`
      DELETE FROM skills WHERE id = ${id}
    `;
  }

  async getAllSkills(): Promise<Skill[]> {
    const sql = this.getSQL();
    const result = await sql<Skill[]>`
      SELECT * FROM skills
      WHERE is_built_in = false
      ORDER BY created_at DESC
    `;

    return result.map(row => ({
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  }

  // ============================================
  // Sites (Published versions of projects)
  // ============================================

  async createSite(site: Site): Promise<void> {
    const sql = this.getSQL();
    await sql`
      INSERT INTO sites (
        id, project_id, name, slug, enabled,
        under_construction, custom_domain,
        head_scripts, body_scripts, cdn_links, analytics, seo, compliance,
        settings_version, last_published_version,
        created_at, updated_at, published_at
      ) VALUES (
        ${site.id},
        ${site.projectId},
        ${site.name},
        ${site.slug || null},
        ${site.enabled},
        ${site.underConstruction},
        ${site.customDomain || null},
        ${JSON.stringify(site.headScripts)},
        ${JSON.stringify(site.bodyScripts)},
        ${JSON.stringify(site.cdnLinks)},
        ${JSON.stringify(site.analytics)},
        ${JSON.stringify(site.seo)},
        ${JSON.stringify(site.compliance)},
        ${site.settingsVersion},
        ${site.lastPublishedVersion || null},
        ${site.createdAt},
        ${site.updatedAt},
        ${site.publishedAt || null}
      )
    `;
  }

  async getSite(siteId: string): Promise<Site | null> {
    const sql = this.getSQL();
    const result = await sql<any[]>`
      SELECT * FROM sites WHERE id = ${siteId}
    `;

    if (result.length === 0) return null;

    return this.rowToSite(result[0]);
  }

  async listSites(): Promise<Site[]> {
    const sql = this.getSQL();
    const result = await sql<any[]>`
      SELECT * FROM sites ORDER BY created_at DESC
    `;

    return result.map(row => this.rowToSite(row));
  }

  async listSitesByProject(projectId: string): Promise<Site[]> {
    const sql = this.getSQL();
    const result = await sql<any[]>`
      SELECT * FROM sites WHERE project_id = ${projectId} ORDER BY created_at DESC
    `;

    return result.map(row => this.rowToSite(row));
  }

  async updateSite(site: Site): Promise<void> {
    const sql = this.getSQL();
    await sql`
      UPDATE sites SET
        name = ${site.name},
        slug = ${site.slug || null},
        enabled = ${site.enabled},
        under_construction = ${site.underConstruction},
        custom_domain = ${site.customDomain || null},
        head_scripts = ${JSON.stringify(site.headScripts)},
        body_scripts = ${JSON.stringify(site.bodyScripts)},
        cdn_links = ${JSON.stringify(site.cdnLinks)},
        analytics = ${JSON.stringify(site.analytics)},
        seo = ${JSON.stringify(site.seo)},
        compliance = ${JSON.stringify(site.compliance)},
        settings_version = ${site.settingsVersion},
        last_published_version = ${site.lastPublishedVersion || null},
        preview_image = ${site.previewImage || null},
        preview_updated_at = ${site.previewUpdatedAt || null},
        updated_at = ${site.updatedAt},
        published_at = ${site.publishedAt || null}
      WHERE id = ${site.id}
    `;
  }

  async deleteSite(siteId: string): Promise<void> {
    const sql = this.getSQL();
    await sql`
      DELETE FROM sites WHERE id = ${siteId}
    `;
  }

  // Helper: Convert DB row to Site object (snake_case → camelCase)
  private rowToSite(row: any): Site {
    // Parse JSON columns (PostgreSQL returns them as strings or objects depending on driver)
    const parseJSON = (value: any, fallback: any) => {
      if (!value) return fallback;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return fallback;
        }
      }
      return value;
    };

    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      slug: row.slug,
      enabled: row.enabled,
      underConstruction: row.under_construction,
      customDomain: row.custom_domain,
      headScripts: parseJSON(row.head_scripts, []),
      bodyScripts: parseJSON(row.body_scripts, []),
      cdnLinks: parseJSON(row.cdn_links, []),
      analytics: parseJSON(row.analytics, { enabled: false, provider: 'builtin', privacyMode: true }),
      seo: parseJSON(row.seo, {}),
      compliance: parseJSON(row.compliance, {
        enabled: false,
        bannerPosition: 'bottom',
        bannerStyle: 'bar',
        message: 'We use cookies to improve your experience. By using this site, you accept our use of cookies.',
        acceptButtonText: 'Accept',
        declineButtonText: 'Decline',
        mode: 'opt-in',
        blockAnalytics: true,
      }),
      settingsVersion: row.settings_version || 1,
      lastPublishedVersion: row.last_published_version,
      previewImage: row.preview_image,
      previewUpdatedAt: row.preview_updated_at ? new Date(row.preview_updated_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      publishedAt: row.published_at ? new Date(row.published_at) : null,
    };
  }
}
