import { claudeAdapter } from './adapters/claude.js';
import { codexAdapter } from './adapters/codex.js';
import { cursorAdapter } from './adapters/cursor.js';
import { copilotAdapter } from './adapters/copilot.js';
import { kiroAdapter } from './adapters/kiro.js';
import type { AgentAdapter, AgentInventory, InstallOptions } from './types.js';

export type {
  AgentAdapter,
  AgentInventory,
  InstructionFile,
  SkillFile,
  McpConfigInfo,
  DetectionResult,
  InstallOptions,
  ActivationMode,
} from './types.js';
export { upsertManagedBlock, hasManagedBlock, SCOUT_GUIDANCE } from './managed-block.js';
export { parseFrontmatter } from './shared.js';

export const ADAPTERS: readonly AgentAdapter[] = [
  claudeAdapter,
  codexAdapter,
  cursorAdapter,
  copilotAdapter,
  kiroAdapter,
];

export async function discoverAll(repoRoot: string): Promise<AgentInventory[]> {
  const inventories: AgentInventory[] = [];
  for (const adapter of ADAPTERS) {
    inventories.push(await adapter.discover(repoRoot));
  }
  return inventories;
}

export async function installAll(
  repoRoot: string,
  opts: InstallOptions,
  agentIds?: readonly string[],
): Promise<Record<string, string[]>> {
  const changed: Record<string, string[]> = {};
  for (const adapter of ADAPTERS) {
    if (!adapter.install) continue;
    if (agentIds && !agentIds.includes(adapter.id)) continue;
    const files = await adapter.install(repoRoot, opts);
    if (files.length > 0) changed[adapter.id] = files;
  }
  return changed;
}
