# SETSU
## Open-Source Adaptive Context & Codebase Navigation Framework for AI Coding Agents

**Document type:** Product + Architecture + Engineering Specification  
**Primary implementer:** Codex / AI coding agent  
**Primary distribution:** npm  
**CLI binary:** `setsu`  
**Primary language:** TypeScript  
**Runtime:** Node.js 22+  
**License target:** Apache-2.0  
**Status:** Build specification  
**Version:** 0.2-draft  
**Research snapshot:** 2026-09-06

---

# 1. Product Definition

SETSU is a local-first, open-source framework that makes AI coding agents use less context while understanding large codebases more accurately.

It targets:

- Claude Code
- OpenAI Codex
- Cursor
- GitHub Copilot
- AWS Kiro
- future MCP-capable coding agents

SETSU has two related responsibilities:

1. **Context Efficiency**
   - reduce oversized persistent instructions;
   - detect duplicated or low-value instructions;
   - convert rarely used guidance into skills/on-demand context;
   - recommend when to continue, compact, or start a new session;
   - learn which recommendations are actually useful to the individual developer.

2. **Codebase Navigation**
   - build a persistent structural graph of the repository;
   - traverse definitions, references, imports, calls, inheritance, routes, schemas, tests, ownership, and rationale;
   - retrieve only the smallest evidence pack required for the current task;
   - avoid repeated grep/read/re-read loops;
   - maintain the graph incrementally as the code changes.

The central product thesis is:

> AI coding agents should not rediscover a repository from raw files on every task. They should navigate a persistent code graph, retrieve only the relevant subgraph, and spend the context window on reasoning and implementation.

---

# 2. Core Product Principles

1. **Local-first**
   - source code stays on the machine by default;
   - no account is required;
   - no API key is required for core functionality.

2. **Graph-first, not grep-only**
   - repository structure is indexed once;
   - task-time retrieval starts from structured relationships;
   - grep remains a fallback, not the default exploration strategy.

3. **Token-budgeted retrieval**
   - every context pack has an explicit budget;
   - SETSU chooses the highest-value evidence that fits that budget.

4. **Hybrid navigation**
   - no single retrieval method is best for every task;
   - exact symbol lookup, graph traversal, lexical search, LSP, semantic search, and repo maps are routed adaptively.

5. **Incremental**
   - unchanged files are never reparsed unnecessarily;
   - branch changes reuse content-addressed artifacts whenever safe.

6. **Explainable**
   - every recommendation and every retrieved code edge should show provenance.

7. **Adaptive**
   - SETSU learns user patterns locally;
   - suggestions get more relevant and less noisy over time.

8. **Consent-driven memory**
   - future persistent-memory integration is opt-in;
   - the user controls exactly which derived patterns may leave the device.

9. **Safe mutation**
   - dry-run first;
   - diff before write;
   - backup and rollback.

10. **Outcome efficiency, not token minimization at any cost**
    - fewer tokens are only useful when task success is preserved or improved.

---

# 3. Research: Top 5 Open-Source Reference Systems

## 3.1 Selection methodology

This list is intentionally not "largest generic AI coding tools by GitHub stars."

The ranking prioritizes projects that directly contribute to:

- repository understanding;
- code graph construction;
- semantic/symbol navigation;
- context retrieval;
- incremental indexing;
- token-efficient codebase exploration.

General agent runtimes such as OpenHands are adjacent, but are not used as primary architectural references because SETSU is a context/navigation layer intended to work underneath multiple agents.

GitHub popularity numbers below are approximate snapshots from the research date and must not be hard-coded into product claims.

---

## 3.2 #1 Graphify

**Reference:** https://github.com/Graphify-Labs/graphify  
**License:** Apache-2.0  
**Observed popularity:** ~112k GitHub stars at the research snapshot.

### Relevant concepts

Graphify converts a project into a persistent knowledge graph.

Its architecture includes:

```text
detect
  ↓
extract
  ↓
build_graph
  ↓
cluster
  ↓
analyze
  ↓
report
  ↓
export
```

Important ideas SETSU should adopt conceptually:

- deterministic AST extraction for source code;
- persistent graph rather than repeated raw reads;
- typed graph edges;
- graph traversal for architecture questions;
- confidence/provenance labels;
- content-hash cache;
- incremental rebuild;
- community detection;
- "god nodes" / central nodes;
- query/path/explain operations;
- graph-first agent guidance;
- local operation;
- structured graph artifacts that survive sessions.

Graphify distinguishes relationships such as:

```text
EXTRACTED
INFERRED
AMBIGUOUS
```

SETSU should use a stricter internal provenance model:

```text
AST_EXACT
LSP_EXACT
CONFIG_EXACT
LEXICAL_DERIVED
GRAPH_INFERRED
SEMANTIC_INFERRED
USER_CONFIRMED
```

### What SETSU should not copy blindly

- SETSU should not require Python.
- SETSU should not require an LLM to understand source code.
- SETSU should not treat one global graph report as sufficient context for every task.
- SETSU should not force the agent to inspect a large graph artifact.
- SETSU should generate task-specific subgraphs bounded by a token budget.

---

## 3.3 #2 Aider Repo Map

**Reference:** https://github.com/Aider-AI/aider  
**License:** Apache-2.0  
**Observed popularity:** ~48k GitHub stars.

Aider's RepoMap is one of the strongest ideas for large-codebase context compression.

Core concept:

```text
source
  ↓
tree-sitter tags
  ↓
definitions + references
  ↓
dependency graph
  ↓
PageRank
  ↓
token-budgeted repository map
```

Aider ranks code symbols by graph importance and emits only the most relevant map entries that fit a configured token budget.

### SETSU adoption

SETSU should implement a generalized **Budgeted Graph Ranker** inspired by this concept.

It should support:

```text
global PageRank
personalized PageRank
task-biased PageRank
changed-file-biased PageRank
test-failure-biased PageRank
user-history-biased PageRank
```

Unlike a static repo map, SETSU should dynamically build:

```text
task → seed nodes → graph propagation → ranked evidence → budget packing
```

---

## 3.4 #3 Continue

**Reference:** https://github.com/continuedev/continue  
**License:** Apache-2.0  
**Observed popularity:** ~34k GitHub stars.

Continue's historical/current indexing architecture provides a useful incremental indexing pattern.

Relevant concepts:

- content-addressed indexing;
- avoid reprocessing unchanged files;
- branch-aware index tags;
- multiple index artifacts;
- tree-sitter top-level symbol extraction;
- SQLite FTS5;
- code chunks;
- embeddings/vector indexes;
- index update lifecycle.

Conceptually:

```text
file state
  ↓
content hash
  ↓
compute / delete / add-tag / remove-tag
  ↓
update indexes
```

SETSU should adopt this as the basis for its incremental artifact store.

Artifacts should include:

```text
AST artifact
symbol artifact
reference artifact
call graph artifact
full-text artifact
route artifact
schema artifact
test artifact
optional embedding artifact
```

---

## 3.5 #4 Serena

**Reference:** https://github.com/oraios/serena  
**License:** MIT  
**Observed popularity:** ~28k GitHub stars.

