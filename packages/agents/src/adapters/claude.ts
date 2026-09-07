import type { AgentAdapter, AgentInventory, InstallOptions, McpConfigInfo } from '../types.js';
import { exists, readText, glob, instructionFrom, upsertMcpJson, upsertGuidance, joinRepo } from '../shared.js';
import { upsertManagedBlock } from '../managed-block.js';

/** Claude Code adapter, spec section 42. Deep: guidance block + .mcp.json. */
export const claudeAdapter: AgentAdapter = {
  id: 'claude',
  depth: 'deep',

  async detect(repoRoot) {
    const markers: string[] = [];
    if (await exists(joinRepo(repoRoot, 'CLAUDE.md'))) markers.push('CLAUDE.md');
    if (await exists(joinRepo(repoRoot, '.claude'))) markers.push('.claude/');
    if (await exists(joinRepo(repoRoot, '.mcp.json'))) markers.push('.mcp.json');
    return { agent: 'claude', detected: markers.length > 0, markers };
  },

  async discover(repoRoot) {
    const inventory: AgentInventory = {
      detection: await this.detect(repoRoot),
      instructions: [],
      skills: [],
      mcp: [],
    };
    for (const path of await glob(repoRoot, '{CLAUDE.md,**/CLAUDE.md}')) {
      if (path.includes('node_modules/')) continue;
      const content = await readText(joinRepo(repoRoot, path));
      if (content === undefined) continue;
      // Root CLAUDE.md always loads; nested ones load when working in that dir.
      inventory.instructions.push(
        instructionFrom('claude', path, content, path === 'CLAUDE.md' ? 'always' : 'path'),
      );
    }
    for (const path of await glob(repoRoot, '.claude/skills/*/SKILL.md')) {
      const content = await readText(joinRepo(repoRoot, path));
      if (content === undefined) continue;
      const name = path.split('/')[2] ?? path;
      inventory.skills.push({
        agent: 'claude',
        path,
        name,
        estimatedTokens: instructionFrom('claude', path, content, 'skill').estimatedTokens,
      });
    }
    const mcpRaw = await readText(joinRepo(repoRoot, '.mcp.json'));
    if (mcpRaw !== undefined) {
      let serverNames: string[] = [];
      try {
        const parsed = JSON.parse(mcpRaw) as { mcpServers?: Record<string, unknown> };
        serverNames = Object.keys(parsed.mcpServers ?? {});
      } catch {
        serverNames = [];
      }
      const info: McpConfigInfo = {
        agent: 'claude',
        path: '.mcp.json',
        serverNames,
        hasSetsu: serverNames.includes('setsu'),
      };
      inventory.mcp.push(info);
    }
    return inventory;
  },

  async install(repoRoot, opts: InstallOptions) {
    const changed: string[] = [];
    if (opts.guidance) {
      const result = await upsertGuidance(
        joinRepo(repoRoot, 'CLAUDE.md'),
        opts.dryRun ?? false,
        upsertManagedBlock,
      );
      if (result.changed) changed.push('CLAUDE.md');
    }
    if (opts.mcp) {
      const result = await upsertMcpJson(joinRepo(repoRoot, '.mcp.json'), opts.dryRun ?? false);
      if (result.changed) changed.push('.mcp.json');
    }
    return changed;
  },
};
