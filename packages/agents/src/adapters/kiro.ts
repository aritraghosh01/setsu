import type { ActivationMode, AgentAdapter, AgentInventory } from '../types.js';
import { exists, readText, glob, instructionFrom, parseFrontmatter, joinRepo } from '../shared.js';

function steeringMode(data: Record<string, unknown>): {
  mode: ActivationMode;
  pathPatterns?: string[];
} {
  const inclusion = data['inclusion'];
  if (inclusion === 'manual') return { mode: 'manual' };
  if (inclusion === 'fileMatch') {
    const pattern = data['fileMatchPattern'];
    return {
      mode: 'path',
      ...(typeof pattern === 'string' ? { pathPatterns: [pattern] } : {}),
    };
  }
  return { mode: 'always' };
}

/** AWS Kiro adapter, spec section 46. Detection-level in v0.1 (s103). */
export const kiroAdapter: AgentAdapter = {
  id: 'kiro',
  depth: 'detection',

  async detect(repoRoot) {
    const markers: string[] = [];
    if (await exists(joinRepo(repoRoot, '.kiro/steering'))) markers.push('.kiro/steering/');
    if (await exists(joinRepo(repoRoot, '.kiro/skills'))) markers.push('.kiro/skills/');
    if (await exists(joinRepo(repoRoot, '.kiro/hooks'))) markers.push('.kiro/hooks/');
    return { agent: 'kiro', detected: markers.length > 0, markers };
  },

  async discover(repoRoot) {
    const inventory: AgentInventory = {
      detection: await this.detect(repoRoot),
      instructions: [],
      skills: [],
      mcp: [],
    };
    for (const path of await glob(repoRoot, '.kiro/steering/**/*.md')) {
      const content = await readText(joinRepo(repoRoot, path));
      if (content === undefined) continue;
      const { data } = parseFrontmatter(content);
      const { mode, pathPatterns } = steeringMode(data);
      inventory.instructions.push(
        instructionFrom('kiro', path, content, mode, pathPatterns ? { pathPatterns } : {}),
      );
    }
    return inventory;
  },
};
