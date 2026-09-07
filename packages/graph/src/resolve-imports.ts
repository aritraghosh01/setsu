/** Resolve import specifiers to repo-relative POSIX paths. */

const TS_SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

function posixDirname(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function normalizePosix(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return '';
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

/**
 * Returns the repo file a specifier resolves to, or undefined for external
 * packages / unresolvable paths. `repoFiles` is the set of indexed paths.
 */
export function resolveImport(
  fromPath: string,
  specifier: string,
  language: string,
  repoFiles: ReadonlySet<string>,
): string | undefined {
  if (language === 'python') {
    return resolvePythonImport(fromPath, specifier, repoFiles);
  }
  if (!specifier.startsWith('.')) return undefined;
  const base = normalizePosix(`${posixDirname(fromPath)}/${specifier}`);
  if (!base) return undefined;
  for (const suffix of TS_SUFFIXES) {
    const candidate = base + suffix;
    if (repoFiles.has(candidate)) return candidate;
  }
  return undefined;
}

function resolvePythonImport(
  fromPath: string,
  specifier: string,
  repoFiles: ReadonlySet<string>,
): string | undefined {
  let moduleDots = specifier;
  let baseDir = '';
  if (specifier.startsWith('.')) {
    // relative import: one dot = current package, each extra dot goes up
    let dots = 0;
    while (moduleDots.startsWith('.')) {
      dots += 1;
      moduleDots = moduleDots.slice(1);
    }
    baseDir = posixDirname(fromPath);
    for (let i = 1; i < dots; i += 1) baseDir = posixDirname(baseDir);
  }
  const rel = moduleDots.split('.').filter(Boolean).join('/');
  const base = normalizePosix(baseDir ? `${baseDir}/${rel}` : rel);
  if (!base) return undefined;
  for (const candidate of [`${base}.py`, `${base}/__init__.py`]) {
    if (repoFiles.has(candidate)) return candidate;
  }
  return undefined;
}
