/**
 * Graph database DDL, schema version 1. Tables per spec section 14,
 * indexes per section 62, FTS5 virtual tables for lexical retrieval
 * (section 19). Kept as a TS constant (not a .sql asset) so the CLI
 * bundle needs no runtime file lookup.
 */
export const SCHEMA_VERSION = 1;

export const GRAPH_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repositories (
  id TEXT PRIMARY KEY,
  root_path TEXT NOT NULL,
  name TEXT NOT NULL,
  branch TEXT,
  worktree TEXT,
  commit_sha TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  repo_id TEXT NOT NULL,
  path TEXT NOT NULL,
  language TEXT,
  mtime INTEGER NOT NULL,
  size INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'UNCHANGED',
  last_indexed_at TEXT,
  UNIQUE (repo_id, path)
);

CREATE TABLE IF NOT EXISTS file_versions (
  content_hash TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  language TEXT NOT NULL,
  parse_artifact TEXT NOT NULL,
  indexed_at TEXT NOT NULL,
  PRIMARY KEY (content_hash, parser_version)
);

CREATE TABLE IF NOT EXISTS symbols (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  language TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  signature TEXT,
  doc TEXT,
  body_hash TEXT
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  edge_type TEXT NOT NULL,
  provenance TEXT NOT NULL,
  confidence REAL NOT NULL,
  source_file TEXT,
  start_line INTEGER,
  end_line INTEGER,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE (source_id, target_id, edge_type, source_file)
);

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  revision INTEGER NOT NULL,
  label TEXT
);

CREATE TABLE IF NOT EXISTS community_members (
  community_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  PRIMARY KEY (community_id, node_id)
);

CREATE TABLE IF NOT EXISTS centrality (
  node_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  revision INTEGER NOT NULL,
  PRIMARY KEY (node_id, metric)
);

CREATE TABLE IF NOT EXISTS instructions (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  agent TEXT NOT NULL,
  source_file TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  estimated_tokens INTEGER NOT NULL,
  current_mode TEXT NOT NULL,
  recommended_mode TEXT,
  semantic_tags TEXT,
  path_patterns TEXT,
  sessions_loaded INTEGER NOT NULL DEFAULT 0,
  sessions_relevant INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  agent TEXT NOT NULL,
  source_file TEXT NOT NULL,
  estimated_tokens INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS context_packs (
  id TEXT PRIMARY KEY,
  query_hash TEXT NOT NULL,
  task_class TEXT,
  strategy TEXT NOT NULL,
  budget INTEGER NOT NULL,
  used_tokens INTEGER NOT NULL,
  graph_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  pack TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_edges_sourcefile ON edges(source_file);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_qualified ON symbols(qualified_name);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_path);
CREATE INDEX IF NOT EXISTS idx_files_hash ON files(content_hash);

CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
  name, qualified_name, signature, doc, symbol_id UNINDEXED
);
CREATE VIRTUAL TABLE IF NOT EXISTS source_fts USING fts5(
  path UNINDEXED, chunk_start UNINDEXED, text
);
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  path UNINDEXED, text
);
`;

/**
 * Usage/learning DDL for the global ~/.setsu/setsu.db. Physically separate
 * from the per-repo code graph (spec section 91: CODE GRAPH vs USAGE MEMORY).
 */
export const USAGE_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  repo_id TEXT,
  task_fingerprint TEXT,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  target TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  alpha INTEGER NOT NULL DEFAULT 1,
  beta INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  ref_id TEXT,
  value TEXT NOT NULL,
  ts TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_patterns (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  task_class TEXT,
  agent TEXT,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS command_patterns (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  stats TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
`;
