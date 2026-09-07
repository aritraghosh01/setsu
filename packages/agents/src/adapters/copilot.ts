import type { AgentAdapter, AgentInventory } from '../types.js';
import { exists, readText, glob, instructionFrom, parseFrontmatter, joinRepo } from '../shared.js';

/** GitHub Copilot adapter, spec section 45. Detection-level in v0.1 (s103). */
export const copilotAdapter: AgentAdapter = {
  id: 'copilot',
  depth: 'detection',

  async detect(repoRoot) {
    const markers: string[] = [];
    if (await exists(joinRepo(repoRoot, '.github/copilot-instructions.md'))) {
      markers.push('.github/copilot-instructions.md');
    }
    if (await exists(joinRepo(repoRoot, '.github/instructions'))) {
      markers.push('.github/instructions/');
    }
    if (await exists(joinRepo(repoRoot, '.github/prompts'))) markers.push('.github/prompts/');
    return { agent: 'copilot', detected: markers.length > 0, markers };
  },

  async discover(repoRoot) {
    const inventory: AgentInventory = {
      detection: await this.detect(repoRoot),
      instructions: [],
      skills: [],
      mcp: [],
    };
    const main = await readText(joinRepo(repoRoot, '.github/copilot-instructions.md'));
    if (main !== undefined) {
      inventory.instructions.push(
        instructionFrom('copilot', '.github/copilot-instructions.md', main, 'always'),
      );
    }
    for (const path of await glob(repoRoot, '.github/instructions/*.instructions.md')) {
      const content = await readText(joinRepo(repoRoot, path));
      if (content === undefined) continue;
      const { data } = parseFrontmatter(content);
      const applyTo = data['applyTo'];
      inventory.instructions.push(
        instructionFrom(
          'copilot',
          path,
          content,
          typeof applyTo === 'string' ? 'path' : 'manual',
          typeof applyTo === 'string' ? { pathPatterns: [applyTo] } : {},
        ),
      );
    }
    return inventory;
  },
};
