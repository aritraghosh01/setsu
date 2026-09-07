import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, cp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installAll, hasManagedBlock } from '@setsu-ai/agents';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', '..', '..', '..', 'fixtures', 'agents-sample');

let repo: string;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'setsu-install-'));
  await cp(FIXTURE, repo, { recursive: true });
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe('installAll', () => {
  it('writes guidance blocks and MCP configs for deep adapters', async () => {
    const changed = await installAll(repo, { guidance: true, mcp: true });
    expect(changed['claude']).toContain('CLAUDE.md');
    expect(changed['claude']).toContain('.mcp.json');
    expect(changed['codex']).toContain('AGENTS.md');
    expect(changed['cursor']).toContain('.cursor/rules/setsu.mdc');
    expect(changed['cursor']).toContain('.cursor/mcp.json');
    // detection-level adapters never write
    expect(changed['copilot']).toBeUndefined();
    expect(changed['kiro']).toBeUndefined();

    const claudeMd = await readFile(join(repo, 'CLAUDE.md'), 'utf8');
    expect(hasManagedBlock(claudeMd)).toBe(true);
    expect(claudeMd).toContain('# Project instructions'); // original preserved

    const mcp = JSON.parse(await readFile(join(repo, '.mcp.json'), 'utf8'));
    expect(mcp.mcpServers.setsu.command).toBe('setsu');
  });

  it('is idempotent on second run', async () => {
    const changed = await installAll(repo, { guidance: true, mcp: true });
    expect(Object.keys(changed)).toHaveLength(0);
  });

  it('dry-run reports without writing', async () => {
    const fresh = await mkdtemp(join(tmpdir(), 'setsu-dry-'));
    try {
      await cp(FIXTURE, fresh, { recursive: true });
      const changed = await installAll(fresh, { guidance: true, mcp: true, dryRun: true });
      expect(changed['claude']).toContain('CLAUDE.md');
      const claudeMd = await readFile(join(fresh, 'CLAUDE.md'), 'utf8');
      expect(hasManagedBlock(claudeMd)).toBe(false);
    } finally {
      await rm(fresh, { recursive: true, force: true });
    }
  });
});