Serena's strongest contribution is symbol-level retrieval/editing using Language Server Protocol capabilities.

Useful operations include:

```text
find symbol
find definition
find references
find implementations
symbol overview
diagnostics
semantic refactor
```

This can avoid reading full files when the target symbol is known.

Important caveat:

LSP is not universally more token efficient than lexical search.

SETSU must use LSP selectively based on task type.

### SETSU adoption

Use LSP when:

```text
known symbol
cross-file rename
interface → implementation
reference completeness
type-aware navigation
diagnostics
```

Prefer lexical/graph methods when:

```text
exact string search
comments / config / SQL / docs
unknown symbol names
broad repository exploration
```

---

## 3.6 #5 Tree-sitter

**Reference:** https://github.com/tree-sitter/tree-sitter  
**License:** MIT  
**Observed popularity:** ~26k GitHub stars.

Tree-sitter is not a coding agent, but it is a foundational code-intelligence primitive.

It provides:

- fast parsing;
- concrete syntax trees;
- incremental parsing;
- resilience to syntax errors;
- broad language support;
- editor-grade performance.

SETSU should use Tree-sitter as the default deterministic source parser.

It should not depend on an LLM for:

```text
function detection
class detection
imports
exports
inheritance
basic call extraction
route declaration extraction
schema declaration extraction
test declaration extraction
```

---

# 4. Unified Architecture: SETSU Code Intelligence Graph

The five systems should not run as five independent tools.

SETSU should combine their strongest ideas behind one unified engine.

Name the subsystem:

# SCOUT
## SETSU Code Observation & Understanding Traversal

SCOUT is the repository intelligence layer inside SETSU.

Architecture:

```text
                         ┌───────────────────────────┐
                         │      AI CODING AGENT      │
                         │ Claude/Codex/Cursor/etc.  │
                         └─────────────┬─────────────┘
                                       │
                                       ▼
                         ┌───────────────────────────┐
                         │       SETSU ROUTER         │
                         │ intent + task classifier   │
                         └─────────────┬─────────────┘
                                       │
                  ┌────────────────────┼────────────────────┐
                  │                    │                    │
                  ▼                    ▼                    ▼
        ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
        │ Graph Traversal │   │ Symbol / LSP    │   │ Lexical / FTS   │
        │ Graphify idea   │   │ Serena idea     │   │ Continue idea   │
        └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
                 │                     │                     │
                 └──────────────┬──────┴─────────────┬───────┘
                                ▼                    ▼
                     ┌───────────────────┐   ┌──────────────────┐
                     │ Relevance Ranker  │   │ Optional Semantic │
                     │ Aider/PageRank    │   │ Retrieval         │
                     └─────────┬─────────┘   └─────────┬────────┘
                               └──────────┬─────────────┘
                                          ▼
                              ┌─────────────────────────┐
                              │ TOKEN BUDGET PACKER     │
                              │ minimal evidence pack   │
                              └────────────┬────────────┘
                                           ▼
                              ┌─────────────────────────┐
                              │ Context Pack / MCP Tool │
                              └─────────────────────────┘
```

Below the retrieval layer:

```text
FILES
  ↓
CONTENT HASH
  ↓
TREE-SITTER PARSE
  ↓
SYMBOL EXTRACTION
  ↓
REFERENCE / IMPORT / CALL RESOLUTION
  ↓
LSP ENRICHMENT
  ↓
GRAPH BUILD
  ↓
COMMUNITIES + CENTRALITY
  ↓
SQLITE ARTIFACT STORE
  ↓
INCREMENTAL WATCHER
```

---

# 5. Why This Combination Is Better Than Any One Approach

## Graphify alone

Strong at:

- persistent architecture graph;
- path traversal;
- cross-file relationships.

Weakness SETSU addresses:

- a graph can itself become large;
- not every question should traverse the graph;
- task-specific budgeted selection is required.

## Aider RepoMap alone

Strong at:

- centrality ranking;
- compact global map;
- explicit token budget.

Weakness SETSU addresses:

- PageRank is not enough for exact semantic navigation;
- deeper multi-hop relationships need a richer graph;
- symbol operations benefit from LSP.

## Continue-style index alone

Strong at:

- incremental caching;
- full-text and hybrid indexes;
- content-addressed updates.

Weakness SETSU addresses:

- retrieval results do not automatically model architecture paths;
- broad vector retrieval can still overfetch.

## Serena alone

Strong at:

- precise symbol operations;
- references;
- IDE-like navigation.

Weakness SETSU addresses:

- LSP availability varies by language;
- LSP does not cover all comments, configs, docs, SQL or runtime relationships;
- broad repository orientation is a graph/ranking problem.

## Tree-sitter alone

Strong at:

- deterministic local parsing;
- incremental syntax trees.

Weakness SETSU addresses:

- syntax alone is not architecture;
- references, communities, relevance and task context require additional layers.

---

# 6. SCOUT Retrieval Philosophy

SETSU should never ask:

```text
"What search tool should I always use?"
```

It should ask:

```text
"What is the cheapest reliable retrieval strategy for this task?"
```

The router chooses among:

```text
GRAPH
LSP
LEXICAL
SEMANTIC
REPO_MAP
DIRECT_FILE
HYBRID
```

---

# 7. Query Routing Rules

## 7.1 Known symbol

Example:

```text
Where is UserService.authenticate called?
```

Route:

```text
symbol lookup
→ LSP references if available
→ graph callers
→ lexical verification if necessary
```

## 7.2 Architecture flow

Example:

```text
How does checkout reach the payment provider?
```

Route:

```text
concept/entity seeds
→ graph traversal
→ shortest / weighted paths
→ ranked neighboring symbols
→ small source snippets
```

## 7.3 Unknown concept

Example:

```text
Where is idempotency handled?
```

Route:

```text
FTS/BM25
+ optional semantic retrieval
→ seed symbols
→ graph expansion
→ rank
```

## 7.4 Refactor

Example:

```text
Rename PaymentAdapter across the repository.
```

Route:

```text
LSP definition
→ references
→ implementation hierarchy
→ graph blast radius
→ exact string scan for comments/config/docs
```

## 7.5 Repository orientation

Example:

```text
Explain this repository.
```

Route:

```text
community graph
→ global PageRank
→ architecture nodes
→ entry points
→ bounded repo map
```

## 7.6 Failing test

Route:

```text
test node
→ tested symbol
→ caller/callee neighborhood
→ recently changed files
→ diagnostics
→ ranked source snippets
```

---

# 8. Context Retrieval Contract

Every retrieval call returns a bounded `ContextPack`.

```ts
export interface ContextPack {
  id: string;
  query: string;
  repoId: string;

  budget: {
    maxEstimatedTokens: number;
    usedEstimatedTokens: number;
  };

  strategy:
    | "graph"
    | "lsp"
    | "lexical"
    | "semantic"
    | "repo_map"
    | "hybrid";

  evidence: ContextEvidence[];

  graph?: {
    seedNodeIds: string[];
    paths: GraphPath[];
    omittedNeighborCount: number;
  };

  quality: {
    confidence: number;
    completeness: "low" | "medium" | "high";
  };

  provenance: RetrievalProvenance[];
}
```

Evidence:

