import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { SQLiteAdapter } from '../adapters/sqlite-adapter';

/**
 * Migration add_file_encoding_v10 rebuilds the files table to drop the type CHECK constraint and
 * add the encoding column. A rebuild that loses rows or constraints is unrecoverable, so this
 * exercises the real upgrade against a database populated in the previous schema.
 */

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

let dir: string;
let dbPath: string;

/** A database as it stood at v9: files with the CHECK constraint and no encoding column. */
function buildLegacyDatabase(): void {
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_saved_at TEXT,
    last_saved_checkpoint_id TEXT, settings TEXT, cost_tracking TEXT,
    preview_image TEXT, last_synced_at TEXT, server_updated_at TEXT)`);
  db.exec(`CREATE TABLE files (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, path TEXT NOT NULL, name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('html','css','js','json','text','template','image','video','binary')),
    content TEXT, mime_type TEXT, size INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    metadata TEXT DEFAULT '{}', UNIQUE(project_id, path),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE)`);
  db.exec(`CREATE INDEX idx_files_project_id ON files(project_id)`);

  for (const id of [
    'initial_schema_v1', 'add_files_and_tree_v2', 'add_request_log_v3',
    'rename_sites_to_deployments_v4', 'add_project_server_features_v5',
    'add_model_templates_v6', 'add_custom_template_updated_at_v7',
    'add_connections_v8', 'add_interview_templates_v9',
  ]) db.prepare('INSERT INTO _migrations (id) VALUES (?)').run(id);

  db.exec(`INSERT INTO projects (id,name,created_at,updated_at)
           VALUES ('p1','P',datetime('now'),datetime('now'))`);
  const insert = db.prepare(`INSERT INTO files
    (id,project_id,path,name,type,content,mime_type,size,created_at,updated_at,metadata)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),?)`);
  insert.run('f1', 'p1', '/a.png', 'a.png', 'image', PNG.toString('base64'), 'image/png', 8, '{"k":1}');
  insert.run('f2', 'p1', '/i.html', 'i.html', 'html', '<h1>hi</h1>', 'text/html', 11, '{}');
  insert.run('f3', 'p1', '/e.png', 'e.png', 'image', '', 'image/png', 0, '{}');
  db.close();
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-mig-'));
  dbPath = path.join(dir, 'osws.sqlite');
  buildLegacyDatabase();
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('files table rebuild (v10)', () => {
  it('preserves every row and column', async () => {
    await new SQLiteAdapter(dbPath).init();

    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT * FROM files ORDER BY id').all() as Record<string, unknown>[];
    db.close();

    expect(rows).toHaveLength(3);
    expect(rows[0].metadata).toBe('{"k":1}');
    expect(rows[0].mime_type).toBe('image/png');
    expect(rows[0].size).toBe(8);
    expect(rows[1].content).toBe('<h1>hi</h1>');
  });

  it('labels existing binary rows so they still decode', async () => {
    await new SQLiteAdapter(dbPath).init();

    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT id, encoding FROM files ORDER BY id').all() as Array<{ id: string; encoding: string | null }>;
    db.close();

    // Only the image row that actually has content; empty and text rows stay unflagged.
    expect(rows).toEqual([
      { id: 'f1', encoding: 'base64' },
      { id: 'f2', encoding: null },
      { id: 'f3', encoding: null },
    ]);
  });

  it('reads a migrated binary row back as the original bytes', async () => {
    const adapter = new SQLiteAdapter(dbPath);
    await adapter.init();

    const file = await adapter.getFile('p1', '/a.png');

    expect(Object.prototype.toString.call(file!.content)).toBe('[object ArrayBuffer]');
    expect(Buffer.from(new Uint8Array(file!.content as ArrayBuffer))).toEqual(PNG);
  });

  it('drops the type CHECK so new categories are storable', async () => {
    await new SQLiteAdapter(dbPath).init();

    const db = new Database(dbPath);
    expect(() => db.prepare(`INSERT INTO files
      (id,project_id,path,name,type,content,encoding,mime_type,size,created_at,updated_at,metadata)
      VALUES ('f4','p1','/s.mp3','s.mp3','audio','AAAA','base64','audio/mpeg',4,datetime('now'),datetime('now'),'{}')`
    ).run()).not.toThrow();
    db.close();
  });

  it('keeps the index, the UNIQUE path and the cascading foreign key', async () => {
    await new SQLiteAdapter(dbPath).init();

    const db = new Database(dbPath);
    const indexes = (db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='files'`)
      .all() as Array<{ name: string }>).map((r) => r.name);
    expect(indexes).toContain('idx_files_project_id');

    expect(() => db.prepare(`INSERT INTO files (id,project_id,path,name,type,created_at,updated_at)
      VALUES ('dup','p1','/i.html','i.html','html',datetime('now'),datetime('now'))`).run())
      .toThrow(/UNIQUE/);

    const fks = db.prepare(`PRAGMA foreign_key_list(files)`).all() as Array<{ table: string; on_delete: string }>;
    expect(fks.map((f) => [f.table, f.on_delete])).toEqual([['projects', 'CASCADE']]);
    db.close();
  });

  it('runs once and is safe to re-open', async () => {
    await new SQLiteAdapter(dbPath).init();
    await new SQLiteAdapter(dbPath).init();

    const db = new Database(dbPath, { readonly: true });
    expect((db.prepare(`SELECT COUNT(*) c FROM _migrations WHERE id='add_file_encoding_v10'`)
      .get() as { c: number }).c).toBe(1);
    expect((db.prepare('SELECT COUNT(*) c FROM files').get() as { c: number }).c).toBe(3);
    db.close();
  });
});
