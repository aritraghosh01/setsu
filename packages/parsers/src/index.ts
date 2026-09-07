import { getParser } from './runtime.js';
import { extractTypeScript, TS_PARSER_VERSION } from './extractors/typescript.js';
import { extractPython, PY_PARSER_VERSION } from './extractors/python.js';
import type { ParseArtifact } from './types.js';

export type {
  ParseArtifact,
  ParsedSymbol,
  ParsedRelation,
  SymbolKind,
  RelationType,
} from './types.js';
export { supportedLanguages, wasmDir } from './runtime.js';
export { TS_PARSER_VERSION } from './extractors/typescript.js';
export { PY_PARSER_VERSION } from './extractors/python.js';

const TS_FAMILY = new Set(['typescript', 'tsx', 'javascript']);

export function parserVersionFor(language: string): string {
  if (TS_FAMILY.has(language)) return TS_PARSER_VERSION;
  if (language === 'python') return PY_PARSER_VERSION;
  throw new Error(`Unsupported language: ${language}`);
}

export function canParse(language: string | undefined): language is string {
  return language !== undefined && (TS_FAMILY.has(language) || language === 'python');
}

/** Parse source text into a deterministic ParseArtifact (spec section 17). */
export async function parseSource(source: string, language: string): Promise<ParseArtifact> {
  const parserVersion = parserVersionFor(language);
  const parser = await getParser(language);
  const tree = parser.parse(source);
  if (!tree) {
    return { language, parserVersion, symbols: [], relations: [], hadErrors: true };
  }
  try {
    return language === 'python'
      ? extractPython(tree.rootNode)
      : extractTypeScript(tree.rootNode, language);
  } finally {
    tree.delete();
  }
}
