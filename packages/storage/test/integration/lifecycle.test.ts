import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverFiles } from '@setsu-ai/core';
import {
  openGraphDb,
  classifyFiles,
  applyFileChanges,
  bumpGraphRevision,
  getGraphRevision,
  type GraphStore,
} from '@setsu-ai/storage';

let repo: string;
let store: GraphStore;

async function indexOnce() {
  const discovered = await discoverFiles(repo);
  const plan = await classifyFiles(store.db, store.repoId, repo, discovered);
  const changed = plan.counts.NEW + plan.counts.MODIFIED + plan.counts.DELETED;
  store.db.transaction(() => {
    applyFileChanges(store.db, store.repoId, plan);
    if (changed > 0) bumpGraphRevision(store.db);
  });
  return plan;
}

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'setsu-life-'));
  await mkdir(join(repo, 'src'), { recursive: true });
  await writeFile(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
  await writeFile(join(repo, 'src', 'b.py'), 'b = 2\n');
  store = openGraphDb(repo, ':memory:');
});

afterAll(async () => {
  store.db.close();
  await rm(repo, { recursive: true, force: true });
});

describe('incremental file lifecycle', () => {
  it('first index classifies everything NEW and bumps revision', async () => {
    const plan = await indexOnce();
    expect(plan.counts.NEW).toBe(2);
    expect(plan.counts.MODIFIED).toBe(0);
    expect(getGraphRevision(store.db)).toBe(1);
  });

  it('second index with no changes is all UNCHANGED and does not bump', async () => {
    const plan = await indexOnce();
    expect(plan.counts.UNCHANGED).toBe(2);
    expect(plan.counts.NEW).toBe(0);
    expect(getGraphRevision(store.db)).toBe(1);
  });

  it('mtime touch without content change stays UNCHANGED (hash check)', async () => {
    const future = new Date(Date.now() + 5_000);
    await utimes(join(repo, 'src', 'a.ts'), future, future);
    const plan = await indexOnce();
    expect(plan.counts.UNCHANGED).toBe(2);
    expect(plan.counts.MODIFIED).toBe(0);
  });

  it('content change is MODIFIED and bumps revision', async () => {
    await writeFile(join(repo, 'src', 'a.ts'), 'export const a = 42;\n');
    const plan = await indexOnce();
    expect(plan.counts.MODIFIED).toBe(1);
    expect(getGraphRevision(store.db)).toBe(2);
  });

  it('added and removed files classify NEW and DELETED', async () => {
    await writeFile(join(repo, 'src', 'c.ts'), 'export const c = 3;\n');
    await rm(join(repo, 'src', 'b.py'));
    const plan = await indexOnce();
    expect(plan.counts.NEW).toBe(1);
    expect(plan.counts.DELETED).toBe(1);
    const rows = store.db.all<{ path: string }>(
      `SELECT path FROM files WHERE repo_id = ? ORDER BY path`,
      store.repoId,
    );
    expect(rows.map((r) => r.path)).toEqual(['src/a.ts', 'src/c.ts']);
  });
});
