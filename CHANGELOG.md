# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-beta.1] - 2026-09-08

First public release: a local-first context efficiency and code intelligence
layer for AI coding agents. Your agent stops rediscovering the repository with
grep loops and starts navigating a persistent code graph under a hard token
budget. No API key, no account, source never leaves the machine.

### Added

- **SCOUT code graph**: tree-sitter parsing (TypeScript/TSX/JavaScript/Python)
  into symbols and typed edges (calls, imports, extends, implements,
  references, contains, defines) with provenance labels on every edge
  (AST_EXACT 1.0 down to LEXICAL_DERIVED ≤0.95). Stable node ids survive line
  moves and body edits. Content-addressed incremental indexing: unchanged
  content is never reparsed; single-file updates reindex in well under a
  second. `setsu index [--watch]`, `setsu graph stats|node|community|top|export`.
- **Graph intelligence**: in-house personalized PageRank, Louvain communities
  (deterministic), bounded traversals — `setsu symbol`, `setsu path` (shortest
  relationship chain with provenance), `setsu impact` (blast radius with
  affected tests and files).
- **Token-budgeted retrieval**: `setsu context "<question>"` classifies the
  task, routes across graph/lexical-FTS5/repo-map/hybrid strategies, and packs
  the highest-value evidence under an explicit budget (`--budget`, `--explain`,
  `--json`). Every pack carries strategy, confidence, completeness and graph
  revision.
- **MCP server**: `setsu mcp serve` exposes exactly five tools over stdio —
  `setsu_context`, `setsu_symbol`, `setsu_path`, `setsu_impact`,
  `setsu_status`. No network listener.
- **Agent adapters**: detection + instruction inventory for Claude Code,
  Codex, Cursor, Copilot and Kiro; deep config generation (managed guidance
  block + MCP registration) for Claude, Codex and Cursor. `setsu init` runs
  the full first-run flow; `setsu adapters` shows the inventory.
- **Doctor + optimizer**: `setsu doctor` scores your context setup 0-100
  (persistent cost, scoping, duplication, graph freshness, MCP surface) with
  honest reweighting when a metric has no data yet; `setsu scan --ci` gates CI
  on thresholds; `setsu optimize` previews diffs and applies guidance/MCP
  changes with backup + atomic write + rollback. User prose is never
  auto-edited.
- **Local learning**: retrieval outcomes per task class (recency-weighted
  scores), Beta-Bernoulli recommendation acceptance that quiets rejected
  suggestions, session continuity scoring. `setsu learn`, `setsu feedback`.
- **Privacy**: `setsu privacy inspect` lists every stored category and
  location; `purge` deletes everything; task terms are hashed with a
  per-device salt; raw prompts are never persisted; zero network calls.
- **Benchmarks**: deterministic grep-baseline comparison (`setsu benchmark`)
  and a Claude Code A/B harness measuring real cost, turns and context tokens
  (`benchmarks/claude-e2e/`).

### For contributors

- npm-workspaces monorepo (9 packages bundled into `@setsu-ai/cli`), strict
  TypeScript ESM, zero native dependencies (`node:sqlite` + WASM grammars).
- Golden-test fixtures (`ts-sample`, `py-sample`, `agents-sample`) with exact
  extraction expectations; unit/integration/e2e vitest projects; CI matrix
  across ubuntu/macos/windows × Node 22/24.
