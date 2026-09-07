import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { discoverFiles, estimateTokens } from '@setsu-ai/core';
import {
  classifyFiles,
  applyFileChanges,
  bumpGraphRevision,
  getGraphRevision,
  type GraphStore,
} from '@setsu-ai/storage';
import {
  parseSource,
  parserVersionFor,
  canParse,
  type ParseArtifact,
  type ParsedSymbol,
} from '@setsu-ai/parsers';
import { symbolId, fileId, externalId, edgeId } from './ids.js';
import { resolveImport } from './resolve-imports.js';
import { analyzeGraph } from './analyze.js';

export interface IndexResult {
  files: number;
  parsed: number;
  cacheHits: number;
  symbols: number;
  edges: number;
  revision: number;
  counts: Record<string, number>;
  durationMs: number;
}

interface SymbolRef {
  id: string;
  path: string;
  kind: string;
  qualifiedName: string;
}

/** Fetch or compute the ParseArtifact for a file (content-addressed cache). */
async function artifactFor(
  store: GraphStore,
  path: string,
  language: string,
  contentHash: string,
): Promise<{ artifact: ParseArtifact; cacheHit: boolean }> {
  const parserVersion = parserVersionFor(language);
  const cached = store.db.get<{ parse_artifact: string }>(
    `SELECT parse_artifact FROM file_versions WHERE content_hash = ? AND parser_version = ?`,
    contentHash,
    parserVersion,
  );
  if (cached) {
    return { artifact: JSON.parse(cached.parse_artifact) as ParseArtifact, cacheHit: true };
  }
  const source = await readFile(join(store.repoRoot, path), 'utf8');
  const artifact = await parseSource(source, language);
  store.db.run(
    `INSERT OR REPLACE INTO file_versions (content_hash, parser_version, language, parse_artifact, indexed_at)
     VALUES (?, ?, ?, ?, ?)`,
    contentHash,
    parserVersion,
    language,
    JSON.stringify(artifact),
    new Date().toISOString(),
  );
  return { artifact, cacheHit: false };
}

