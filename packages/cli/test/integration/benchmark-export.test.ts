import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, cp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGraphDb } from '@setsu-ai/storage';
import { indexRepo, GraphView } from '@setsu-ai/graph';
import { runBenchmark } from '../../src/commands/benchmark-cmd.js';
import { runExport, runImport } from '../../src/commands/export-cmd.js';

const here = dirname(fileURLToPath(import.meta.url));
const TS_SAMPLE = join(here, '..', '..', '..', '..', 'fixtures', 'ts-sample');
const BENCH = join(here, '..', '..', '..', '..', 'benchmarks', 'ts-sample-queries.json');

let repo: string;
let home: string;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'setsu-bench-'));
  home = await mkdtemp(join(tmpdir(), 'setsu-bench-home-'));
  process.env['SETSU_HOME'] = home;
  await cp(TS_SAMPLE, repo, { recursive: true });
});

afterAll(async () => {
  delete process.env['SETSU_HOME'];
  await rm(repo, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

describe('setsu benchmark', () => {
  it('reports honest per-task numbers and a favorable median', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
    try {
      await runBenchmark({ repo, tasks: BENCH, json: true });
    } finally {
      spy.mockRestore();
    }
    const report = JSON.parse(logs.join('\n'));
    expect(report.schemaVersion).toBe(1);
    expect(report.results).toHaveLength(5);
    expect(report.note).toContain('task success is measured');
    for (const result of report.results) {
      expect(result.setsuTokens).toBeGreaterThan(0);
      expect(result.baselineTokens).toBeGreaterThanOrEqual(0);
    }
    // The whole thesis: budgeted packs cost less than grep-then-read-files.
    expect(report.medianSetsuTokens).toBeLessThan(report.medianBaselineTokens);
  });
});

describe('setsu export / import round trip', () => {
  it('preserves nodes and edges', async () => {
    const store = openGraphDb(repo, ':memory:');
    let nodesBefore = 0;
    let edgesBefore = 0;
    try {
      await indexRepo(store);
      const view = GraphView.load(store);
      nodesBefore = view.nodes.size;
      edgesBefore = view.edges.length;
    } finally {
      store.db.close();
    }

    const dumpPath = join(repo, 'graph-dump.json');
    await runExport({ repo, out: dumpPath });
    const dump = JSON.parse(await readFile(dumpPath, 'utf8'));
    expect(dump.nodes.length).toBeGreaterThan(0);
    expect(dump.edges.length).toBe(edgesBefore);
    expect(nodesBefore).toBeGreaterThan(0);

    // Import into a fresh home (fresh graph db) and verify counts.
    const freshHome = await mkdtemp(join(tmpdir(), 'setsu-imp-'));
    const oldHome = process.env['SETSU_HOME'];
    process.env['SETSU_HOME'] = freshHome;
    try {
      await runImport(dumpPath, { repo });
      const fresh = openGraphDb(repo);
      try {
        const symbolCount = fresh.db.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM symbols WHERE repo_id = ?`,
          fresh.repoId,
        )!.n;
        const edgeCount = fresh.db.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM edges WHERE repo_id = ?`,
          fresh.repoId,
        )!.n;
        expect(symbolCount).toBe(dump.nodes.filter((n: { kind: string }) => n.kind !== 'file').length);
        expect(edgeCount).toBe(dump.edges.length);
      } finally {
        fresh.db.close();
      }
    } finally {
      process.env['SETSU_HOME'] = oldHome;
      await rm(freshHome, { recursive: true, force: true });
    }
  });
});
