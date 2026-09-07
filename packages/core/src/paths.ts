import { isAbsolute, relative, resolve, sep } from 'node:path';
import { realpathSync } from 'node:fs';

/**
 * Normalize an absolute or repo-relative path to the canonical repo-relative
 * POSIX form used everywhere in SETSU (stable node IDs, golden tests, FTS).
 * Windows separators become '/'; the result never starts with '/' or drive.
 */
export function toRepoRelPosix(repoRoot: string, filePath: string): string {
  const abs = isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
  const rel = relative(resolve(repoRoot), abs);
  if (rel.startsWith('..')) {
    throw new PathEscapeError(filePath, repoRoot);
  }
  return rel.split(sep).join('/');
}

export class PathEscapeError extends Error {
  constructor(filePath: string, repoRoot: string) {
    super(`Path escapes repository boundary: ${filePath} (repo: ${repoRoot})`);
    this.name = 'PathEscapeError';
  }
}

/**
 * True when the real (symlink-resolved) location of `filePath` stays inside
 * the real repo root. Spec section 66: do not follow external symlinks.
 */
export function isInsideRepo(repoRoot: string, filePath: string): boolean {
  try {
    const realRoot = realpathSync(resolve(repoRoot));
    const realFile = realpathSync(resolve(repoRoot, filePath));
    const rel = relative(realRoot, realFile);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  } catch {
    return false;
  }
}
