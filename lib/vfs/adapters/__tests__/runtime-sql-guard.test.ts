import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * `executeUserQuery` is the SQL an outside caller runs against a deployment's runtime database
 * (the SQL editor and the MCP `deployments_sql` tool). The system tables in it are the
 * deployment's own machinery: `edge_functions` is read live by the invocation route, and
 * `secrets` is what the executor decrypts for function code. A write to either from user SQL
 * is code execution and secret disclosure, so the guard has to hold against the whole SQL
 * grammar, not one spelling of each verb.
 */

let dir: string;
let RuntimeDatabase: typeof import('../runtime-database').RuntimeDatabase;
let db: InstanceType<typeof RuntimeDatabase>;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-sqlguard-'));
  vi.stubEnv('DEPLOYMENTS_DIR', dir);
  vi.resetModules();
  ({ RuntimeDatabase } = await import('../runtime-database'));
  db = new RuntimeDatabase('d1');
  db.init();
  db.executeUserQuery('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)');
  db.createFunction({ id: 'real', name: 'hello', code: 'return 1', method: 'GET', enabled: true, timeoutMs: 5000 } as never);
});

afterEach(() => {
  db.close();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

const run = (sql: string) => db.executeUserQuery(sql);

describe('user SQL and the runtime system tables', () => {
  it.each([
    ['plain insert',        "INSERT INTO secrets (id,name,encrypted_value,iv,auth_tag,created_at,updated_at) VALUES ('x','x','','','','','')"],
    ['insert or replace',   "INSERT OR REPLACE INTO secrets (id,name,encrypted_value,iv,auth_tag,created_at,updated_at) VALUES ('x','x','','','','','')"],
    ['replace into',        "REPLACE INTO secrets (id,name,encrypted_value,iv,auth_tag,created_at,updated_at) VALUES ('x','x','','','','','')"],
    ['cte then insert',     "WITH z AS (SELECT 1) INSERT INTO edge_functions (id,name,code,method,enabled,timeout_ms,created_at,updated_at) SELECT 'x','x','','GET',1,5000,'','' FROM z"],
    ['schema-qualified update', "UPDATE main.secrets SET name = name"],
    ['schema-qualified delete', "DELETE FROM main.secrets"],
    ['update or replace',   "UPDATE OR REPLACE edge_functions SET name = name"],
    ['quoted identifier',   'UPDATE "edge_functions" SET name = name'],
    ['bracketed identifier', 'UPDATE [edge_functions] SET name = name'],
    ['trigger on a system table', 'CREATE TRIGGER t AFTER INSERT ON site_info BEGIN SELECT 1; END'],
    ['trigger writing a system table', "CREATE TRIGGER t AFTER INSERT ON notes BEGIN INSERT INTO edge_functions (id,name,code,method,enabled,timeout_ms,created_at,updated_at) VALUES ('x','x','','GET',1,5000,'',''); END"],
    ['drop schema-qualified',  'DROP TABLE main.secrets'],
    ['alter schema-qualified', 'ALTER TABLE main.secrets RENAME TO gone'],
  ])('refuses a write that touches a system table: %s', (_label, sql) => {
    const out = run(sql);
    expect(out.error, sql).toMatch(/system table/i);
    // and nothing happened
    expect(run("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('t','gone')").rows[0][0]).toBe(0);
    expect(db.listSecrets()).toEqual([]);
  });

  it('still lets user SQL do its job', () => {
    expect(run("INSERT INTO notes (body) VALUES ('hello')").error).toBeUndefined();
    expect(run("UPDATE notes SET body = 'hi'").error).toBeUndefined();
    expect(run('SELECT body FROM notes').rows).toEqual([['hi']]);
    expect(run('SELECT name FROM secrets').error).toBeUndefined();
    // Reading a system table into a user table stays allowed: the values there are ciphertext.
    expect(run('INSERT INTO notes (body) SELECT encrypted_value FROM secrets').error).toBeUndefined();
    expect(run("SELECT name FROM sqlite_master WHERE type='table'").error).toBeUndefined();
    expect(run('WITH z AS (SELECT 1 AS n) SELECT n FROM z').error).toBeUndefined();
    expect(run('CREATE TABLE secrets_of_mine (id INTEGER)').error).toBeUndefined();
    expect(run("DELETE FROM notes WHERE body = 'hi'").error).toBeUndefined();
  });

  it('lets a caller use its own temp tables', () => {
    // The guard maps a write's root page back to a table name. Temp pages are numbered in their
    // own database and overlap main's, so ignoring which database a page belongs to refused a
    // caller's own temp table as a write to whichever main table shared that number.
    expect(run('CREATE TEMP TABLE scratch (x INTEGER)').error).toBeUndefined();
    expect(run('INSERT INTO scratch VALUES (1)').error).toBeUndefined();
    expect(run('SELECT x FROM scratch').rows).toEqual([[1]]);
    expect(run('DELETE FROM scratch').error).toBeUndefined();
    expect(run('DROP TABLE scratch').error).toBeUndefined();
  });

  it.each(['edge_functions', 'secrets', 'server_functions', 'site_info'])(
    'refuses a temp table that shadows the system table %s',
    (name) => {
      // Unqualified reads resolve to the temp schema first, and the runtime connection is cached
      // across requests, so a temp table with a system table's name silently replaces what the
      // edge-function executor reads from that point on.
      const out = run(`CREATE TEMP TABLE ${name} (id TEXT, name TEXT, code TEXT)`);

      expect(out.error, name).toMatch(/system table/i);
      expect(db.getFunctionByName('hello')?.code).toBe('return 1');
    },
  );

  it.each([
    ['schema-qualified', 'CREATE TABLE temp.edge_functions (id TEXT, name TEXT, code TEXT)'],
    ['quoted schema', 'CREATE TABLE "temp".edge_functions (id TEXT, name TEXT, code TEXT)'],
    ['bracketed schema', 'CREATE TABLE [temp].edge_functions (id TEXT, name TEXT, code TEXT)'],
    ['qualified view', 'CREATE VIEW temp.secrets AS SELECT 1 AS x'],
    ['qualified, if not exists', 'CREATE TABLE IF NOT EXISTS temp.secrets (id TEXT)'],
    ['spaced around the dot', 'CREATE TABLE temp . edge_functions (id TEXT, name TEXT, code TEXT)'],
  ])('refuses a shadow created by naming the temp schema: %s', (_label, sql) => {
    // `CREATE TEMP TABLE x` and `CREATE TABLE temp.x` build the same object. Matching only the
    // keyword let the qualified spelling through, and an unqualified read then resolved to it:
    // measured end to end as a published function returning attacker code while the real row in
    // `main` stayed intact.
    const out = run(sql);

    expect(out.error, sql).toMatch(/system table/i);
    expect(db.getFunctionByName('hello')?.code).toBe('return 1');
  });

  it('refuses a write that reaches a system table name through the temp schema', () => {
    // Belt to the create-time brace: whatever route produced it, a write whose target resolves to
    // a system table name is refused, so the syntax used to create the shadow stops mattering.
    const raw = (db as unknown as { db: import('better-sqlite3').Database }).db;
    raw.exec('CREATE TABLE temp.edge_functions (id TEXT, name TEXT, code TEXT, method TEXT, enabled INTEGER, timeout_ms INTEGER, created_at TEXT, updated_at TEXT)');

    const out = run("INSERT INTO edge_functions (id,name,code,method,enabled,timeout_ms,created_at,updated_at) VALUES ('evil','hello','STOLEN','GET',1,5000,'','')");

    expect(out.error).toMatch(/system table/i);
    raw.exec('DROP TABLE temp.edge_functions');
  });

  it('still allows a temp table of the caller\'s own naming, qualified or not', () => {
    expect(run('CREATE TABLE temp.mine (x INTEGER)').error).toBeUndefined();
    expect(run('INSERT INTO mine VALUES (7)').error).toBeUndefined();
    expect(run('SELECT x FROM mine').rows).toEqual([[7]]);
  });

  it('names the table the statement actually wrote', () => {
    const out = run("INSERT INTO secrets (id,name,encrypted_value,iv,auth_tag,created_at,updated_at) VALUES ('x','x','','','','','')");
    expect(out.error).toContain('secrets');
    expect(out.error).not.toContain('site_info');
  });

  it('still refuses the connection-level statements', () => {
    expect(run("ATTACH DATABASE '/tmp/x' AS x").error).toMatch(/not allowed/);
    expect(run('PRAGMA table_list').error).toMatch(/not allowed/);
    expect(run('SELECT 1; DROP TABLE notes').error).toBeTruthy();
  });
});
