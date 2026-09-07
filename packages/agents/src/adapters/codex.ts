import type { AgentAdapter, AgentInventory, InstallOptions } from '../types.js';
import { exists, readText, glob, instructionFrom, upsertGuidance, joinRepo } from '../shared.js';
import { upsertManagedBlock } from '../managed-block.js';

/**
 * Codex adapter, spec section 43. Deep for AGENTS.md guidance; MCP config
 * lives in the user-global ~/.codex/config.toml which SETSU does not edit —
 * install reports guidance changes only.
 */
export const codexAdapter: AgentAdapter = {
  id: 'codex',
  depth: 'deep',

  async detect(repoRoot) {
    const markers: string[] = [];
    if (await exists(joinRepo(repoRoot, 'AGENTS.md'))) markers.push('AGENTS.md');
    if (await exists(joinRepo(repoRoot, '.codex'))) markers.push('.codex/');
    return { agent: 'codex', detected: markers.length > 0, markers };
  },

  async discover(repoRoot) {
    const inventory: AgentInventory = {
      detection: await this.detect(repoRoot),
      instructions: [],
      skills: [],
      mcp: [],
    };
    for (const path of await glob(repoRoot, '{AGENTS.md,**/AGENTS.md}')) {
      if (path.includes('node_modules/')) continue;
      const content = await readText(joinRepo(repoRoot, path));
      if (content === undefined) continue;
      inventory.instructions.push(
        instructionFrom('codex', path, content, path === 'AGENTS.md' ? 'always' : 'path'),
      );
    }
    return inventory;
  },

  async install(repoRoot, opts: InstallOptions) {
    const changed: string[] = [];
    if (opts.guidance) {
      const result = await upsertGuidance(
        joinRepo(repoRoot, 'AGENTS.md'),
        opts.dryRun ?? false,
        upsertManagedBlock,
      );
      if (result.changed) changed.push('AGENTS.md');
    }
    return changed;
  },
};