```ts
export interface ContextEvidence {
  id: string;
  kind:
    | "symbol_signature"
    | "source_snippet"
    | "graph_path"
    | "file_summary"
    | "diagnostic"
    | "instruction"
    | "test"
    | "schema"
    | "route";

  file?: string;
  startLine?: number;
  endLine?: number;

  text: string;
  estimatedTokens: number;

  relevance: number;
  confidence: number;

  provenance:
    | "ast"
    | "lsp"
    | "config"
    | "lexical"
    | "semantic"
    | "inferred";
}
```

---

# 9. Token Budget Packer

The packer must maximize evidence value under a hard budget.

For evidence item `i`:

```text
value(i) =
    relevance(i)
  * confidence(i)
  * novelty(i)
  * taskUtility(i)
  * userPreference(i)
```

Cost:

```text
cost(i) = estimatedTokens(i)
```

Objective:

```text
maximize Σ value(i)
subject to Σ cost(i) <= tokenBudget
```

v1 can use greedy ratio:

```text
value / cost
```

with mandatory inclusion rules for:

```text
target symbol
direct definition
critical path edges
error line
user-selected files
```

Later versions may use constrained knapsack optimization.

---

# 10. Budget Defaults

Suggested defaults:

```text
orientation map           1200 tokens
symbol lookup              600 tokens
architecture query        1500 tokens
bug localization          1800 tokens
refactor blast radius     2200 tokens
large design task         3000 tokens
```

Allow:

```bash
setsu context "<question>" --budget 1500
```

The agent adapter may choose a budget based on the active model context window.

---

# 11. Graph Data Model

## 11.1 Node types

```ts
export type CodeNodeType =
  | "repository"
  | "package"
  | "module"
  | "file"
  | "namespace"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "function"
  | "method"
  | "property"
  | "variable"
  | "route"
  | "endpoint"
  | "database_table"
  | "database_view"
  | "database_column"
  | "migration"
  | "test"
  | "config"
  | "event"
  | "queue"
  | "topic"
  | "external_service"
  | "instruction"
  | "skill"
  | "rationale"
  | "documentation";
```

## 11.2 Edge types

```ts
export type CodeEdgeType =
  | "contains"
  | "defines"
  | "imports"
  | "exports"
  | "calls"
  | "references"
  | "implements"
  | "extends"
  | "overrides"
  | "reads"
  | "writes"
  | "routes_to"
  | "handles"
  | "publishes"
  | "subscribes"
  | "queries"
  | "mutates"
  | "tests"
  | "configured_by"
  | "depends_on"
  | "documented_by"
  | "rationale_for"
  | "generated_from"
  | "similar_to";
```

---

# 12. Graph Provenance

Every edge must have:

```ts
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: CodeEdgeType;

  provenance:
    | "AST_EXACT"
    | "LSP_EXACT"
    | "CONFIG_EXACT"
    | "LEXICAL_DERIVED"
    | "GRAPH_INFERRED"
    | "SEMANTIC_INFERRED"
    | "USER_CONFIRMED";

  confidence: number;

  sourceFile?: string;
  sourceLocation?: {
    startLine: number;
    endLine: number;
  };

  firstSeenAt: string;
  lastSeenAt: string;
}
```

Rules:

```text
AST_EXACT        confidence 1.0
LSP_EXACT        confidence 1.0
CONFIG_EXACT     confidence 1.0
LEXICAL_DERIVED  <= 0.95
GRAPH_INFERRED   <= 0.90
SEMANTIC_INFERRED <= 0.85
USER_CONFIRMED   1.0
```

Never render inferred relationships as facts without the label.

---

# 13. Stable Node IDs

Use:

```text
repo-relative-path
+ language
+ symbol-kind
+ qualified-symbol-name
```

Hash into a stable ID.

Example logical identity:

```text
src/auth/service.ts::typescript::class::AuthService
```

This should survive line movement.

When a rename is detected:

- preserve history if confidence is high;
- otherwise create a new node and a possible `renamed_from` relation in history.

---

# 14. Storage

Use SQLite for v1.

Recommended tables:

```text
repositories
files
file_versions
symbols
edges
communities
centrality
instructions
skills
events
recommendations
feedback
task_patterns
command_patterns
context_packs
```

Use SQLite FTS5 for lexical retrieval.

Optional vector storage must be a plugin, not a core dependency.

---

# 15. Incremental Indexing

Inspired by Continue's content-addressed indexing.

For each file:

```text
path
mtime
size
content_hash
parser_version
language
branch
```

Compute one of:

```text
UNCHANGED
NEW
MODIFIED
DELETED
RETAGGED
```

Only `NEW` and `MODIFIED` files should be reparsed.

For modified files:

```text
old nodes
  ↓
parse new AST
  ↓
symbol reconciliation
  ↓
edge reconciliation
  ↓
local centrality/community refresh
```

A full graph rebuild should be a fallback, not the normal path.

---

# 16. File Watcher

Use native/watch abstraction.

```ts
export interface RepoWatcher {
  start(root: string): Promise<void>;
  stop(): Promise<void>;
  onChange(handler: (change: RepoChange) => void): void;
}
```

Debounce changes.

Default:

```text
250 ms
```

Batch related edits.

Do not rebuild after every keystroke.

---

# 17. Tree-sitter Layer

Create:

```text
packages/parsers/
```

with language modules:

```text
typescript
javascript
python
java
csharp
go
rust
cpp
c
kotlin
swift
ruby
php
sql
```

Initial launch may support fewer languages deeply, but architecture must be extensible.

Parser output:

```ts
interface ParseArtifact {
  fileHash: string;
  language: string;
  symbols: ParsedSymbol[];
  relations: ParsedRelation[];
}
```

---

# 18. LSP Layer

LSP is optional per language.

Define:

```ts
interface SemanticProvider {
  supported(language: string): boolean;

  definition(symbol: SymbolRef): Promise<Location[]>;
  references(symbol: SymbolRef): Promise<Location[]>;
  implementations(symbol: SymbolRef): Promise<Location[]>;
  diagnostics(file: string): Promise<Diagnostic[]>;
}
```

SETSU should detect existing language servers where possible.

Do not force installation in v1.

If unavailable:

```text
capability = degraded
```

and fall back to AST + lexical graph.

---

# 19. Lexical Search Layer

Use SQLite FTS5 or equivalent local full-text index.

Support:

```text
symbol names
source text
comments
config
SQL
documentation
tests
```

This is essential because graph/LSP will miss:

```text
strings
comments
dynamic configuration
runtime keys
documentation references
```

---

# 20. Optional Semantic Retrieval

Not required for core launch.

Provider interface:

```ts
interface EmbeddingProvider {
  id: string;
  local: boolean;
  embed(texts: string[]): Promise<number[][]>;
}
```

Priority:

```text
local provider first
```

Examples:

```text
Ollama
Transformers.js
user-configured remote provider
```

Remote embeddings require consent.

Do not send entire files.

Chunk source by symbols.

---

# 21. Graph Construction Pipeline

