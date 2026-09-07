import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openUsageDb } from '@setsu-ai/storage';
import {
  makeFingerprint,
  hashTerm,
  resetSaltCache,
  recordEvent,
  pruneEvents,
  recordRetrievalOutcome,
  strategyScores,
  recommendStrategy,
  ensureRecommendation,
  recordAcceptance,
  recommendationStates,
  shouldSurface,
  continuity,
} from '@setsu-ai/learning';

let home: string;

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'setsu-learn-'));
  process.env['SETSU_HOME'] = home;
  resetSaltCache();
});

afterAll(async () => {
  delete process.env['SETSU_HOME'];
  resetSaltCache();
  await rm(home, { recursive: true, force: true });
});

describe('task fingerprints (spec s34)', () => {
  it('hashes terms with the machine salt; raw terms never appear', async () => {
    const fp = makeFingerprint({
      taskClass: 'debugging',
      terms: ['SecretCustomerName', 'checkout'],
      paths: ['src/checkout/service.ts'],
      symbols: ['CheckoutService'],
    });
    const serialized = JSON.stringify(fp);
    expect(serialized).not.toContain('SecretCustomerName');
    expect(fp.hashedTerms).toHaveLength(2);
    expect(fp.hashedTerms[0]).toMatch(/^[0-9a-f]{12}$/);
    expect(fp.extensions).toEqual(['.ts']);
    // Salt file exists with content
    const salt = await readFile(join(home, 'salt'), 'utf8');
    expect(salt.length).toBeGreaterThan(30);
  });

  it('is deterministic per machine', () => {
    expect(hashTerm('checkout')).toBe(hashTerm('Checkout'));
  });
});

describe('strategy learning (spec s35 v1 weighted scores)', () => {
  it('learns from outcomes and recommends after enough samples', () => {
    const db = openUsageDb(':memory:');
    try {
      for (let i = 0; i < 6; i += 1) {
        recordRetrievalOutcome(db, 'r1', {
          taskClass: 'architecture',
          strategy: 'graph',
          usedTokens: 1000,
          budget: 1500,
          success: true,
        });
      }
      for (let i = 0; i < 6; i += 1) {
        recordRetrievalOutcome(db, 'r1', {
          taskClass: 'architecture',
          strategy: 'lexical',
          usedTokens: 1400,
          budget: 1500,
          success: false,
        });
      }
      const scores = strategyScores(db, 'architecture');
      expect(scores[0]!.strategy).toBe('graph');
      expect(scores[0]!.score).toBeGreaterThan(scores[1]!.score);
      expect(recommendStrategy(db, 'architecture')).toBe('graph');
      expect(recommendStrategy(db, 'debugging')).toBeUndefined();
    } finally {
      db.close();
    }
  });
});

describe('Beta-Bernoulli recommendations (spec s36)', () => {
  it('starts at alpha=beta=1 and adapts to feedback', () => {
    const db = openUsageDb(':memory:');
    try {
      const id = ensureRecommendation(db, 'compact_session');
      let state = recommendationStates(db).find((r) => r.id === id)!;
      expect(state.expectedAcceptance).toBeCloseTo(0.5);

      recordAcceptance(db, id, false);
      recordAcceptance(db, id, false);
      recordAcceptance(db, id, false);
      state = recommendationStates(db).find((r) => r.id === id)!;
      expect(state.expectedAcceptance).toBeCloseTo(1 / 5);
      expect(shouldSurface(state)).toBe(false); // learning gets quieter (s75)

      recordAcceptance(db, id, true);
      recordAcceptance(db, id, true);
      recordAcceptance(db, id, true);
      state = recommendationStates(db).find((r) => r.id === id)!;
      expect(state.expectedAcceptance).toBeCloseTo(4 / 8);
      expect(shouldSurface(state)).toBe(true);
    } finally {
      db.close();
    }
  });
});

describe('session continuity (spec s37 weights)', () => {
  it('identical fingerprints -> continue; disjoint -> new session', () => {
    const a = makeFingerprint({
      taskClass: 'backend',
      terms: ['auth'],
      paths: ['src/auth/service.ts'],
      symbols: ['AuthService'],
    });
    const same = continuity(a, { ...a });
    expect(same.recommendation).toBe('continue');
    expect(same.score).toBeGreaterThan(0.9);

    const b = makeFingerprint({
      taskClass: 'frontend',
      terms: ['button'],
      paths: ['web/components/Button.jsx'],
      symbols: ['Button'],
    });
    const different = continuity(a, b);
    expect(different.score).toBeLessThan(same.score);
    expect(['compact', 'new_session']).toContain(different.recommendation);
  });
});

describe('retention pruning (spec s98)', () => {
  it('removes only events older than the window', () => {
    const db = openUsageDb(':memory:');
    try {
      recordEvent(db, { type: 'fresh' });
      db.run(
        `INSERT INTO events (id, ts, type) VALUES ('old1', ?, 'stale')`,
        new Date(Date.now() - 120 * 86_400_000).toISOString(),
      );
      const pruned = pruneEvents(db, 90);
      expect(pruned).toBe(1);
      expect(db.all(`SELECT id FROM events`)).toHaveLength(1);
    } finally {
      db.close();
    }
  });
});
