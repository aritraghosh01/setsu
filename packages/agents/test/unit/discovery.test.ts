import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverAll, upsertManagedBlock, hasManagedBlock } from '@setsu-ai/agents';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', '..', '..', '..', 'fixtures', 'agents-sample');

describe('discoverAll on agents-sample', async () => {
  const inventories = await discoverAll(FIXTURE);
  const byAgent = new Map(inventories.map((inv) => [inv.detection.agent, inv]));

  it('detects all five agents', () => {
    for (const agent of ['claude', 'codex', 'cursor', 'copilot', 'kiro']) {
      expect(byAgent.get(agent)?.detection.detected, agent).toBe(true);
    }
  });

  it('classifies claude CLAUDE.md as always-loaded', () => {
    const claude = byAgent.get('claude')!;
    expect(claude.instructions).toHaveLength(1);
    expect(claude.instructions[0]).toMatchObject({ path: 'CLAUDE.md', currentMode: 'always' });
    expect(claude.instructions[0]!.estimatedTokens).toBeGreaterThan(30);
  });

  it('classifies cursor rules by frontmatter', () => {
    const cursor = byAgent.get('cursor')!;
    const modes = new Map(cursor.instructions.map((i) => [i.path, i]));
    expect(modes.get('.cursor/rules/style.mdc')?.currentMode).toBe('always');
    expect(modes.get('.cursor/rules/api.mdc')?.currentMode).toBe('path');
    expect(modes.get('.cursor/rules/api.mdc')?.pathPatterns).toEqual(['src/api/**/*.ts']);
  });

  it('classifies kiro steering fileMatch mode', () => {
    const kiro = byAgent.get('kiro')!;
    expect(kiro.instructions[0]).toMatchObject({
      currentMode: 'path',
      pathPatterns: ['src/**/*.ts'],
    });
  });

  it('finds copilot always-on instructions', () => {
    const copilot = byAgent.get('copilot')!;
    expect(copilot.instructions[0]).toMatchObject({
      path: '.github/copilot-instructions.md',
      currentMode: 'always',
    });
  });
});

describe('managed block', () => {
  it('inserts once and is idempotent', () => {
    const once = upsertManagedBlock('# Hello\n');
    expect(hasManagedBlock(once)).toBe(true);
    const twice = upsertManagedBlock(once);
    expect(twice).toBe(once);
    expect(twice.match(/SETSU:BEGIN/g)).toHaveLength(1);
  });

  it('refreshes stale block content in place', () => {
    const stale = '# Top\n<!-- SETSU:BEGIN scout -->\nold text\n<!-- SETSU:END scout -->\n# Bottom\n';
    const fresh = upsertManagedBlock(stale);
    expect(fresh).toContain('# Top');
    expect(fresh).toContain('# Bottom');
    expect(fresh).not.toContain('old text');
    expect(fresh).toContain('setsu_context');
  });
});
