export {
  getSalt,
  hashTerm,
  makeFingerprint,
  resetSaltCache,
  type TaskFingerprint,
  type FingerprintInput,
} from './fingerprint.js';
export {
  recordEvent,
  pruneEvents,
  recordRetrievalOutcome,
  type EventInput,
  type RetrievalOutcome,
} from './events.js';
export { strategyScores, recommendStrategy, type StrategyScore } from './strategy.js';
export {
  ensureRecommendation,
  recordAcceptance,
  recommendationStates,
  shouldSurface,
  type RecommendationState,
} from './recommendations.js';
export { continuity, type ContinuityResult } from './continuity.js';
export {
  inspectStorage,
  purge,
  consentStatus,
  setConsent,
  NOT_STORED,
  type StoredCategory,
  type PurgeOptions,
} from './privacy.js';
