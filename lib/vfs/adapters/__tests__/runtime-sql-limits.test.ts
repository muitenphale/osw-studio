import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * A result set from user SQL is read into memory whole and then serialised into one response. The
 * caller chooses how many rows that is, so without a ceiling a single statement could return the
 * entire table: measured at 300,000 rows and about 2.6MB before this, from one `deployments_sql`
 * call on a `deploy` grant.
 *
 * `better-sqlite3` is synchronous and exposes no interrupt, so a statement cannot be cut off
 * mid-execution from this thread. What is bounded here is what it returns.
 */

let dir: string;
let RuntimeDatabase: typeof import('../runtime-database').RuntimeDatabase;
let db: InstanceType<typeof RuntimeDatabase>;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-sqllimit-'));
  vi.stubEnv('DEPLOYMENTS_DIR', dir);
  vi.resetModules();
  ({ RuntimeDatabase } = await import('../runtime-database'));
  db = new RuntimeDatabase('d1');
  db.init();
  db.executeUserQuery('CREATE TABLE t (x INTEGER)');
  db.executeUserQuery('INSERT INTO t WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c LIMIT 12000) SELECT x FROM c');
});

afterEach(() => {
  db.close();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('how much one statement can return', () => {
  it('caps the rows a select hands back', () => {
    const out = db.executeUserQuery('SELECT x FROM t');

    // 12,000 rows go in, so the exact count is the claim: a ceiling also holds if the cap moved
    // or the fixture shrank below it, and `toBeGreaterThan(0)` could not fail either way.
    expect(out.rows.length).toBe(5000);
  });

  it('says so rather than silently truncating', () => {
    const out = db.executeUserQuery('SELECT x FROM t');

    expect(out.truncated).toBe(true);
  });

  it('leaves a result inside the cap alone', () => {
    const out = db.executeUserQuery('SELECT x FROM t LIMIT 10');

    expect(out.rows.length).toBe(10);
    expect(out.truncated).toBeFalsy();
    expect(out.error).toBeUndefined();
  });

  it('still returns columns and values correctly', () => {
    const out = db.executeUserQuery('SELECT x FROM t ORDER BY x LIMIT 3');

    expect(out.columns).toEqual(['x']);
    expect(out.rows).toEqual([[1], [2], [3]]);
  });
});
