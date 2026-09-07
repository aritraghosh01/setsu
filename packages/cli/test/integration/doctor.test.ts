import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGraphDb } from '@setsu-ai/storage';
import { indexRepo } from '@setsu-ai/graph';
import { collectDoctorReport } from '../../src/commands/doctor-cmd.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', '..', '..', '..', 'fixtures', 'agents-sample');

let repo: string;
let home: string;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'setsu-doc-'));
  home = await mkdtemp(join(tmpdir(), 'setsu-doc-home-'));
  process.env['SETSU_HOME'] = home;
  await cp(FIXTURE, repo, { recursive: true });
  const store = openGraphDb(repo);
  await indexRepo(store);
  store.db.close();
});

afterAll(async () => {
  delete process.env['SETSU_HOME'];
  await rm(repo, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

describe('doctor report on agents-sample', () => {
  it('produces a full report with score, tax, duplicates, graph state', async () => {
    const report = await collectDoctorReport(repo);
    expect(report.schemaVersion).toBe(1);
    expect(report.score.total).toBeGreaterThan(0);
    expect(report.score.total).toBeLessThanOrEqual(100);
    expect(report.graph.ready).toBe(true);
    expect(report.graph.freshness).toBe(1);
    expect(report.tax.length).toBeGreaterThanOrEqual(6);
    // The planted "Run npm test" line is duplicated across CLAUDE.md,
    // AGENTS.md and copilot-instructions.md.
    const dupe = report.duplicates.find((d) => d.sample.includes('npm test'));
    expect(dupe).toBeDefined();
    expect(dupe!.files.length).toBeGreaterThanOrEqual(3);
  });
});