function upsertSymbols(
  store: GraphStore,
  path: string,
  language: string,
  artifact: ParseArtifact,
): void {
  store.db.run(`DELETE FROM symbols WHERE repo_id = ? AND file_path = ?`, store.repoId, path);
  for (const sym of artifact.symbols) {
    store.db.run(
      `INSERT OR REPLACE INTO symbols
         (id, repo_id, file_path, name, qualified_name, kind, language, start_line, end_line, signature, doc, body_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      symbolId(path, language, sym.kind, sym.qualifiedName),
      store.repoId,
      path,
      sym.name,
      sym.qualifiedName,
      sym.kind,
      language,
      sym.startLine,
      sym.endLine,
      sym.signature,
      sym.doc ?? null,
      sym.bodyHash,
    );
  }
}

interface Resolution {
  targetId: string;
  provenance: string;
  confidence: number;
}

function resolveName(
  toName: string,
  fromPath: string,
  byName: Map<string, SymbolRef[]>,
  byQualified: Map<string, SymbolRef>,
  allowedKinds: ReadonlySet<string>,
): Resolution[] {
  // Exact qualified match in the same file wins outright.
  const sameFileQualified = byQualified.get(`${fromPath}::${toName}`);
  if (sameFileQualified) {
    return [{ targetId: sameFileQualified.id, provenance: 'AST_EXACT', confidence: 1.0 }];
  }
  const lastSegment = toName.includes('.') ? toName.slice(toName.lastIndexOf('.') + 1) : toName;
  const candidates = (byName.get(lastSegment) ?? []).filter((c) => allowedKinds.has(c.kind));
  if (candidates.length === 0) return [];

  const sameFile = candidates.filter((c) => c.path === fromPath);
  if (sameFile.length === 1) {
    return [{ targetId: sameFile[0]!.id, provenance: 'AST_EXACT', confidence: 1.0 }];
  }
  if (candidates.length === 1) {
    return [{ targetId: candidates[0]!.id, provenance: 'LEXICAL_DERIVED', confidence: 0.9 }];
  }
  if (candidates.length <= 3) {
    // Ambiguous name shared by a few symbols: keep all, honestly low-confidence.
    return candidates.map((c) => ({
      targetId: c.id,
      provenance: 'LEXICAL_DERIVED',
      confidence: 0.6,
    }));
  }
  return [];
}

const CALL_KINDS = new Set(['function', 'method', 'class']);
const TYPE_KINDS = new Set(['class', 'interface', 'type', 'enum']);
const REF_KINDS = new Set(['class', 'interface', 'type', 'enum', 'function', 'variable']);

/**
 * Rebuild the edges table from per-file parse artifacts. Symbol rows are
 * incremental; edges are re-derived every run because a new symbol anywhere
 * can change how an old file's references resolve. Artifacts are cached by
 * content hash, so this is pure in-memory work plus one transaction.
 */
function rebuildEdges(
  store: GraphStore,
  artifacts: Map<string, { language: string; artifact: ParseArtifact }>,
): number {
  const now = new Date().toISOString();
  const repoFiles = new Set(artifacts.keys());

  const byName = new Map<string, SymbolRef[]>();
  const byQualified = new Map<string, SymbolRef>();
  const symbolsByFile = new Map<string, ParsedSymbol[]>();
  for (const [path, { language, artifact }] of artifacts) {
    symbolsByFile.set(path, artifact.symbols);
    for (const sym of artifact.symbols) {
      const ref: SymbolRef = {
        id: symbolId(path, language, sym.kind, sym.qualifiedName),
        path,
        kind: sym.kind,
        qualifiedName: sym.qualifiedName,
      };
      byQualified.set(`${path}::${sym.qualifiedName}`, ref);
      const list = byName.get(sym.name);
      if (list) list.push(ref);
      else byName.set(sym.name, [ref]);
    }
  }

  const fromIdFor = (path: string, fromSymbol: string): string => {
    if (fromSymbol === '') return fileId(path);
    // Walk up the qualified name until a real symbol matches (relations can
    // originate from nested scopes that are not symbols themselves).
    let name = fromSymbol;
    for (;;) {
      const ref = byQualified.get(`${path}::${name}`);
      if (ref) return ref.id;
      const dot = name.lastIndexOf('.');
      if (dot === -1) return fileId(path);
      name = name.slice(0, dot);
    }
  };

  store.db.run(`DELETE FROM edges WHERE repo_id = ?`, store.repoId);

  const externals = new Set<string>();
  const insert = (
    sourceId: string,
    targetId: string,
    type: string,
    provenance: string,
    confidence: number,
    sourceFile: string,
    line: number,
  ): void => {
    store.db.run(
      `INSERT OR IGNORE INTO edges
         (id, repo_id, source_id, target_id, edge_type, provenance, confidence, source_file, start_line, end_line, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      edgeId(sourceId, targetId, type, sourceFile),
      store.repoId,
      sourceId,
      targetId,
      type,
      provenance,
      confidence,
      sourceFile,
      line,
      line,
      now,
      now,
    );
  };

  for (const [path, { language, artifact }] of artifacts) {
    for (const sym of artifact.symbols) {
      const id = symbolId(path, language, sym.kind, sym.qualifiedName);
      if (!sym.qualifiedName.includes('.')) {
        // file -> top-level symbol
        insert(fileId(path), id, 'defines', 'AST_EXACT', 1.0, path, sym.startLine);
      } else {
        // enclosing symbol -> member (class -> method, etc.)
        const parentQualified = sym.qualifiedName.slice(0, sym.qualifiedName.lastIndexOf('.'));
        const parent = byQualified.get(`${path}::${parentQualified}`);
        if (parent) insert(parent.id, id, 'contains', 'AST_EXACT', 1.0, path, sym.startLine);
      }
    }

    for (const rel of artifact.relations) {
      const fromId = fromIdFor(path, rel.fromSymbol);
      switch (rel.type) {
        case 'imports': {
          const resolved = resolveImport(path, rel.toName, language, repoFiles);
          if (resolved) {
            insert(fileId(path), fileId(resolved), 'imports', 'AST_EXACT', 1.0, path, rel.line);
          } else {
            const ext = externalId(rel.toName);
            if (!externals.has(rel.toName)) {
              externals.add(rel.toName);
              store.db.run(
                `INSERT OR REPLACE INTO symbols
                   (id, repo_id, file_path, name, qualified_name, kind, language, start_line, end_line, signature, doc, body_hash)
                 VALUES (?, ?, '', ?, ?, 'external', 'external', 0, 0, ?, NULL, '')`,
                ext,
                store.repoId,
                rel.toName,
                rel.toName,
                `external module ${rel.toName}`,
              );
            }
            insert(fileId(path), ext, 'depends_on', 'AST_EXACT', 1.0, path, rel.line);
          }
          break;
        }
        case 'extends':
        case 'implements': {
          for (const r of resolveName(rel.toName, path, byName, byQualified, TYPE_KINDS)) {
            insert(fromId, r.targetId, rel.type, r.provenance, r.confidence, path, rel.line);
          }
          break;
        }
        case 'calls': {
          for (const r of resolveName(rel.toName, path, byName, byQualified, CALL_KINDS)) {
            insert(fromId, r.targetId, 'calls', r.provenance, r.confidence, path, rel.line);
          }
          break;
        }
        case 'references': {
          for (const r of resolveName(rel.toName, path, byName, byQualified, REF_KINDS)) {
            insert(fromId, r.targetId, 'references', r.provenance, r.confidence, path, rel.line);
          }
          break;
        }
        default:
          break;
      }
    }
  }
  return (
    store.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM edges WHERE repo_id = ?`, store.repoId)
      ?.n ?? 0
  );
}

export interface IndexOptions {
  full?: boolean;
}

export async function indexRepo(store: GraphStore, opts: IndexOptions = {}): Promise<IndexResult> {
  const started = Date.now();
  if (opts.full) {
    store.db.transaction(() => {
      store.db.run(`DELETE FROM files WHERE repo_id = ?`, store.repoId);
      store.db.run(`DELETE FROM symbols WHERE repo_id = ?`, store.repoId);
      store.db.run(`DELETE FROM edges WHERE repo_id = ?`, store.repoId);
      store.db.run(`DELETE FROM file_versions`);
    });
  }

  const discovered = await discoverFiles(store.repoRoot);
  const plan = await classifyFiles(store.db, store.repoId, store.repoRoot, discovered);
  const changed = plan.counts.NEW + plan.counts.MODIFIED + plan.counts.DELETED;

  let parsed = 0;
  let cacheHits = 0;
  const artifacts = new Map<string, { language: string; artifact: ParseArtifact }>();

  // Load artifacts for every parseable file; parse only NEW/MODIFIED misses.
  for (const change of plan.changes) {
    if (change.state === 'DELETED' || !canParse(change.language)) continue;
    const { artifact, cacheHit } = await artifactFor(
      store,
      change.path,
      change.language,
      change.contentHash,
    );
    if (cacheHit) cacheHits += 1;
    else parsed += 1;
    artifacts.set(change.path, { language: change.language, artifact });
  }

  let edges = 0;
  let edgesRebuilt = false;
  store.db.transaction(() => {
    applyFileChanges(store.db, store.repoId, plan);
    for (const change of plan.changes) {
      if (change.state === 'DELETED') {
        store.db.run(
          `DELETE FROM symbols WHERE repo_id = ? AND file_path = ?`,
          store.repoId,
          change.path,
        );
        continue;
      }
      if ((change.state === 'NEW' || change.state === 'MODIFIED') && artifacts.has(change.path)) {
        upsertSymbols(store, change.path, change.language!, artifacts.get(change.path)!.artifact);
      }
    }
    if (changed > 0 || opts.full) {
      edges = rebuildEdges(store, artifacts);
      bumpGraphRevision(store.db);
      edgesRebuilt = true;
    } else {
      const row = store.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM edges WHERE repo_id = ?`,
        store.repoId,
      );
      edges = row?.n ?? 0;
    }
  });

  if (edgesRebuilt) {
    analyzeGraph(store);
  }

  const symbolCount =
    store.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM symbols WHERE repo_id = ? AND kind != 'external'`,
      store.repoId,
    )?.n ?? 0;

  return {
    files: discovered.length,
    parsed,
    cacheHits,
    symbols: symbolCount,
    edges,
    revision: getGraphRevision(store.db),
    counts: plan.counts,
    durationMs: Date.now() - started,
  };
}

export interface GraphStats {
  files: number;
  symbols: number;
  edges: number;
  revision: number;
  symbolsByKind: Record<string, number>;
  edgesByType: Record<string, number>;
  estimatedGraphTokens: number;
}

export function graphStats(store: GraphStore): GraphStats {
  const files =
    store.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM files WHERE repo_id = ?`, store.repoId)
      ?.n ?? 0;
  const symbolsByKind: Record<string, number> = {};
  let symbols = 0;
  for (const row of store.db.all<{ kind: string; n: number }>(
    `SELECT kind, COUNT(*) AS n FROM symbols WHERE repo_id = ? GROUP BY kind ORDER BY n DESC`,
    store.repoId,
  )) {
    symbolsByKind[row.kind] = row.n;
    if (row.kind !== 'external') symbols += row.n;
  }
  const edgesByType: Record<string, number> = {};
  let edges = 0;
  for (const row of store.db.all<{ edge_type: string; n: number }>(
    `SELECT edge_type, COUNT(*) AS n FROM edges WHERE repo_id = ? GROUP BY edge_type ORDER BY n DESC`,
    store.repoId,
  )) {
    edgesByType[row.edge_type] = row.n;
    edges += row.n;
  }
  const signatures = store.db.all<{ signature: string | null }>(
    `SELECT signature FROM symbols WHERE repo_id = ?`,
    store.repoId,
  );
  const estimatedGraphTokens = signatures.reduce(
    (n, r) => n + estimateTokens(r.signature ?? ''),
    0,
  );
  return {
    files,
    symbols,
    edges,
    revision: getGraphRevision(store.db),
    symbolsByKind,
    edgesByType,
    estimatedGraphTokens,
  };
}
