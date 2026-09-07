# SETSU

**Give coding agents the code they need — not the whole repository.**

A local-first context efficiency and code intelligence layer for Claude Code, Codex, Cursor, Copilot and Kiro.

> ⚠️ Pre-release. SETSU is under active development toward `v0.1.0-beta.1`. Commands and formats may change.

## What is SETSU?

SETSU builds a persistent structural graph of your repository (the **SCOUT** engine: tree-sitter parse → symbols and edges → PageRank and communities → SQLite), routes every question to the cheapest reliable retrieval strategy, and returns token-budgeted evidence packs via CLI and MCP — so AI coding agents stop rediscovering your repo with grep/read loops.

- Persistent code graph
- Token-budgeted retrieval
- Incremental local indexing
- Instruction optimization
- Learns your usage patterns
- No API key required — your source never leaves your machine

## Quickstart

```bash
npx @setsu-ai/cli init
setsu context "How does auth work?"
setsu doctor
setsu optimize --dry-run
```

## Status

Bootstrap phase. See [docs/SETSU_SCOUT_DEVELOPMENT_SPEC.md](docs/SETSU_SCOUT_DEVELOPMENT_SPEC.md) for the full build specification.

## License

Apache-2.0 © 2026 Aritra Ghosh
