/**
 * SQLite Connection Manager
 *
 * Singleton manager for SQLite database connections with WAL mode
 * for better concurrency. Manages both:
 * - Core database (data/osws.sqlite) - projects, templates, skills
 * - Site databases (sites/{siteId}/site.sqlite) - per-site data + analytics
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Connection cache
let coreDatabase: Database.Database | null = null;
const siteDatabases = new Map<string, Database.Database>();

/**
 * Get the base directory for data storage
 * Supports DATA_DIR environment variable for custom paths
 */
function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

/**
 * Get the base directory for site storage
 */
function getSitesDir(): string {
  return path.join(process.cwd(), 'sites');
}

/**
 * Ensure a directory exists, creating it if necessary
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Configure a database with WAL mode and foreign keys
 */
function configureDatabase(db: Database.Database): void {
  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');
  // Enable foreign key constraints
  db.pragma('foreign_keys = ON');
  // Optimize for performance
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64MB cache
  db.pragma('temp_store = MEMORY');
}

/**
 * Get the core database connection (singleton)
 * Creates data/osws.sqlite if it doesn't exist
 */
export function getCoreDatabase(): Database.Database {
  if (coreDatabase) {
    return coreDatabase;
  }

  const dataDir = getDataDir();
  ensureDir(dataDir);

  const dbPath = path.join(dataDir, 'osws.sqlite');
  coreDatabase = new Database(dbPath);
  configureDatabase(coreDatabase);

  return coreDatabase;
}

/**
 * Get a site-specific database connection (cached)
 * Creates sites/{siteId}/site.sqlite if it doesn't exist
 */
export function getSiteDatabase(siteId: string): Database.Database {
  // Check cache first
  const cached = siteDatabases.get(siteId);
  if (cached) {
    return cached;
  }

  const sitesDir = getSitesDir();
  const siteDir = path.join(sitesDir, siteId);
  ensureDir(siteDir);

  const dbPath = path.join(siteDir, 'site.sqlite');
  const db = new Database(dbPath);
  configureDatabase(db);

  // Cache the connection
  siteDatabases.set(siteId, db);

  return db;
}

/**
 * Check if a site database exists
 */
export function siteExists(siteId: string): boolean {
  const sitesDir = getSitesDir();
  const dbPath = path.join(sitesDir, siteId, 'site.sqlite');
  return fs.existsSync(dbPath);
}

/**
 * Delete a site's database and directory
 */
export function deleteSiteDatabase(siteId: string): void {
  // Close the connection if open
  closeSiteDatabase(siteId);

  const sitesDir = getSitesDir();
  const siteDir = path.join(sitesDir, siteId);

  if (fs.existsSync(siteDir)) {
    // Remove all files in the directory
    const files = fs.readdirSync(siteDir);
    for (const file of files) {
      fs.unlinkSync(path.join(siteDir, file));
    }
    // Remove the directory
    fs.rmdirSync(siteDir);
  }
}

/**
 * Close a specific site database connection
 */
export function closeSiteDatabase(siteId: string): void {
  const db = siteDatabases.get(siteId);
  if (db) {
    try {
      db.close();
    } catch {
      // Ignore errors on close
    }
    siteDatabases.delete(siteId);
  }
}

/**
 * Close the core database connection
 */
export function closeCoreDatabase(): void {
  if (coreDatabase) {
    try {
      coreDatabase.close();
    } catch {
      // Ignore errors on close
    }
    coreDatabase = null;
  }
}

/**
 * Close all database connections (for cleanup/shutdown)
 */
export function closeAllConnections(): void {
  // Close all site databases
  for (const [siteId] of siteDatabases) {
    closeSiteDatabase(siteId);
  }

  // Close core database
  closeCoreDatabase();
}

/**
 * List all site IDs that have databases
 */
export function listSiteIds(): string[] {
  const sitesDir = getSitesDir();

  if (!fs.existsSync(sitesDir)) {
    return [];
  }

  const entries = fs.readdirSync(sitesDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .filter(entry => fs.existsSync(path.join(sitesDir, entry.name, 'site.sqlite')))
    .map(entry => entry.name);
}

/**
 * Get the file path for a site's database (for export/backup)
 */
export function getSiteDatabasePath(siteId: string): string {
  const sitesDir = getSitesDir();
  return path.join(sitesDir, siteId, 'site.sqlite');
}

/**
 * Get the file path for the core database (for export/backup)
 */
export function getCoreDatabasePath(): string {
  const dataDir = getDataDir();
  return path.join(dataDir, 'osws.sqlite');
}
