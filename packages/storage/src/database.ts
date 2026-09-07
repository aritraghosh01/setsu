import { homedir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { sha256Hex } from '@setsu-ai/core';
import { Db } from './driver.js';
import { GRAPH_SCHEMA, USAGE_SCHEMA, SCHEMA_VERSION } from './schema.js';

export function setsuHome(): string {
  return process.env['SETSU_HOME'] ?? join(homedir(), '.setsu');
}

/** Stable repo id from the normalized absolute root path. */
export function repoIdFor(repoRoot: string): string {
  const normalized = resolve(repoRoot).split('\\').join('/').toLowerCase();
  return sha256Hex(normalized).slice(0, 16);
}

export function graphDbPath(repoRoot: string): string {
  return join(setsuHome(), 'repos', repoIdFor(repoRoot), 'graph.db');
}

export function usageDbPath(): string {
  return join(setsuHome(), 'setsu.db');
}

function applySchema(db: Db, ddl: string): void {
  db.exec(ddl);
  const row = db.get<{ value: string }>(`SELECT value FROM meta WHERE key = 'schema_version'`);
  if (!row) {
    db.run(
      `INSERT INTO meta (key, value) VALUES ('schema_version', ?)`,
      String(SCHEMA_VERSION),
    );
  }
}

/** Best-effort git branch/commit without spawning processes. */
export function gitInfo(repoRoot: string): { branch?: string; commitSha?: string } {
  try {
    const head = readFileSync(join(repoRoot, '.git', 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref: ')) {
      const ref = head.slice(5);
      const branch = ref.replace('refs/heads/', '');
      try {
        const sha = readFileSync(join(repoRoot, '.git', ref), 'utf8').trim();
        return { branch, commitSha: sha };
      } catch {
        return { branch };
      }
    }
    return { commitSha: head };
  } catch {
    return {};
  }
}

export interface GraphStore {
  db: Db;
  repoId: string;
  repoRoot: string;
}

export function openGraphDb(repoRoot: string, dbPath?: string): GraphStore {
  const root = resolve(repoRoot);
  const repoId = repoIdFor(root);
  const db = new Db(dbPath ?? graphDbPath(root));
  applySchema(db, GRAPH_SCHEMA);

  const info = gitInfo(root);
  db.run(
    `INSERT INTO repositories (id, root_path, name, branch, commit_sha, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       root_path = excluded.root_path,
       branch = excluded.branch,
       commit_sha = excluded.commit_sha`,
    repoId,
    root.split('\\').join('/'),
    basename(root),
    info.branch ?? null,
    info.commitSha ?? null,
    new Date().toISOString(),
  );

  return { db, repoId, repoRoot: root };
}

export function openUsageDb(dbPath?: string): Db {
  const db = new Db(dbPath ?? usageDbPath());
  applySchema(db, USAGE_SCHEMA);
  return db;
}

export function getGraphRevision(db: Db): number {
  const row = db.get<{ value: string }>(`SELECT value FROM meta WHERE key = 'graph_revision'`);
  return row ? Number(row.value) : 0;
}

export function bumpGraphRevision(db: Db): number {
  const next = getGraphRevision(db) + 1;
  db.run(
    `INSERT INTO meta (key, value) VALUES ('graph_revision', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    String(next),
  );
  return next;
}
