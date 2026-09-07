const EXTENSION_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.pyi': 'python',
  '.sql': 'sql',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
};

export function languageForPath(posixPath: string): string | undefined {
  const dot = posixPath.lastIndexOf('.');
  if (dot === -1) return undefined;
  return EXTENSION_LANGUAGE[posixPath.slice(dot).toLowerCase()];
}

/** Languages the parser layer understands (tree-sitter grammars shipped). */
export const PARSEABLE_LANGUAGES = new Set(['typescript', 'tsx', 'javascript', 'python']);
