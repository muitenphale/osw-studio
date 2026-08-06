import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { installLocalStorageStub } from './local-storage-stub';

const { vfs } = await import('../index');
const { getProjectSchema, setProjectSchema, clearLegacyProjectSchema } =
  await import('../project-schema');

const DDL = 'CREATE TABLE messages (id INTEGER PRIMARY KEY);';
const legacyKey = (projectId: string) => `osw-db-schema-${projectId}`;

describe('project database schema', () => {
  let restore = () => {};

  beforeAll(async () => { await vfs.init(); });
  beforeEach(() => { restore(); restore = installLocalStorageStub(); });
  afterAll(() => { restore(); });

  it('stores the schema on the project record, not in localStorage', async () => {
    const project = await vfs.createProject('Schema', 'test');
    await setProjectSchema(project.id, DDL);

    const stored = await vfs.getProject(project.id);
    expect(stored.settings.databaseSchema).toBe(DDL);
    expect(localStorage.getItem(legacyKey(project.id))).toBeNull();
  });

  it('reads back what was written', async () => {
    const project = await vfs.createProject('Schema', 'test');
    await setProjectSchema(project.id, DDL);
    expect(await getProjectSchema(project.id)).toBe(DDL);
  });

  it('clears the field rather than storing an empty string', async () => {
    const project = await vfs.createProject('Schema', 'test');
    await setProjectSchema(project.id, DDL);
    await setProjectSchema(project.id, '');

    const stored = await vfs.getProject(project.id);
    expect(stored.settings.databaseSchema).toBeUndefined();
    expect(await getProjectSchema(project.id)).toBe('');
  });

  it('migrates a schema still sitting in localStorage onto the record', async () => {
    const project = await vfs.createProject('Legacy', 'test');
    localStorage.setItem(legacyKey(project.id), DDL);

    expect(await getProjectSchema(project.id)).toBe(DDL);

    const stored = await vfs.getProject(project.id);
    expect(stored.settings.databaseSchema).toBe(DDL);
    // Migrated, so the old copy goes — otherwise it would shadow later edits.
    expect(localStorage.getItem(legacyKey(project.id))).toBeNull();
  });

  it('does not mark the project as edited when migrating', async () => {
    const project = await vfs.createProject('Legacy', 'test');
    const before = (await vfs.getProject(project.id)).updatedAt.getTime();
    localStorage.setItem(legacyKey(project.id), DDL);

    await getProjectSchema(project.id);

    const after = (await vfs.getProject(project.id)).updatedAt.getTime();
    expect(after).toBe(before);
  });

  it('marks the project as edited when the schema is actually changed', async () => {
    const project = await vfs.createProject('Schema', 'test');
    const before = (await vfs.getProject(project.id)).updatedAt.getTime();
    await new Promise((r) => setTimeout(r, 2));

    await setProjectSchema(project.id, DDL);

    const after = (await vfs.getProject(project.id)).updatedAt.getTime();
    expect(after).toBeGreaterThan(before);
  });

  it('prefers the record over a stale legacy copy', async () => {
    const project = await vfs.createProject('Schema', 'test');
    await setProjectSchema(project.id, DDL);
    localStorage.setItem(legacyKey(project.id), 'CREATE TABLE stale (id INTEGER);');

    expect(await getProjectSchema(project.id)).toBe(DDL);
  });

  it('returns the legacy copy for a project that no longer exists', async () => {
    localStorage.setItem(legacyKey('gone'), DDL);
    expect(await getProjectSchema('gone')).toBe(DDL);
  });

  it('clearLegacyProjectSchema removes the old key', async () => {
    localStorage.setItem(legacyKey('p1'), DDL);
    clearLegacyProjectSchema('p1');
    expect(localStorage.getItem(legacyKey('p1'))).toBeNull();
  });
});