```text
1. discover files
2. respect .gitignore + .setsuignore
3. calculate hashes
4. parse changed files
5. extract symbols
6. extract structural edges
7. resolve cross-file imports
8. enrich with LSP where available
9. extract config/routes/schema relationships
10. persist nodes/edges
11. compute/update communities
12. compute centrality
13. update FTS
14. optionally update semantic index
15. mark graph revision
```

---

# 22. Community Detection

Graphify uses Leiden-style graph clustering.

SETSU should support community detection through an abstraction:

```ts
interface CommunityDetector {
  detect(graph: GraphView): Promise<Community[]>;
}
```

For v1:

- use a deterministic local graph community algorithm available in the JS ecosystem;
- if Leiden is not practical without heavy native dependencies, use Louvain or another modularity-based method initially;
- expose the algorithm name in metadata.

Do not make the entire npm install depend on Python.

---

# 23. Centrality

Calculate:

```text
degree
weighted degree
PageRank
personalized PageRank
betweenness approximation
```

Do not calculate expensive full betweenness for giant repos by default.

Cache metrics.

---

# 24. Task-Biased PageRank

Aider's global RepoMap concept should be extended.

Seed weights may include:

```text
files in current task
recently edited files
symbols from user query
failing test
current git diff
current directory
active branch
historical task patterns
```

Personalization vector:

```text
P(seed) ∝
  query relevance
+ recency
+ user usage
+ changed-file importance
```

Then run personalized PageRank.

---

# 25. Graph Traversal

Support:

```text
neighbors
callers
callees
dependencies
dependents
shortest path
weighted path
blast radius
subgraph around node
community
entry points
test coverage relationships
```

All operations need:

```text
max depth
max nodes
token budget
edge type filters
confidence threshold
```

---

# 26. Graph Query API

Core APIs:

```ts
findNode(query)
getNode(id)
neighbors(id, options)
path(source, target, options)
callers(id, options)
callees(id, options)
impact(id, options)
community(id)
search(query, options)
context(query, options)
```

---

# 27. Minimal MCP Surface

Important lesson from token-efficient tools:

Do not expose dozens of overlapping tools to the coding agent by default.

Default MCP tools:

```text
setsu_context
setsu_symbol
setsu_path
setsu_impact
setsu_status
```

The main workhorse should be:

```text
setsu_context
```

Input:

```ts
{
  query: string;
  maxTokens?: number;
  mode?: "auto" | "graph" | "symbol" | "search";
}
```

The router handles the rest internally.

Advanced tools may be opt-in.

This reduces MCP schema/token overhead and tool-selection errors.

---

# 28. `setsu_context` Behavior

Example:

```text
Question:
"How does checkout reach Stripe?"
```

Internal flow:

```text
classify as architecture_flow
→ lexical seeds: checkout, Stripe
→ graph candidates
→ route/path traversal
→ PageRank within induced subgraph
→ select critical symbols
→ attach concise signatures
→ attach minimal source snippets
→ pack <= budget
```

Return:

```text
Path:
CheckoutController
  → CheckoutService
  → PaymentGateway
  → StripeAdapter

Relevant source:
4 symbols
~1,130 estimated tokens

Confidence:
HIGH
```

---

# 29. Context Pack Compression Levels

Support:

```text
L0 metadata only
L1 symbol names + signatures
L2 signatures + key lines
L3 bounded bodies
L4 full file only when explicitly justified
```

Default is adaptive.

A broad architecture question should mostly use L1/L2.

A surgical edit may require L3 for one symbol.

Avoid L4 unless needed.

---

# 30. Never Read Entire Files by Default

Agent guidance:

```text
If SCOUT is initialized:
1. call `setsu_context` before broad Grep/Glob exploration;
2. use returned symbol IDs/paths;
3. read full files only if the context pack is insufficient;
4. report fallback reads to SETSU so the router can learn.
```

Do not block grep.

The system should learn when grep performs better.

---

# 31. Learning From Retrieval Outcomes

Track:

```text
strategy selected
context pack size
agent follow-up reads
agent follow-up grep calls
task success proxy
user feedback
time to first edit
number of retrieval retries
```

If a context pack causes many immediate fallback reads:

```text
under-retrieval
```

If the pack is large but most evidence is unused:

```text
over-retrieval
```

SETSU learns the optimal budget per task type.

---

# 32. Usage Learning

The local learning system should learn:

```text
which agent the user uses for which tasks
which directories co-occur
which symbols are frequently traversed
which skills are invoked
which MCP tools are actually used
which instructions are useful
which session reset recommendations are accepted
which retrieval strategy succeeds for each task class
optimal context budget by task class
```

---

# 33. Task Classes

Initial classes:

```text
repository_orientation
frontend
backend
api
database
migration
testing
debugging
refactor
documentation
infrastructure
deployment
security
dependency
architecture
performance
unknown
```

---

# 34. Task Fingerprint

Do not persist raw prompts by default.

```ts
interface TaskFingerprint {
  taskClass: string;

  hashedTerms: string[];

  paths: string[];
  extensions: string[];

  symbols: string[];
  graphCommunities: string[];

  toolCategories: string[];

  changedFileCount: number;

  startedAt: string;
}
```

Hash lexical terms using a machine-local salt.

---

# 35. Retrieval Strategy Learning

For each task class maintain a posterior over strategies.

Example:

```ts
type RetrievalStrategy =
  | "graph"
  | "lsp"
  | "lexical"
  | "semantic"
  | "repo_map"
  | "hybrid";
```

Track:

```text
success
fallback rate
tokens
latency
user feedback
```

Use a lightweight contextual bandit later.

v1 can use weighted historical scores.

---

# 36. Recommendation Learning

Recommendation types:

```text
extract_skill
scope_instruction
deduplicate_instruction
compact_session
new_session
reduce_tool_output
reduce_mcp_surface
increase_context_budget
decrease_context_budget
prefer_graph
prefer_lsp
prefer_lexical
```

Use Beta-Bernoulli acceptance adaptation.

```text
alpha = 1
beta = 1
```

Accept:

```text
alpha += 1
```

Reject:

```text
beta += 1
```

Expected acceptance:

```text
alpha / (alpha + beta)
```

---

# 37. Session Continuity

Compute:

```text
path similarity
symbol/community similarity
task-class similarity
time gap
branch continuity
tool similarity
```

Suggested baseline:

```text
continuity =
  .25 pathSimilarity
+ .20 symbolSimilarity
+ .20 communitySimilarity
+ .15 taskClassSimilarity
+ .10 toolSimilarity
+ .10 temporalContinuity
```

Recommend:

```text
continue
compact
new session
```

Do not auto-execute unless officially supported and explicitly enabled.

---

# 38. Instruction Optimization

SETSU also analyzes:

```text
CLAUDE.md
AGENTS.md
.cursor/rules
Copilot instructions
Kiro steering
skills
prompts
MCP configuration
```

For each instruction:

```text
estimated token cost
activation mode
observed relevance
task concentration
path concentration
duplication
conflict
```

Then recommend:

```text
always
path scoped
relevance scoped
skill
manual
remove
```

---

# 39. Context Tax

For persistent instruction `u`:

```text
contextTax(u) =
  estimatedTokens(u)
  * sessionsLoaded(u)
```

For scoped content:

```text
effectiveTax(u) =
  estimatedTokens(u)
  * activationProbability(u)
  * sessions
```

Potential reduction:

```text
avoidableContext =
  currentTax - projectedTax
```

---

# 40. Cross-Agent Context IR

```ts
interface ContextUnit {
  id: string;
  sourceFile: string;
  contentHash: string;

  semanticTags: string[];
  estimatedTokens: number;

  currentMode:
    | "always"
    | "path"
    | "relevance"
    | "manual"
    | "skill"
    | "unknown";

  recommendedMode?:
    | "always"
    | "path"
    | "relevance"
    | "manual"
    | "skill"
    | "remove";

  pathPatterns?: string[];

  observed: {
    sessionsLoaded: number;
    sessionsRelevant: number;
  };
}
```

---

# 41. Adapter Architecture

```ts
interface AgentAdapter {
  id: string;

  detect(): Promise<DetectionResult>;

  discoverInstructions(): Promise<InstructionFile[]>;
  discoverSkills(): Promise<SkillFile[]>;
  discoverMcp(): Promise<McpConfig[]>;

  compile(plan: OptimizationPlan): Promise<GeneratedArtifact[]>;

  runtimeObserver?(): RuntimeObserver | null;
}
```

Adapters:

```text
Claude
Codex
Cursor
Copilot
Kiro
```

---

# 42. Claude Adapter

Support documented surfaces such as:

```text
CLAUDE.md
nested instructions where supported
.claude/
skills
hooks
MCP config
session actions
```

SETSU should optionally install graph-first guidance.

Example managed block:

```md
<!-- SETSU:BEGIN scout -->
For repository-wide questions, use SETSU code intelligence before broad raw-file search.
Call `setsu_context` with the task/question.
Use direct file reads only when the returned evidence is insufficient.
<!-- SETSU:END scout -->
```

---

# 43. Codex Adapter

Support documented:

```text
AGENTS.md
nested AGENTS.md
skills
MCP
Codex config
```

Do not assume API-level features exist in Codex CLI.

Provider capability must be detected independently.

---

# 44. Cursor Adapter

Support:

```text
.cursor/rules/*.mdc
AGENTS.md
MCP
skills where documented
```

Optimize:

```text
alwaysApply
globs
description/relevance
```

---

# 45. GitHub Copilot Adapter

Support documented:

```text
.github/copilot-instructions.md
.github/instructions/*.instructions.md
AGENTS.md
.github/prompts/
.github/agents/
```

Model IDE/surface differences.

---

# 46. Kiro Adapter

Support documented:

```text
.kiro/steering/
.kiro/skills/
.kiro/hooks/
MCP
AGENTS.md
```

Optimize steering modes:

```text
always
fileMatch
manual
auto/relevance
```

---

# 47. CLI

Primary commands:

```text
setsu init
setsu doctor
setsu scan
setsu index
setsu graph
setsu context
setsu symbol
setsu path
setsu impact
setsu optimize
setsu watch
setsu report
setsu learn
setsu feedback
setsu privacy
setsu adapters
setsu benchmark
setsu export
setsu import
setsu mcp
```

---

# 48. `setsu init`

Flow:

```text
detect repo
detect agents
create .setsu/
build initial graph
create local DB
offer MCP installation
offer local learning
explain privacy
```

Example:

```text
$ npx @setsu-ai/cli init

SETSU

Detected:
✓ Claude Code
✓ Cursor
✓ Codex

Index:
1,842 files
7,914 symbols
13,602 relationships
18 communities

Source-code processing:
Local only

Enable local adaptive learning? Y
Install SETSU MCP for detected agents? Y
```

---

# 49. `setsu doctor`

One-command diagnostic.

Report:

```text
Context Efficiency Score
Graph readiness
Persistent instruction cost
Duplicate instruction cost
Index freshness
Retrieval efficiency
Observed fallback reads
MCP surface cost
Session hygiene
Learned recommendations
```

---

# 50. `setsu index`

```bash
setsu index
setsu index --full
setsu index --incremental
setsu index --watch
setsu index --stats
```

Default:

```text
incremental
```

---

# 51. `setsu graph`

```bash
setsu graph stats
setsu graph node AuthService
setsu graph community auth
setsu graph export
```

Do not require a browser UI in v1.

Optional future visualizer.

---

# 52. `setsu context`

```bash
setsu context "How does checkout reach the payment gateway?"
setsu context "Where is idempotency implemented?" --budget 1200
setsu context "What will break if I change User.id?" --json
```

This is a flagship command.

---

# 53. `setsu symbol`

```bash
setsu symbol UserService
setsu symbol UserService.authenticate
setsu symbol UserService.authenticate --references
setsu symbol UserService.authenticate --implementations
```

---

# 54. `setsu path`

```bash
setsu path CheckoutController StripeAdapter
```

Output:

```text
CheckoutController
  calls
CheckoutService
  calls
PaymentGateway
  implemented_by
StripeAdapter
```

Include evidence/provenance.

---

# 55. `setsu impact`

```bash
setsu impact User.id
setsu impact PaymentGateway --depth 3
```

Return:

```text
direct callers
dependents
tests
routes
schemas
migrations
config
```

---

# 56. `setsu optimize`

Default advisory.

```bash
setsu optimize --dry-run
setsu optimize --apply
```

Possible changes:

```text
instruction scoping
skill extraction
graph-first agent guidance
MCP registration
duplicate cleanup
```

Never rewrite source code as part of context optimization.

---

# 57. MCP Server

```bash
setsu mcp serve
```

Local stdio MCP server.

No network listener by default.

Agent config should call:

```text
setsu mcp serve --repo <root>
```

---

# 58. npm Distribution

Suggested package:

```text
@setsu-ai/cli
```

Binary:

```text
setsu
```

Install:

```bash
npm install -g @setsu-ai/cli
```

or:

```bash
npx @setsu-ai/cli doctor
```

Core package should remain pure npm from user perspective.

Native optional modules must ship prebuilt binaries or WASM where practical.

---

# 59. Monorepo

```text
setsu/
├── packages/
│   ├── cli/
│   ├── core/
│   ├── graph/
│   ├── parsers/
│   ├── retrieval/
│   ├── ranking/
│   ├── learning/
│   ├── storage/
│   ├── mcp/
│   ├── lsp/
│   ├── adapter-sdk/
│   ├── adapter-claude/
│   ├── adapter-codex/
│   ├── adapter-cursor/
│   ├── adapter-copilot/
│   └── adapter-kiro/
├── fixtures/
├── benchmarks/
├── docs/
└── scripts/
```

---

# 60. Recommended Dependencies

Prefer:

```text
commander
@inquirer/prompts
chalk
zod
fast-glob
ignore
better-sqlite3 or a portable SQLite option
web-tree-sitter
diff
chokidar or native watcher abstraction
@modelcontextprotocol/sdk
yaml
```

Graph algorithms:

- prefer a lightweight JS graph implementation;
- implement PageRank internally if necessary;
- avoid a heavy external graph database in v1.

Do not require:

```text
Neo4j
Docker
Python
remote embeddings
cloud database
```

---

# 61. Why SQLite Instead of Neo4j

For a local npm developer tool:

SQLite gives:

