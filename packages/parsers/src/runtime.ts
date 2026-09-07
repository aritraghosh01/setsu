import { Parser, Language } from 'web-tree-sitter';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GRAMMAR_FILES: Record<string, string> = {
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm',
};

let initialized = false;
const languages = new Map<string, Language>();
const parsers = new Map<string, Parser>();

/**
 * Locate the committed grammar directory. Works from source (packages/
 * parsers/src → ../wasm) and from the bundled CLI (dist/setsu.js → ../wasm
 * copied into the published package). SETSU_WASM_DIR overrides for tests
 * and unusual layouts.
 */
export function wasmDir(): string {
  const override = process.env['SETSU_WASM_DIR'];
  if (override) return override;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..', 'wasm'),
    join(here, 'wasm'),
    join(here, '..', '..', 'parsers', 'wasm'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, GRAMMAR_FILES['typescript']!))) return c;
  }
  throw new Error(
    `SETSU grammar files not found. Looked in: ${candidates.join(', ')}. ` +
      `Set SETSU_WASM_DIR or run scripts/fetch-grammars.mjs.`,
  );
}

export async function getParser(language: string): Promise<Parser> {
  const grammarFile = GRAMMAR_FILES[language];
  if (!grammarFile) throw new Error(`No grammar for language: ${language}`);

  if (!initialized) {
    await Parser.init();
    initialized = true;
  }
  let parser = parsers.get(language);
  if (!parser) {
    let lang = languages.get(language);
    if (!lang) {
      lang = await Language.load(join(wasmDir(), grammarFile));
      languages.set(language, lang);
    }
    parser = new Parser();
    parser.setLanguage(lang);
    parsers.set(language, parser);
  }
  return parser;
}

export function supportedLanguages(): string[] {
  return Object.keys(GRAMMAR_FILES);
}
