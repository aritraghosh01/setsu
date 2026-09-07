<div align="center">

# 節 SETSU

<h3>Give coding agents the code they need — not the whole repository.</h3>

<p><em>setsu — /seh-tsoo/ · noun · Japanese 節 · node, joint, section</em></p>

<p>
  <a href="https://www.npmjs.com/package/@setsu-ai/cli"><img src="https://img.shields.io/badge/npm-%40setsu--ai%2Fcli-0E1A2B?style=flat-square" alt="npm"></a>
  <img src="https://img.shields.io/badge/license-Apache--2.0-1F6F4A?style=flat-square" alt="Apache-2.0">
  <img src="https://img.shields.io/badge/node-%3E%3D22.13-A03A26?style=flat-square" alt="node >=22.13">
  <img src="https://img.shields.io/badge/MCP-native-0E1A2B?style=flat-square" alt="MCP native">
  <img src="https://img.shields.io/badge/PRs-welcome-1F6F4A?style=flat-square" alt="PRs welcome">
</p>

```bash
npx @setsu-ai/cli init
setsu context "How does auth work?"
```

<sub>Local-first context efficiency + code intelligence for Claude Code, Codex, Cursor, Copilot and Kiro.</sub>

</div>

---

## 🧠 What is SETSU?

AI coding agents rediscover your repository from raw files on every task: grep, read,
re-read, repeat. That loop burns your context window and your money.

SETSU builds a **persistent code graph** of your repository once (tree-sitter parse →
symbols and typed edges → PageRank and communities → SQLite), keeps it fresh
incrementally, and answers questions with **token-budgeted evidence packs** — the
smallest set of signatures, snippets, and graph paths that answers the question, with
provenance on every edge.

- 🗺️ **Persistent code graph** — symbols, calls, imports, implements, tests; typed and provenance-labeled
- 🎯 **Token-budgeted retrieval** — every pack has a hard budget; a greedy value/cost packer fills it
- 🔀 **Adaptive routing** — graph traversal, lexical FTS, repo map, or hybrid, chosen per task
- ⚡ **Incremental** — content-addressed cache; unchanged files are never reparsed
- 🔌 **MCP-native** — five tools, stdio only, no network listener
- 📉 **Instruction doctor** — measures what your CLAUDE.md/rules actually cost per session
- 🧪 **Learns locally** — which strategy works for which task class, on your machine only
- 🔒 **No API key. No account. Source never leaves your machine.**

## ⚙️ How it works

```text
            AI CODING AGENT (Claude / Codex / Cursor / ...)
                              │  setsu_context("How does checkout reach Stripe?")
                              ▼
                    ┌──────────────────┐
                    │   SETSU ROUTER   │  task classifier
                    └────────┬─────────┘
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
   Graph traversal    Lexical / FTS5      Repo map (PageRank)
          └─────────────────┼──────────────────┘
                            ▼
                  TOKEN BUDGET PACKER
                            ▼
              ContextPack (~1,300 est. tokens)
     path: CheckoutController → CheckoutService → PaymentGateway → StripeAdapter
```

Below the retrieval layer: files → content hash → tree-sitter parse → symbol +
edge extraction → import resolution → PageRank + Louvain communities → SQLite
(FTS5 included) → incremental watcher.

## ⚡ Quickstart

```bash
npm install -g @setsu-ai/cli    # or npx @setsu-ai/cli init

setsu init                      # detect agents, build the graph, offer MCP install
setsu context "How does checkout reach the payment gateway?" --explain
setsu doctor                    # what your agent setup costs per session
setsu optimize --dry-run        # what SETSU would improve, as diffs
```

## 🧰 Commands

| Command | What it does |
|---|---|
| `setsu init` | Detect agents, create `.setsu/`, build the graph, offer MCP + guidance install |
| `setsu context "<q>"` | Token-budgeted evidence pack; `--budget`, `--explain`, `--json` |
| `setsu symbol <name>` | Definition, signature, callers, callees |
| `setsu path <a> <b>` | Shortest relationship chain with edge types + provenance |
| `setsu impact <name>` | Blast radius: dependents, affected tests and files |
| `setsu index [--watch]` | Incremental reindex (or keep it fresh continuously) |
| `setsu doctor` / `setsu scan --ci` | Context Efficiency Score, instruction cost, thresholds for CI |
| `setsu optimize [--dry-run\|--apply]` | Guidance + MCP install with backup/rollback; advisory dedupe |
| `setsu learn` / `setsu feedback` | Learned strategy scores; rate the last pack |
| `setsu privacy inspect\|purge` | Exactly what is stored where; delete it all |
| `setsu mcp serve` | The 5-tool MCP surface over stdio |
| `setsu benchmark` | Grep-first baseline vs SETSU, estimated tokens, honest numbers |

## 🔒 Privacy

Everything is local: the graph lives in `~/.setsu/repos/<id>/graph.db`, usage
learning in `~/.setsu/setsu.db`. No network calls, no telemetry, no accounts.
Task terms are hashed with a per-device salt before storage; raw prompts are
never persisted. `setsu privacy inspect` lists every stored category and
location; `setsu privacy purge --yes` deletes all of it.

## 🗺️ Roadmap

| Version | Focus | Status |
|---|---|---|
| v0.1 | TS/JS + Python graph, hybrid retrieval, MCP, doctor/optimizer, local learning | this release |
| v0.2 | Java/C#/Go/Rust, deep LSP enrichment, Kiro/Copilot deep adapters, framework route + test + database graphs, retrieval bandit | planned |
| v0.3 | Optional semantic retrieval, cross-agent config compiler, Graphify import, Serena bridge, memory provider SDK | planned |

## 🤝 Contributing

Contribution ladder — pick your entry point:

1. **Benchmark task** — add a task to `benchmarks/`; retrieval quality lives and dies by real questions
2. **Fixture + golden** — a code pattern we extract badly makes a great failing test
3. **Language extractor** — `packages/parsers/src/extractors/` has the pattern to follow
4. **Adapter depth** — deepen Copilot/Kiro config generation in `packages/agents`
5. **Core** — router, packer, graph algorithms

`npm install && npm test` is all it takes to start. Every PR needs tests.

## 📄 License

Apache-2.0 © 2026 Aritra Ghosh · [NOTICE](NOTICE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

<div align="center">
<sub>節 — setsu: the node where things join.</sub>
</div>
