# Third-party notices

SETSU is Apache-2.0. It depends on and ships the following third-party
components. Full license texts are available in each package's repository.

## Vendored in the published package

### tree-sitter grammar WASM binaries (`packages/parsers/wasm/`)

Prebuilt WebAssembly grammars downloaded from official grammar releases,
pinned by SHA-256 in `scripts/fetch-grammars.mjs`:

| File | Project | Version | License |
|---|---|---|---|
| tree-sitter-typescript.wasm, tree-sitter-tsx.wasm | [tree-sitter/tree-sitter-typescript](https://github.com/tree-sitter/tree-sitter-typescript) | v0.23.2 | MIT |
| tree-sitter-javascript.wasm | [tree-sitter/tree-sitter-javascript](https://github.com/tree-sitter/tree-sitter-javascript) | v0.25.0 | MIT |
| tree-sitter-python.wasm | [tree-sitter/tree-sitter-python](https://github.com/tree-sitter/tree-sitter-python) | v0.25.0 | MIT |

Copyright (c) the tree-sitter authors and contributors.

## Runtime dependencies (installed from npm)

| Package | License | Role |
|---|---|---|
| [web-tree-sitter](https://github.com/tree-sitter/tree-sitter) | MIT | WASM parser runtime |
| [graphology](https://github.com/graphology/graphology) + graphology-communities-louvain | MIT | graph structure + Louvain communities |
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | MIT | MCP server |
| [commander](https://github.com/tj/commander.js) | MIT | CLI |
| [@inquirer/prompts](https://github.com/SBoudrias/Inquirer.js) | MIT | interactive prompts |
| [zod](https://github.com/colinhacks/zod) | MIT | schema validation |
| [fast-glob](https://github.com/mrmlnc/fast-glob) | MIT | file discovery |
| [ignore](https://github.com/kaelzhang/node-ignore) | MIT | .gitignore semantics |
| [chokidar](https://github.com/paulmillr/chokidar) | MIT | file watching |
| [diff](https://github.com/kpdecker/jsdiff) | BSD-3-Clause | unified diffs |
| [yaml](https://github.com/eemeli/yaml) | ISC | frontmatter parsing |
| [chalk](https://github.com/chalk/chalk) | MIT | terminal colors |

## Design acknowledgements

SETSU reimplements architectural concepts (not code) from Graphify
(persistent typed graph + provenance), Aider (PageRank repo map + token
budget), Continue (content-addressed incremental indexes), Serena (LSP
symbol semantics) and Tree-sitter (deterministic parsing).
