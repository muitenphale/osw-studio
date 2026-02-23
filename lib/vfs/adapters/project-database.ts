/**
 * Project Database Manager
 *
 * Lightweight per-project SQLite database for user-defined tables.
 * No system tables — just user DDL/SQL.
 *
 * Project databases live at data/projects/{projectId}/database.sqlite
 * and are extracted to deployment runtime.sqlite on publish.
 */

import type { Database } from 'better-sqlite3';
import { TableInfo } from '../types';
import {
  getProjectDatabaseConnection,
  closeProjectDatabase,
} from './sqlite-connection';

/**
 * Escape a table name for use in SQL identifiers (double-quote escaping)
 */
function escapeIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Per-project database manager
 */
export class ProjectDatabase {
  private db: Database;
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.db = getProjectDatabaseConnection(projectId);
  }

  /**
   * Initialize — no-op, exists for interface symmetry with RuntimeDatabase
   */
  init(): void {
    // No system tables to create
  }

  /**
   * Close the database connection
   */
  close(): void {
    closeProjectDatabase(this.projectId);
  }

  /**
   * Execute DDL statements (CREATE TABLE, etc.)
   */
  executeDDL(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Get schema information for all tables
   */
  getTableSchema(): TableInfo[] {
    const tables = this.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    return tables.map(table => {
      const escaped = escapeIdentifier(table.name);
      const columns = this.db.prepare(`PRAGMA table_info(${escaped})`).all() as Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>;

      const countResult = this.db.prepare(`SELECT COUNT(*) as count FROM ${escaped}`).get() as { count: number };

      return {
        name: table.name,
        columns: columns.map(col => ({
          name: col.name,
          type: col.type,
          nullable: !col.notnull,
          primaryKey: col.pk > 0,
          defaultValue: col.dflt_value ?? undefined,
        })),
        rowCount: countResult.count,
        isSystemTable: false,
      };
    });
  }

  /**
   * Execute raw SQL (SELECT or DML)
   */
  executeRawSQL(sql: string, params?: unknown[]): {
    columns: string[];
    rows: unknown[][];
    rowsAffected: number;
  } {
    const trimmedSql = sql.trim().toLowerCase();
    const isSelect = trimmedSql.startsWith('select');

    if (isSelect) {
      const stmt = this.db.prepare(sql);
      const rows = params ? stmt.all(...params) : stmt.all();

      if (rows.length === 0) {
        return { columns: [], rows: [], rowsAffected: 0 };
      }

      const columns = Object.keys(rows[0] as Record<string, unknown>);
      const rowsArray = rows.map(row => columns.map(col => (row as Record<string, unknown>)[col]));

      return { columns, rows: rowsArray, rowsAffected: 0 };
    } else {
      const stmt = this.db.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();

      return {
        columns: [],
        rows: [],
        rowsAffected: result.changes,
      };
    }
  }

  /**
   * Get data from a specific table with pagination
   */
  getTableData(tableName: string, limit: number = 100, offset: number = 0): {
    columns: string[];
    rows: unknown[][];
    total: number;
  } {
    const validTables = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?
    `).get(tableName);

    if (!validTables) {
      throw new Error(`Table "${tableName}" does not exist`);
    }

    const escaped = escapeIdentifier(tableName);
    const countResult = this.db.prepare(`SELECT COUNT(*) as count FROM ${escaped}`).get() as { count: number };
    const rows = this.db.prepare(`SELECT * FROM ${escaped} LIMIT ? OFFSET ?`).all(limit, offset) as Record<string, unknown>[];

    if (rows.length === 0) {
      return { columns: [], rows: [], total: countResult.count };
    }

    const columns = Object.keys(rows[0]);
    const rowsArray = rows.map(row => columns.map(col => row[col]));

    return {
      columns,
      rows: rowsArray,
      total: countResult.count,
    };
  }

  /**
   * Generate schema SQL from sqlite_master for export/extraction.
   * Uses the original DDL stored by SQLite — preserves AUTOINCREMENT,
   * FOREIGN KEY, CHECK constraints, and indexes.
   */
  getSchemaForExport(): string {
    const tables = this.db.prepare(`
      SELECT sql FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL
      ORDER BY name
    `).all() as Array<{ sql: string }>;

    const indexes = this.db.prepare(`
      SELECT sql FROM sqlite_master
      WHERE type = 'index' AND sql IS NOT NULL
      ORDER BY name
    `).all() as Array<{ sql: string }>;

    if (tables.length === 0) {
      return '';
    }

    return [...tables, ...indexes].map(r => r.sql + ';').join('\n\n') + '\n';
  }
}
