import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import fg from 'fast-glob';
import { parse as parseYaml } from 'yaml';
import { estimateTokens, sha256Hex } from '@setsu-ai/core';
import type { ActivationMode, InstructionFile } from './types.js';

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

export async function glob(repoRoot: string, pattern: string): Promise<string[]> {
  return (await fg(pattern, { cwd: repoRoot, dot: true })).sort();
}

export interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(content: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return { data: {}, body: content };
  try {
    const data = parseYaml(match[1]!) as Record<string, unknown> | null;
    return { data: data ?? {}, body: content.slice(match[0].length) };
  } catch {
    return { data: {}, body: content };
  }
}

export function instructionFrom(
  agent: string,
  path: string,
  content: string,
  mode: ActivationMode,
  extra: Partial<InstructionFile> = {},
): InstructionFile {
  return {
    agent,
    path,
    contentHash: sha256Hex(content).slice(0, 16),
    estimatedTokens: estimateTokens(content, 'prose'),
    currentMode: mode,
    ...extra,
  };
}

/** Merge a setsu server entry into a JSON MCP config file (Claude/Cursor shape). */
export async function upsertMcpJson(
  absPath: string,
  dryRun: boolean,
): Promise<{ changed: boolean }> {
  let config: { mcpServers?: Record<string, unknown> } = {};
  const existing = await readText(absPath);
  if (existing) {
    try {
      config = JSON.parse(existing) as typeof config;
    } catch {
      return { changed: false };
    }
  }
  config.mcpServers ??= {};
  if (config.mcpServers['setsu']) return { changed: false };
  config.mcpServers['setsu'] = {
    command: 'setsu',
    args: ['mcp', 'serve', '--repo', '.'],
  };
  if (!dryRun) {
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  }
  return { changed: true };
}

export async function upsertGuidance(
  absPath: string,
  dryRun: boolean,
  upsert: (content: string) => string,
): Promise<{ changed: boolean }> {
  const existing = (await readText(absPath)) ?? '';
  const next = upsert(existing);
  if (next === existing) return { changed: false };
  if (!dryRun) {
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, next, 'utf8');
  }
  return { changed: true };
}

export function joinRepo(repoRoot: string, ...parts: string[]): string {
  return join(repoRoot, ...parts);
}
