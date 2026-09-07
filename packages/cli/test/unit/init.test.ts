import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../../src/commands/init.js';

describe('setsu init', () => {
  it('creates .setsu with config.json and .gitignore', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'setsu-init-'));
    try {
      const result = await runInit(dir, { skipIndex: true });
      expect(result.createdConfig).toBe(true);

      const config = JSON.parse(await readFile(join(dir, '.setsu', 'config.json'), 'utf8'));
      expect(config.version).toBe(1);
      expect(config.retrieval.defaultBudget).toBe(1500);
      expect(config.privacy.network).toBe(false);
      expect(config.learning.storeRawPrompts).toBe(false);

      const gitignore = await readFile(join(dir, '.setsu', '.gitignore'), 'utf8');
      expect(gitignore).toContain('*.db');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not overwrite an existing config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'setsu-init-'));
    try {
      await runInit(dir, { skipIndex: true });
      const configPath = join(dir, '.setsu', 'config.json');
      const before = await readFile(configPath, 'utf8');
      const second = await runInit(dir, { skipIndex: true });
      expect(second.createdConfig).toBe(false);
      expect(await readFile(configPath, 'utf8')).toBe(before);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
