import type { ActivationMode, AgentAdapter, AgentInventory, InstallOptions } from '../types.js';
import { exists, readText, glob, instructionFrom, parseFrontmatter, upsertMcpJson, upsertGuidance, joinRepo } from '../shared.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const SETSU_RULE = `---
description: Use SETSU code intelligence for repository-wide questions
alwaysApply: true
---

For repository-wide questions, use SETSU code intelligence before broad raw-file search.
Call the \`setsu_context\` MCP tool with the task or question; it returns a token-budgeted
evidence pack (symbols, snippets, graph paths). Read full files only when the returned
evidence is insufficient.
`;

function modeFor(data: Record<string, unknown>): {
  mode: ActivationMode;
  pathPatterns?: string[];
  description?: string;
} {
  if (data['alwaysApply'] === true) return { mode: 'always' };
  const globs = data['globs'];
  if (typeof globs === 'string' && globs.length > 0) {
    return { mode: 'path', pathPatterns: globs.split(',').map((g) => g.trim()) };
  }
  if (Array.isArray(globs) && globs.length > 0) {
    return { mode: 'path', pathPatterns: globs.map(String) };
  }
  if (typeof data['description'] === 'string' && data['description'].length > 0) {
    return { mode: 'relevance', description: data['description'] };
  }
  return { mode: 'manual' };
}

/** Cursor adapter, spec section 44. Deep: .cursor/rules + .cursor/mcp.json. */
export const cursorAdapter: AgentAdapter = {
  id: 'cursor',
  depth: 'deep',

  async detect(repoRoot) {
    const markers: string[] = [];
    if (await exists(joinRepo(repoRoot, '.cursor'))) markers.push('.cursor/');
    if (await exists(joinRepo(repoRoot, '.cursor/rules'))) markers.push('.cursor/rules/');
    return { agent: 'cursor', detected: markers.length > 0, markers };
  },

  async discover(repoRoot) {
    const inventory: AgentInventory = {
      detection: await this.detect(repoRoot),
      instructions: [],
      skills: [],
      mcp: [],
    };
    for (const path of await glob(repoRoot, '.cursor/rules/**/*.mdc')) {
      const content = await readText(joinRepo(repoRoot, path));
      if (content === undefined) continue;
      const { data } = parseFrontmatter(content);
      const { mode, pathPatterns, description } = modeFor(data);
      inventory.instructions.push(
        instructionFrom('cursor', path, content, mode, {
          ...(pathPatterns ? { pathPatterns } : {}),
          ...(description ? { description } : {}),
        }),
      );
    }
    const mcpRaw = await readText(joinRepo(repoRoot, '.cursor/mcp.json'));
    if (mcpRaw !== undefined) {
      let serverNames: string[] = [];
      try {
        serverNames = Object.keys(
          (JSON.parse(mcpRaw) as { mcpServers?: Record<string, unknown> }).mcpServers ?? {},
        );
      } catch {
        serverNames = [];
      }
      inventory.mcp.push({
        agent: 'cursor',
        path: '.cursor/mcp.json',
        serverNames,
        hasSetsu: serverNames.includes('setsu'),
      });
    }
    return inventory;
  },

  async install(repoRoot, opts: InstallOptions) {
    const changed: string[] = [];
    if (opts.guidance) {
      const rulePath = joinRepo(repoRoot, '.cursor', 'rules', 'setsu.mdc');
      const result = await upsertGuidance(rulePath, opts.dryRun ?? false, () => SETSU_RULE);
      if (result.changed) {
        if (!opts.dryRun) {
          await mkdir(dirname(rulePath), { recursive: true });
          await writeFile(rulePath, SETSU_RULE, 'utf8');
        }
        changed.push('.cursor/rules/setsu.mdc');
      }
    }
    if (opts.mcp) {
      const result = await upsertMcpJson(joinRepo(repoRoot, '.cursor', 'mcp.json'), opts.dryRun ?? false);
      if (result.changed) changed.push('.cursor/mcp.json');
    }
    return changed;
  },
};
