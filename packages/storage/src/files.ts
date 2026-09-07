import { join } from 'node:path';
import { hashFile, type DiscoveredFile } from '@setsu-ai/core';
import type { Db } from './driver.js';

/** File lifecycle states, spec section 15. */
export type FileState = 'UNCHANGED' | 'NEW' | 'MODIFIED' | 'DELETED' | 'RETAGGED';

export interface FileChange {
  path: string;
  language: string | undefined;
  state: FileState;
  contentHash: string;
  size: number;
  mtimeMs: number;
}

export interface FileChangePlan {
  changes: FileChange[];
  counts: Record<FileState, number>;
}

interface FileRow {
  path: string;
  language: string | null;
  mtime: number;
  size: number;
  content_hash: string;
}

/**
 * Classify discovered files against the stored file table. Fast path:
 * unchanged (mtime, size) pairs skip hashing entirely; only suspects are
 * hashed, and identical hashes still resolve to UNCHANGED (mtime refresh).
 */
export async function classifyFiles(
  db: Db,
  repoId: string,
  repoRoot: string,
  discovered: DiscoveredFile[],
): Promise<FileChangePlan> {
  const known = new Map<string, FileRow>();
  for (const row of db.all<FileRow>(
    `SELECT path, language, mtime, size, content_hash FROM files WHERE repo_id = ?`,
    repoId,
  )) {
    known.set(row.path, row);
  }

  const changes: FileChange[] = [];
  const seen = new Set<string>();

  for (const file of discovered) {
    seen.add(file.path);
    const prev = known.get(file.path);
    if (prev && prev.mtime === Math.trunc(file.mtimeMs) && prev.size === file.size) {
      changes.push({
        path: file.path,
        language: file.language,
        state: 'UNCHANGED',
        contentHash: prev.content_hash,
        size: file.size,
        mtimeMs: file.mtimeMs,
      });
      continue;
    }
    const contentHash = await hashFile(join(repoRoot, file.path));
    if (!prev) {
      changes.push({ path: file.path, language: file.language, state: 'NEW', contentHash, size: file.size, mtimeMs: file.mtimeMs });
    } else if (prev.content_hash === contentHash) {
      changes.push({ path: file.path, language: file.language, state: 'UNCHANGED', contentHash, size: file.size, mtimeMs: file.mtimeMs });
    } else {
      changes.push({ path: file.path, language: file.language, state: 'MODIFIED', contentHash, size: file.size, mtimeMs: file.mtimeMs });
    }
  }

  for (const [path, row] of known) {
    if (!seen.has(path)) {
      changes.push({
        path,
        language: row.language ?? undefined,
        state: 'DELETED',
        contentHash: row.content_hash,
        size: row.size,
        mtimeMs: row.mtime,
      });
    }
  }

  const counts: Record<FileState, number> = { UNCHANGED: 0, NEW: 0, MODIFIED: 0, DELETED: 0, RETAGGED: 0 };
  for (const c of changes) counts[c.state] += 1;
  return { changes, counts };
}

/** Persist a change plan's file rows. Caller wraps in a transaction. */
export function applyFileChanges(db: Db, repoId: string, plan: FileChangePlan): void {
  const now = new Date().toISOString();
  for (const c of plan.changes) {
    switch (c.state) {
      case 'NEW':
      case 'MODIFIED':
        db.run(
          `INSERT INTO files (repo_id, path, language, mtime, size, content_hash, state, last_indexed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(repo_id, path) DO UPDATE SET
             language = excluded.language, mtime = excluded.mtime, size = excluded.size,
             content_hash = excluded.content_hash, state = excluded.state,
             last_indexed_at = excluded.last_indexed_at`,
          repoId, c.path, c.language ?? null, Math.trunc(c.mtimeMs), c.size, c.contentHash, c.state, now,
        );
        break;
      case 'UNCHANGED':
        db.run(
          `UPDATE files SET mtime = ?, size = ?, state = 'UNCHANGED' WHERE repo_id = ? AND path = ?`,
          Math.trunc(c.mtimeMs), c.size, repoId, c.path,
        );
        break;
      case 'DELETED':
        db.run(`DELETE FROM files WHERE repo_id = ? AND path = ?`, repoId, c.path);
        break;
      case 'RETAGGED':
        break;
    }
  }
}
