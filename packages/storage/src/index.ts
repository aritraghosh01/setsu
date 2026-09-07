export { Db, type SqlValue, type Row } from './driver.js';
export { GRAPH_SCHEMA, USAGE_SCHEMA, SCHEMA_VERSION } from './schema.js';
export {
  openGraphDb,
  openUsageDb,
  graphDbPath,
  usageDbPath,
  repoIdFor,
  setsuHome,
  gitInfo,
  getGraphRevision,
  bumpGraphRevision,
  type GraphStore,
} from './database.js';
export {
  classifyFiles,
  applyFileChanges,
  type FileState,
  type FileChange,
  type FileChangePlan,
} from './files.js';