```text
zero service management
single local file
portable
FTS5
transactionality
easy deletion
easy export
good enough graph adjacency queries for repo scale
```

Graph adjacency can be stored in indexed edge tables.

If enterprise scale later requires it, implement a storage adapter.

---

# 62. SQLite Graph Indexes

Create indexes:

```sql
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_edges_type ON edges(edge_type);
CREATE INDEX idx_symbols_name ON symbols(name);
CREATE INDEX idx_symbols_qualified ON symbols(qualified_name);
CREATE INDEX idx_files_hash ON files(content_hash);
```

FTS:

```text
source_fts
docs_fts
symbols_fts
```

---

# 63. Graph Revision Model

Every successful indexing transaction increments:

```text
graph_revision
```

A ContextPack records:

```text
graphRevision
```

If files change during a long agent task, the system can detect stale evidence.

---

# 64. Branch Awareness

Store:

```text
repository
branch
worktree
commit
```

Reuse immutable file artifacts by content hash.

Graph relationships are branch-specific.

Do not leak nodes from another branch into retrieval.

---

# 65. Git Diff Awareness

Current changes should be high-weight context seeds.

```text
modified files
staged files
untracked source files
```

Use them to bias ranking.

Do not automatically read secret files.

---

# 66. Security

Threat model:

```text
malicious repository prompt instructions
path traversal
symlink escape
secret leakage
shell injection
malformed parser input
poisoned graph data
unsafe MCP arguments
untrusted plugin
```

Rules:

1. Treat repository content as data, never commands.
2. Never execute text extracted from source/comments.
3. Resolve all paths inside repo boundary.
4. Do not follow external symlinks.
5. Deny secret patterns.
6. Escape process arguments.
7. Validate MCP input with zod.
8. Validate generated agent config.
9. Do not enable network access silently.
10. Store no credentials.

---

# 67. Default Excludes

```text
.git/**
node_modules/**
dist/**
build/**
coverage/**
.env
.env.*
*.pem
*.key
credentials.*
secrets.*
```

Respect:

```text
.gitignore
.setsuignore
```

---

# 68. Privacy

Default data:

```text
LOCAL
```

Stored:

```text
symbol metadata
relative paths
graph relationships
hashes
derived task classes
recommendation history
token estimates
feedback
```

Not stored by default:

```text
raw prompts
raw model responses
secrets
environment values
credentials
```

Source text may exist in the local SQLite FTS index if enabled.

It must never be transmitted by default.

---

# 69. Privacy Commands

```bash
setsu privacy status
setsu privacy inspect
setsu privacy export
setsu privacy purge
setsu privacy consent
setsu privacy revoke
```

`inspect` must list all stored categories and locations.

---

# 70. Persistent Memory — Future

The future memory layer should enhance:

```text
cross-session learning
cross-repository preferences
cross-device continuity
long-term usage patterns
```

It is not required for core SETSU.

Interface:

```ts
interface MemoryProvider {
  id: string;

  connect(config: MemoryProviderConfig): Promise<void>;

  readPatterns(
    query: PatternQuery,
    consent: ConsentContext
  ): Promise<UsagePattern[]>;

  writePatterns(
    patterns: UsagePattern[],
    consent: ConsentContext
  ): Promise<void>;

  disconnect(): Promise<void>;
}
```

---

# 71. Memory Consent Scopes

```text
memory:read-derived-patterns
memory:write-derived-patterns
memory:read-recommendation-history
memory:write-recommendation-history
memory:read-cross-repo-profile
memory:write-cross-repo-profile
memory:raw-prompts
memory:raw-responses
memory:source-content
```

The last three are always off by default.

They require independent explicit consent.

---

# 72. Memory Integration Rules

Future memory should primarily store derived patterns such as:

```text
"frontend tasks usually require communities UI + API client"
"deployment rules are relevant in <10% of sessions"
"new-session suggestion is usually accepted after backend → UI transition"
"graph traversal works better than semantic search for architecture tasks"
```

It should not need raw source code.

---

# 73. Memory Fallback

If the memory provider is offline:

```text
SETSU continues locally.
```

Memory must never be a hard dependency.

---

# 74. Learning Data Model

```ts
interface UsagePattern {
  id: string;
  scope: "repo" | "global";
  patternType: string;

  taskClass?: string;
  agent?: string;

  evidenceCount: number;
  confidence: number;

  value: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
}
```

---

# 75. Learning Gets Quieter

Desired evolution:

```text
first week
more deterministic recommendations

after 10-20 sessions
learned task-specific recommendations

later
fewer but higher-confidence interventions
```

Track:

```text
suggestions/session
acceptance rate
ignored rate
repeated fallback rate
```

---

# 76. Runtime Observation

Priority:

```text
official hooks
structured agent output
SETSU wrapper
public session export
filesystem events
manual feedback
```

Do not scrape private IDE databases.

---

# 77. Wrapper Mode

Optional:

```bash
setsu run claude
setsu run codex
setsu run kiro
```

Collect only permitted metadata.

Raw stdout capture is off by default.

---

# 78. Tool Output Waste

Detect:

```text
repeated test logs
repeated stack traces
package-manager noise
build progress spam
large directory listings
repeated git diff content
```

Recommend targeted commands.

Do not rewrite arbitrary shell commands automatically.

---

# 79. Context Efficiency Score

0-100.

Potential weights:

```text
persistent context           20
instruction scoping          15
duplication                  10
code retrieval efficiency    20
graph freshness              10
session hygiene              10
tool-output efficiency        5
MCP surface efficiency        5
learning quality              5
```

Reweight when metrics are unavailable.

---

# 80. Retrieval Efficiency Score

Possible metric:

```text
retrievalEfficiency =
  usefulEvidenceTokens /
  totalContextTokensRetrieved
```

Approximate useful evidence by:

```text
subsequent edits
referenced symbols
follow-up requests
explicit feedback
```

Label derived metrics honestly.

---

# 81. Benchmarking

SETSU must benchmark against:

```text
grep-first baseline
raw-file read baseline
repo-map baseline
graph-only baseline
SETSU hybrid
```

Tasks:

```text
architecture trace
bug localization
cross-file rename
route-to-database trace
test failure
new feature
dependency impact
repository orientation
```

Metrics:

```text
task success
input tokens
tool calls
file reads
latency
turns
retrieval fallbacks
```

---

# 82. Critical Ablation Study

To prove the architecture, implement:

```text
A. grep only
B. graph only
C. LSP only
D. repo-map only
E. hybrid without learning
F. hybrid + learning
```

The claim should be:

```text
SETSU adaptively chooses the most efficient reliable retrieval route.
```

Not:

```text
Graph is always best.
```

---

# 83. Benchmark Honesty

Do not reuse another project's marketing benchmark as a SETSU result.

Graphify's public token reduction examples can justify the design direction, but SETSU must publish its own reproducible results.

Always record:

```text
repository
commit
task
model
agent
agent version
SETSU version
run count
median
p90
```

---

# 84. Test Strategy

Unit:

```text
parser
hash/index lifecycle
graph construction
edge reconciliation
PageRank
task-biased ranking
budget packer
query router
task classifier
learning
privacy
file safety
adapter parser
```

