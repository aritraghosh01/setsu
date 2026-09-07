import type { GraphStore } from '@setsu-ai/storage';

export interface SymbolFtsHit {
  symbolId: string;
  score: number;
}

export interface SourceFtsHit {
  path: string;
  chunkStart: number;
  snippet: string;
  score: number;
}

/** Quote each term so FTS5 never sees query syntax from user input. */
function ftsQuery(terms: readonly string[]): string {
  const cleaned = terms
    .map((t) => t.replace(/"/g, '').trim())
    .filter((t) => t.length > 1)
    .map((t) => `"${t}"`);
  return cleaned.join(' OR ');
}

export function searchSymbols(
  store: GraphStore,
  terms: readonly string[],
  limit = 20,
): SymbolFtsHit[] {
  const match = ftsQuery(terms);
  if (!match) return [];
  try {
    const rows = store.db.all<{ symbol_id: string; rank: number }>(
      `SELECT symbol_id, rank FROM symbols_fts WHERE symbols_fts MATCH ? ORDER BY rank LIMIT ?`,
      match,
      limit,
    );
    // FTS5 rank is negative (better = more negative); normalize to 0..1.
    return rows.map((row, i) => ({ symbolId: row.symbol_id, score: 1 - i / Math.max(rows.length, 1) }));
  } catch {
    return [];
  }
}

export function searchSource(
  store: GraphStore,
  terms: readonly string[],
  limit = 20,
): SourceFtsHit[] {
  const match = ftsQuery(terms);
  if (!match) return [];
  try {
    const rows = store.db.all<{ path: string; chunk_start: number; snip: string }>(
      `SELECT path, chunk_start, snippet(source_fts, 2, '', '', ' ... ', 16) AS snip
       FROM source_fts WHERE source_fts MATCH ? ORDER BY rank LIMIT ?`,
      match,
      limit,
    );
    return rows.map((row, i) => ({
      path: row.path,
      chunkStart: row.chunk_start,
      snippet: row.snip,
      score: 1 - i / Math.max(rows.length, 1),
    }));
  } catch {
    return [];
  }
}
