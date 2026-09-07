import { join } from 'node:path';
import { discoverAll, ADAPTERS } from './index.js';
import { readText } from './shared.js';
import { findDuplicates } from './doctor.js';
import type { AgentInventory } from './types.js';

export type RecommendationType =
  | 'install_guidance'
  | 'register_mcp'
  | 'deduplicate_instruction'
  | 'scope_instruction'
  | 'extract_skill';

export interface Recommendation {
  id: string;
  type: RecommendationType;
  agent: string;
  target: string;
  description: string;
  /** True when setsu optimize --apply can execute this automatically. */
  applicable: boolean;
}

export interface OptimizationPlan {
  recommendations: Recommendation[];
  inventories: AgentInventory[];
}

/** Generate the optimization plan (spec sections 38, 56). Advisory by default. */
export async function planOptimizations(repoRoot: string): Promise<OptimizationPlan> {
  const inventories = await discoverAll(repoRoot);
  const recommendations: Recommendation[] = [];

  for (const inv of inventories) {
    if (!inv.detection.detected) continue;
    const adapter = ADAPTERS.find((a) => a.id === inv.detection.agent);
    if (!adapter?.install) continue;

    const guidanceInstalled = await (async () => {
      const candidates =
        adapter.id === 'cursor'
          ? ['.cursor/rules/setsu.mdc']
          : adapter.id === 'codex'
            ? ['AGENTS.md']
            : ['CLAUDE.md'];
      for (const candidate of candidates) {
        const content = await readText(join(repoRoot, candidate));
        if (content?.includes('SETSU:BEGIN scout')) return true;
        if (adapter.id === 'cursor' && content !== undefined) return true;
      }
      return false;
    })();
    if (!guidanceInstalled) {
      recommendations.push({
        id: `guidance:${adapter.id}`,
        type: 'install_guidance',
        agent: adapter.id,
        target: adapter.id === 'cursor' ? '.cursor/rules/setsu.mdc' : adapter.id === 'codex' ? 'AGENTS.md' : 'CLAUDE.md',
        description: `Add graph-first SETSU guidance for ${adapter.id}`,
        applicable: true,
      });
    }

    if (adapter.id === 'claude' || adapter.id === 'cursor') {
      const hasSetsu = inv.mcp.some((m) => m.hasSetsu);
      if (!hasSetsu) {
        recommendations.push({
          id: `mcp:${adapter.id}`,
          type: 'register_mcp',
          agent: adapter.id,
          target: adapter.id === 'claude' ? '.mcp.json' : '.cursor/mcp.json',
          description: `Register the SETSU MCP server for ${adapter.id}`,
          applicable: true,
        });
      }
    }
  }

  // Advisory: duplicated instructions across agents (never auto-edited —
  // spec s56 allows duplicate cleanup but user prose stays user-owned in v0.1).
  const instructions = inventories.flatMap((inv) => inv.instructions);
  const contents = new Map<string, string>();
  for (const instruction of instructions) {
    const content = await readText(join(repoRoot, instruction.path));
    if (content !== undefined) contents.set(instruction.path, content);
  }
  for (const dupe of findDuplicates(instructions, contents).slice(0, 5)) {
    recommendations.push({
      id: `dedupe:${dupe.files.join('+')}`,
      type: 'deduplicate_instruction',
      agent: 'all',
      target: dupe.files.join(', '),
      description: `Duplicated guidance (~${dupe.estimatedTokens} tokens): "${dupe.sample}"`,
      applicable: false,
    });
  }

  // Advisory: very large always-on instruction files could become skills.
  for (const instruction of instructions) {
    if (instruction.currentMode === 'always' && instruction.estimatedTokens > 4000) {
      recommendations.push({
        id: `skill:${instruction.path}`,
        type: 'extract_skill',
        agent: instruction.agent,
        target: instruction.path,
        description: `~${instruction.estimatedTokens} always-on tokens; consider extracting rarely-used sections into skills`,
        applicable: false,
      });
    }
  }

  return { recommendations, inventories };
}
