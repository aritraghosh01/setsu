import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, cp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planOptimizations, changesFor, applyChanges, renderDiff, hasManagedBlock } from '@setsu-ai/agents';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', '..', '..', '..', 'fixtures', 'agents-sample');

let repo: string;
let backups: string;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'setsu-opt-'));
  backups = await mkdtemp(join(tmpdir(), 'setsu-opt-bak-'));
  await cp(FIXTURE, repo, { recursive: true });
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
  await rm(backups, { recursive: true, force: true });
});

describe('optimizer plan + safe apply', () => {
  it('recommends guidance + MCP for deep adapters and advisories for dupes', async () => {
    const plan = await planOptimizations(repo);
    const types = plan.recommendations.map((r) => `${r.type}:${r.agent}`);
    expect(types).toContain('install_guidance:claude');
    expect(types).toContain('install_guidance:codex');
    expect(types).toContain('register_mcp:claude');
    expect(types).toContain('register_mcp:cursor');
    const dedupe = plan.recommendations.find((r) => r.type === 'deduplicate_instruction');
    expect(dedupe).toBeDefined();
    expect(dedupe!.applicable).toBe(false);
  });

  it('dry-run diffs never modify files', async () => {
    const plan = await planOptimizations(repo);
    const changes = await changesFor(repo, plan.recommendations);
    expect(changes.length).toBeGreaterThan(0);
    const diff = renderDiff(changes[0]!);
    expect(diff).toContain('+');
    const claudeMd = await readFile(join(repo, 'CLAUDE.md'), 'utf8');
    expect(hasManagedBlock(claudeMd)).toBe(false);
  });

  it('apply writes atomically with backups; original content preserved', async () => {
    const plan = await planOptimizations(repo);
    const changes = await changesFor(repo, plan.recommendations);
    const result = await applyChanges(repo, changes, backups);
    expect(result.rolledBack).toBe(false);
    expect(result.applied).toContain('CLAUDE.md');
    expect(result.applied).toContain('.mcp.json');

    const claudeMd = await readFile(join(repo, 'CLAUDE.md'), 'utf8');
    expect(hasManagedBlock(claudeMd)).toBe(true);
    expect(claudeMd).toContain('# Project instructions');

    const backupEntries = await readdir(result.backupDir!);
    expect(backupEntries.length).toBeGreaterThan(0);
    const backedUpClaude = await readFile(join(result.backupDir!, 'CLAUDE.md'), 'utf8');
    expect(hasManagedBlock(backedUpClaude)).toBe(false);
  });

  it('second plan is quiet for auto items (idempotent)', async () => {
    const plan = await planOptimizations(repo);
    const auto = plan.recommendations.filter((r) => r.applicable);
    expect(auto).toHaveLength(0);
  });

  it('validation failure rolls everything back', async () => {
    const before = await readFile(join(repo, 'AGENTS.md'), 'utf8');
    const result = await applyChanges(
      repo,
      [
        { path: 'AGENTS.md', before, after: before + '\nEXTRA\n' },
        {
          path: 'broken.json',
          before: undefined,
          after: 'not json',
          validate: (content) => {
            JSON.parse(content);
          },
        },
      ],
      backups,
    );
    expect(result.rolledBack).toBe(true);
    expect(await readFile(join(repo, 'AGENTS.md'), 'utf8')).toBe(before);
    await expect(readFile(join(repo, 'broken.json'), 'utf8')).rejects.toThrow();
  });
});