Golden:

```text
fixture repository → expected graph nodes/edges
fixture query → expected top evidence
adapter input → expected generated config
```

Integration:

```text
temp repo
index
change file
incremental update
query
MCP
```

---

# 85. Performance Targets

Normal repo:

```text
CLI startup              < 500 ms preferred
doctor static pass       < 3 s preferred
cached context query     < 300 ms preferred
incremental file update  < 500 ms preferred for normal files
```

Large repo:

```text
bounded memory
incremental operation
streaming progress
```

---

# 86. Initial Deep Language Support

Priority:

```text
TypeScript / JavaScript
Python
Java
C#
Go
Rust
SQL
```

Add:

```text
C/C++
Kotlin
Swift
Ruby
PHP
```

later.

---

# 87. Framework-Aware Extraction

After core graph works, add analyzers:

```text
React
Next.js
Express
NestJS
FastAPI
Django
Spring
ASP.NET
Go HTTP frameworks
Terraform
Kubernetes
```

Examples:

```text
route → handler
handler → service
service → repository
repository → table
component → API call
event → consumer
```

These edges are especially valuable for multi-hop traversal.

---

# 88. Database Graph

Parse:

```text
SQL DDL
ORM models
migrations
repository/query code
```

Nodes:

```text
table
column
index
view
migration
model
```

Edges:

```text
reads
writes
maps_to
migrates
foreign_key_to
```

---

# 89. Test Graph

Connect:

```text
test file
test function
target symbol
fixture
mock
```

This enables:

```text
What tests should run if I change X?
```

---

# 90. Rationale Graph

Like Graphify's rationale concept, extract carefully:

```text
ADR references
RFC references
WHY comments
IMPORTANT comments
deprecation notes
```

Do not promote arbitrary comments to architectural truth.

Use provenance.

---

# 91. Code Graph vs User Memory

Keep separate namespaces.

```text
CODE GRAPH
objective repository structure

USAGE MEMORY
developer behavior/preferences
```

Future persistence memory may connect them through references, but should not merge them into one undifferentiated graph.

---

# 92. SCOUT Query Explainability

Every response can include:

```text
Why these files?
Why these symbols?
Which strategy?
What was excluded?
Was the graph fresh?
Was LSP available?
Was any semantic provider used?
```

Example:

```text
Strategy: graph + LSP
Seeds: CheckoutController, StripeAdapter
Path depth: 3
Source snippets: 4
Estimated context: ~1,120 tokens
Fallback full-file reads: 0
```

---

# 93. `setsu context --explain`

Output:

```text
QUERY CLASS
architecture_flow

ROUTING
graph 0.92
lsp 0.68
lexical 0.54

SEEDS
checkout
stripe
CheckoutController
StripeAdapter

GRAPH
12 candidate nodes
4 selected

TOKEN BUDGET
1500
used ~1132
```

---

# 94. Plugin Architecture

Third-party modules:

```text
@setsu-ai/parser-*
@setsu-ai/adapter-*
@setsu-ai/retriever-*
@setsu-ai/memory-*
```

Plugins are explicitly configured.

Never auto-load arbitrary packages.

---

# 95. Optional Compatibility Bridges

SETSU should be able to interoperate with existing tools without requiring them.

Possible future bridges:

```text
Graphify graph.json importer
Serena MCP semantic provider
existing LSP servers
Continue-style index migration/import
Aider RepoMap comparison benchmark
```

Important:

The default SETSU installation must still work without any of them.

---

# 96. Legal / Open-Source Reuse Guidance

The five reference systems use permissive licenses, but Codex should not copy source indiscriminately.

Implementation policy:

1. Reimplement architectural concepts unless direct reuse is clearly valuable.
2. If code is copied or modified:
   - preserve required copyright/license notices;
   - document origin;
   - comply with Apache-2.0 NOTICE requirements where applicable.
3. Maintain:
   ```text
   THIRD_PARTY_NOTICES.md
   ```
4. Record dependency licenses in CI.

---

# 97. Safe File Mutation

Default:

```text
advisory
```

Then:

```bash
setsu optimize --dry-run
```

Only write with:

```bash
setsu optimize --apply
```

Process:

```text
parse
validate
generate patch
show diff
backup
atomic write
re-parse
rollback on failure
```

---

# 98. Configuration

```json
{
  "version": 1,
  "index": {
    "enabled": true,
    "watch": true,
    "semantic": false
  },
  "retrieval": {
    "defaultBudget": 1500,
    "strategy": "auto"
  },
  "learning": {
    "enabled": true,
    "storeRawPrompts": false,
    "retentionDays": 90
  },
  "privacy": {
    "network": false,
    "memoryProvider": "none"
  },
  "mcp": {
    "minimalToolSurface": true
  }
}
```

---

# 99. Project Files

```text
.setsu/
├── config.json
├── policy.json
├── context.yml
└── .gitignore
```

User-local:

```text
~/.setsu/
├── setsu.db
├── config.json
├── salt
├── logs/
└── backups/
```

Do not commit usage DB.

---

# 100. CI Mode

```bash
setsu scan --ci
```

No prompts.
No writes.

Possible thresholds:

```text
max persistent context
max duplicate ratio
minimum graph freshness
minimum context efficiency score
```

---

# 101. JSON Output

```bash
setsu context "..." --json
setsu doctor --json
setsu scan --json
```

All JSON outputs require:

```text
schemaVersion
evidenceQuality
graphRevision
```

---

# 102. Development Milestones

## Milestone 0 — Bootstrap

- npm workspace
- TypeScript strict mode
- ESM
- tsup
- vitest
- eslint/prettier
- CLI binary
- GitHub Actions

## Milestone 1 — Static context audit

- repository detection
- agent detection
- instruction discovery
- token estimation
- doctor
- Context IR

## Milestone 2 — SCOUT deterministic index

- SQLite
- file discovery
- hashing
- Tree-sitter
- symbol extraction
- import/reference graph
- incremental indexing

## Milestone 3 — Graph intelligence

- centrality
- PageRank
- communities
- path
- neighbors
- impact
- graph stats

## Milestone 4 — Retrieval router

- lexical FTS
- repo map
- graph traversal
- budget packer
- `setsu context`

## Milestone 5 — LSP enrichment

- provider abstraction
- definition
- references
- implementations
- diagnostics
- router integration

## Milestone 6 — MCP

- minimal tool surface
- `setsu_context`
- `setsu_symbol`
- `setsu_path`
- `setsu_impact`
- adapter config generation

## Milestone 7 — Context optimization

- duplication
- scoping
- skills
- safe diff/apply
- backups

## Milestone 8 — Learning

- events
- task fingerprints
- session continuity
- retrieval outcome learning
- recommendation feedback

## Milestone 9 — Reports

- context efficiency
- retrieval efficiency
- weekly/monthly
- learning profile
- privacy inspection

## Milestone 10 — npm beta

```text
0.1.0-beta.1
```

---

# 103. v0.1 Definition of Done

A developer can run:

```bash
npx @setsu-ai/cli init
```

then:

```bash
setsu context "Explain the request flow for authentication"
```

and receive a bounded, provenance-aware context pack without sending the repository anywhere.

