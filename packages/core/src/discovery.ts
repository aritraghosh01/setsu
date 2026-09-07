import fg from 'fast-glob';
import ignoreFactory from 'ignore';
import { readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { isInsideRepo, toRepoRelPosix } from './paths.js';
import { languageForPath } from './languages.js';

/** Default excludes per spec section 67. Applied before .gitignore/.setsuignore. */
export const DEFAULT_EXCLUDES = [
  '.git/**',
  'node_modules/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '.env',
  '.env.*',
  '**/*.pem',
  '**/*.key',
  '**/credentials.*',
  '**/secrets.*',
  '.setsu/**',
];

export interface DiscoveredFile {
  /** repo-relative POSIX path */
  path: string;
  language: string | undefined;
  size: number;
  mtimeMs: number;
}

async function loadIgnoreFile(repoRoot: string, name: string): Promise<string | undefined> {
  try {
    return await readFile(join(repoRoot, name), 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Discover indexable files: fast-glob walk, then filter through default
 * excludes + .gitignore + .setsuignore, then drop anything whose real path
 * escapes the repository (symlink guard, spec section 66).
 */
export async function discoverFiles(repoRoot: string): Promise<DiscoveredFile[]> {
  const ig = ignoreFactory();
  ig.add(DEFAULT_EXCLUDES.map((p) => p.replace(/\/\*\*$/, '/')));
  const gitignore = await loadIgnoreFile(repoRoot, '.gitignore');
  if (gitignore) ig.add(gitignore);
  const setsuignore = await loadIgnoreFile(repoRoot, '.setsuignore');
  if (setsuignore) ig.add(setsuignore);

  const entries = await fg('**/*', {
    cwd: repoRoot,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    suppressErrors: true,
    stats: true,
    ignore: ['.git/**', 'node_modules/**'],
  });

  const out: DiscoveredFile[] = [];
  for (const entry of entries) {
    const rel = toRepoRelPosix(repoRoot, join(repoRoot, entry.path));
    if (ig.ignores(rel)) continue;
    // fast-glob with followSymbolicLinks:false still lists symlink files;
    // verify the real target stays inside the repo.
    const st = await lstat(join(repoRoot, entry.path));
    if (st.isSymbolicLink() && !isInsideRepo(repoRoot, entry.path)) continue;
    out.push({
      path: rel,
      language: languageForPath(rel),
      size: entry.stats?.size ?? st.size,
      mtimeMs: entry.stats?.mtimeMs ?? st.mtimeMs,
    });
  }
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}
