import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGraphDb, type GraphStore } from '@setsu-ai/storage';
import { indexRepo, graphStats, symbolId, fileId } from '@setsu-ai/graph';

const here = dirname(fileURLToPath(import.meta.url));
const TS_SAMPLE = join(here, '..', '..', '..', '..', 'fixtures', 'ts-sample');

let repo: string;
let store: GraphStore;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'setsu-idx-'));
  await cp(TS_SAMPLE, repo, { recursive: true });
  store = openGraphDb(repo, ':memory:');
});

afterAll(async () => {
  store.db.close();
  await rm(repo, { recursive: true, force: true });
});

describe('graph indexer on ts-sample', () => {
  it('builds symbols and edges on first run', async () => {
    const result = await indexRepo(store);
    expect(result.parsed).toBeGreaterThan(0);
    expect(result.symbols).toBeGreaterThan(40);
    expect(result.edges).toBeGreaterThan(50);
    expect(result.revision).toBe(1);
  });

  it('resolves the implements edge StripeAdapter -> PaymentGateway exactly', () => {
    const source = symbolId('src/payments/stripe-adapter.ts', 'typescript', 'class', 'StripeAdapter');
    const target = symbolId('src/payments/gateway.ts', 'typescript', 'interface', 'PaymentGateway');
    const edge = store.db.get<{ provenance: string; confidence: number }>(
      `SELECT provenance, confidence FROM edges WHERE source_id = ? AND target_id = ? AND edge_type = 'implements'`,
      source,
      target,
    );
    expect(edge).toBeDefined();
    expect(edge!.provenance).toBe('LEXICAL_DERIVED');
    expect(edge!.confidence).toBeLessThanOrEqual(0.95);
  });

  it('resolves checkout -> validateOrder call cross-file', () => {
    const source = symbolId('src/checkout/service.ts', 'typescript', 'method', 'CheckoutService.checkout');
    const target = symbolId('src/orders/validation.ts', 'typescript', 'function', 'validateOrder');
    const edge = store.db.get(
      `SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND edge_type = 'calls'`,
      source,
      target,
    );
    expect(edge).toBeDefined();
  });

  it('creates file import edges with AST_EXACT provenance', () => {
    const edge = store.db.get<{ provenance: string }>(
      `SELECT provenance FROM edges WHERE source_id = ? AND target_id = ? AND edge_type = 'imports'`,
      fileId('src/checkout/service.ts'),
      fileId('src/orders/validation.ts'),
    );
    expect(edge?.provenance).toBe('AST_EXACT');
  });

  it('second run is all cache hits and does not bump revision', async () => {
    const result = await indexRepo(store);
    expect(result.parsed).toBe(0);
    expect(result.cacheHits).toBeGreaterThan(0);
    expect(result.revision).toBe(1);
  });

  it('incremental modify reparses one file, keeps stable ids, bumps revision', async () => {
    const target = join(repo, 'src', 'config.ts');
    await writeFile(
      target,
      `export const config = {\n  stripeApiKey: 'sk_test_placeholder',\n  sessionTtlMs: 7_200_000,\n  port: 8080,\n};\n`,
    );
    const before = symbolId('src/config.ts', 'typescript', 'variable', 'config');
    const result = await indexRepo(store);
    expect(result.parsed).toBe(1);
    expect(result.revision).toBe(2);
    const row = store.db.get(`SELECT id FROM symbols WHERE id = ?`, before);
    expect(row).toBeDefined();
  });

  it('deleting a file removes its symbols and edges', async () => {
    await rm(join(repo, 'tests', 'auth.test.ts'));
    await indexRepo(store);
    const symbols = store.db.all(
      `SELECT id FROM symbols WHERE file_path = 'tests/auth.test.ts'`,
    );
    expect(symbols).toHaveLength(0);
    const edges = store.db.all(
      `SELECT id FROM edges WHERE source_file = 'tests/auth.test.ts'`,
    );
    expect(edges).toHaveLength(0);
  });

  it('graphStats reports coherent totals', () => {
    const stats = graphStats(store);
    expect(stats.symbols).toBeGreaterThan(40);
    expect(stats.edgesByType['imports']).toBeGreaterThan(5);
    expect(stats.edgesByType['defines']).toBeGreaterThan(10);
    expect(stats.revision).toBe(3);
  });
});
