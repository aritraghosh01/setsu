export { classifyTask, extractSeedTerms, type TaskClass, type SeedTerms } from './classifier.js';
export { searchSymbols, searchSource, type SymbolFtsHit, type SourceFtsHit } from './lexical.js';
export { packEvidence, type PackInput, type PackResult } from './packer.js';
export { buildRepoMap } from './repo-map.js';
export {
  buildContext,
  type ContextOptions,
  type ContextResult,
  type ContextExplain,
} from './context.js';