They can also run:

```bash
setsu doctor
setsu optimize --dry-run
setsu learn
setsu privacy inspect
```

Minimum functionality:

```text
TypeScript/JavaScript + Python graph indexing
SQLite FTS
PageRank
path traversal
budget packing
Claude/Codex/Cursor config detection
MCP server
local learning
privacy controls
```

All five target agent adapters can be detection-level at v0.1, with deeper config generation for at least Claude, Codex and Cursor.

---

# 104. v0.2

Add:

```text
Java/C#/Go/Rust
better LSP
Kiro/Copilot deep adapters
framework route extraction
test graph
database graph
retrieval bandit
```

---

# 105. v0.3

Add:

```text
optional semantic retrieval
cross-agent canonical config compiler
Graphify import
Serena bridge
persistent-memory provider SDK
cross-repo learning with consent
```

---

# 106. Research-Driven Hybrid Routing Principle

The implementation must explicitly avoid the simplistic claim:

```text
semantic/LSP retrieval always saves tokens
```

or:

```text
graph traversal always saves tokens
```

Different tasks favor different mechanisms.

SETSU's core differentiation should be:

> It learns which navigation strategy is cheapest and most reliable for the current developer, repository and task.

That is stronger than merely adding a code graph.

---

# 107. Example Hybrid Query

Question:

```text
Why does changing the CustomerStatus enum break checkout?
```

Flow:

```text
1. lexical/symbol seed: CustomerStatus
2. LSP: definitions + references
3. graph: dependent symbols
4. graph path: enum → order validation → checkout
5. test graph: affected tests
6. git diff bias if enum recently changed
7. PageRank over induced graph
8. pack ~1800 tokens
```

The model receives:

```text
enum definition
2 relevant validators
checkout call path
affected tests
one config reference
```

not 14 full files.

---

# 108. Example Adaptive Learning

First month:

```text
backend debugging:
graph + lexical succeeds most often

frontend component changes:
LSP + direct symbol reads succeed most often

architecture questions:
graph + PageRank succeeds most often

unknown business concepts:
FTS + optional semantic → graph succeeds most often
```

SETSU then biases routing accordingly.

---

# 109. Future Persistent Memory Example

With consent, memory may store:

```json
{
  "type": "retrieval_pattern",
  "taskClass": "architecture",
  "repositoryType": "typescript-monorepo",
  "bestStrategy": "graph",
  "averageBudgetBucket": "1200-1800",
  "evidenceCount": 41,
  "confidence": 0.89
}
```

It should not store:

```text
raw source
raw prompt
customer names
secrets
```

unless separately and explicitly authorized.

---

# 110. README Positioning

Suggested headline:

```text
SETSU
Give coding agents the code they need — not the whole repository.
```

Subhead:

```text
A local-first context efficiency and code intelligence layer for
Claude Code, Codex, Cursor, Copilot and Kiro.
```

Key bullets:

```text
Persistent code graph
Token-budgeted retrieval
Symbol/LSP navigation
Incremental local indexing
Instruction optimization
Learns your usage patterns
No API key required
```

---

# 111. Initial npm Experience

```bash
npx @setsu-ai/cli init
```

Then:

```bash
setsu context "How does auth work?"
```

Then:

```bash
setsu doctor
```

Then:

```bash
setsu optimize --dry-run
```

This should be the complete first-run story.

---

# 112. Benchmark Story for Launch

Create three public benchmark repos:

```text
small        < 300 source files
medium       1k-3k source files
large        8k+ source files
```

For each:

```text
10 tasks
5 runs/task/variant
same model
same agent
same commit
```

Compare:

```text
native agent
native + SETSU
```

Publish:

```text
median tool calls
median file reads
median input tokens
median time
success rate
```

Avoid cherry-picked one-off claims.

---

# 113. Architectural Decision: Concepts vs Dependencies

Do not literally bundle all five research projects into the npm package.

That would create:

```text
Python dependencies
duplicated indexes
multiple background servers
higher installation complexity
conflicting retrieval strategies
```

Instead:

```text
Graphify → persistent typed graph + provenance + communities
Aider → PageRank + strict token budget
Continue → content-addressed incremental indexes
Serena → LSP symbol semantics
Tree-sitter → deterministic local parser
```

These concepts are unified inside SCOUT.

Optional compatibility bridges can use existing installations.

---

# 114. Key Differentiator

Many tools do one of:

```text
graph
semantic search
LSP
repo map
memory
```

SETSU should do:

```text
task classification
  ↓
adaptive retrieval routing
  ↓
hybrid graph/symbol/search
  ↓
PageRank
  ↓
token-budget packing
  ↓
feedback
  ↓
personalized routing
```

This feedback loop is the defensible product architecture.

---

# 115. Final Codex Implementation Directive

Build this as a real developer tool, not a prototype.

Priority order:

```text
1. correctness
2. privacy
3. deterministic local indexing
4. graph accuracy
5. safe retrieval
6. token-budget control
7. explainability
8. incremental performance
9. adaptive learning
10. visual polish
```

Do not add an LLM dependency to core indexing.

Do not upload code.

Do not claim exact token savings without measurement.

Do not expose 30 MCP tools when 5 can cover the use cases.

Do not rely on grep as the default repository exploration method once SCOUT is ready.

Do not rely on graph traversal for tasks where lexical or LSP retrieval is cheaper.

The agent should experience SETSU as one coherent intelligence layer, not five separate frameworks.

---

# 116. Source References

Research references used to shape this architecture:

1. Graphify
   - https://github.com/Graphify-Labs/graphify
   - https://graphify.com/docs

2. Aider
   - https://github.com/Aider-AI/aider
   - https://aider.chat/docs/repomap.html
   - https://aider.chat/2023/10/22/repomap.html

3. Continue
   - https://github.com/continuedev/continue
   - repository indexing implementation under `core/indexing`

4. Serena
   - https://github.com/oraios/serena
   - https://oraios.github.io/serena/

5. Tree-sitter
   - https://github.com/tree-sitter/tree-sitter
   - https://tree-sitter.github.io/tree-sitter/

Additional adjacent systems worth benchmarking later:

- OpenHands
- Sourcegraph Zoekt
- open-codebase-index / opencode-codebase-index
- CodeGraph / codegraph-mcp

---

# 117. Immediate Build Order for Codex

Start with this sequence and do not jump ahead:

```text
PHASE 1
repo bootstrap
CLI
SQLite schema
file discovery
hashing

PHASE 2
Tree-sitter TypeScript/JavaScript
Tree-sitter Python
symbol model
edge model
incremental index

PHASE 3
FTS5
graph adjacency
PageRank
path
impact
community

PHASE 4
query classifier
retrieval router
token estimator
budget packer
setsu context

PHASE 5
MCP server
Claude adapter
Codex adapter
Cursor adapter

PHASE 6
instruction optimizer
dry-run
safe apply
backup

PHASE 7
usage event store
task fingerprints
feedback learning
adaptive routing

PHASE 8
benchmarks
npm pack
beta publish
```

Every phase must finish with:

```text
tests
fixtures
documentation
working CLI
```

Do not leave the repository in an unrunnable state between phases.
