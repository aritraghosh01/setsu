import type { ActivationMode, InstructionFile } from './types.js';

/** Probability an instruction is actually loaded into a session, by mode. */
const ACTIVATION_PROBABILITY: Record<ActivationMode, number> = {
  always: 1,
  path: 0.3,
  relevance: 0.4,
  manual: 0.05,
  skill: 0.05,
  unknown: 0.5,
};

export interface InstructionTax {
  instruction: InstructionFile;
  /** estimated tokens loaded per session (spec section 39 effectiveTax) */
  effectiveTokens: number;
}

export function contextTax(instructions: readonly InstructionFile[]): InstructionTax[] {
  return instructions
    .map((instruction) => ({
      instruction,
      effectiveTokens: Math.round(
        instruction.estimatedTokens * ACTIVATION_PROBABILITY[instruction.currentMode],
      ),
    }))
    .sort((a, b) => b.effectiveTokens - a.effectiveTokens);
}

export interface DuplicateGroup {
  /** normalized line shared across files */
  sample: string;
  files: string[];
  estimatedTokens: number;
}

/**
 * Cross-agent duplication: identical content hashes, plus long lines that
 * appear in 2+ instruction files (the "same rule pasted into every agent
 * config" pattern).
 */
export function findDuplicates(
  instructions: readonly InstructionFile[],
  contents: ReadonlyMap<string, string>,
): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];

  const byHash = new Map<string, InstructionFile[]>();
  for (const instruction of instructions) {
    const list = byHash.get(instruction.contentHash);
    if (list) list.push(instruction);
    else byHash.set(instruction.contentHash, [instruction]);
  }
  for (const list of byHash.values()) {
    if (list.length > 1) {
      groups.push({
        sample: '(entire file duplicated)',
        files: list.map((i) => i.path),
        estimatedTokens: list[0]!.estimatedTokens * (list.length - 1),
      });
    }
  }

  const lineFiles = new Map<string, Set<string>>();
  for (const instruction of instructions) {
    const content = contents.get(instruction.path);
    if (!content) continue;
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (line.length < 30 || line.startsWith('#') || line.startsWith('---')) continue;
      const set = lineFiles.get(line);
      if (set) set.add(instruction.path);
      else lineFiles.set(line, new Set([instruction.path]));
    }
  }
  for (const [line, files] of lineFiles) {
    if (files.size > 1) {
      groups.push({
        sample: line.slice(0, 80),
        files: [...files].sort(),
        estimatedTokens: Math.ceil((line.length / 4) * (files.size - 1)),
      });
    }
  }
  return groups.sort((a, b) => b.estimatedTokens - a.estimatedTokens);
}

export interface ScoreInput {
  /** tokens loaded unconditionally every session */
  alwaysTokens: number;
  /** total instruction tokens across all agents */
  totalInstructionTokens: number;
  /** tokens of scoped (path/relevance/manual/skill) instructions */
  scopedTokens: number;
  duplicateTokens: number;
  /** 0..1: fraction of files whose index entry is current */
  graphFreshness: number | undefined;
  graphReady: boolean;
  /** total MCP servers registered across agents */
  mcpServerCount: number | undefined;
  /** 0..1 retrieval efficiency; undefined until learning has data */
  retrievalEfficiency?: number | undefined;
}

export interface ScoreComponent {
  name: string;
  weight: number;
  /** 0..100, undefined = metric unavailable, weight redistributed (s79) */
  score: number | undefined;
}

export interface EfficiencyScore {
  total: number;
  components: ScoreComponent[];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Context Efficiency Score 0-100 with spec section 79 weights. */
export function computeEfficiencyScore(input: ScoreInput): EfficiencyScore {
  const scoped = input.totalInstructionTokens > 0 ? input.scopedTokens / input.totalInstructionTokens : 1;
  const dupRatio =
    input.totalInstructionTokens > 0 ? input.duplicateTokens / input.totalInstructionTokens : 0;

  const components: ScoreComponent[] = [
    {
      name: 'persistent context',
      weight: 20,
      // <2k always-on tokens is healthy; 20k+ is a fully-taxed window.
      score: clamp(100 - ((input.alwaysTokens - 2000) / 18000) * 100),
    },
    { name: 'instruction scoping', weight: 15, score: clamp(40 + scoped * 60) },
    { name: 'duplication', weight: 10, score: clamp(100 - dupRatio * 300) },
    {
      name: 'code retrieval efficiency',
      weight: 20,
      score:
        input.retrievalEfficiency !== undefined ? clamp(input.retrievalEfficiency * 100) : undefined,
    },
    {
      name: 'graph freshness',
      weight: 10,
      score: input.graphReady ? clamp((input.graphFreshness ?? 1) * 100) : 0,
    },
    { name: 'session hygiene', weight: 10, score: undefined },
    { name: 'tool-output efficiency', weight: 5, score: undefined },
    {
      name: 'MCP surface efficiency',
      weight: 5,
      score:
        input.mcpServerCount !== undefined
          ? clamp(100 - Math.max(0, input.mcpServerCount - 5) * 10)
          : undefined,
    },
    { name: 'learning quality', weight: 5, score: undefined },
  ];

  // Reweight: unavailable metrics redistribute their weight proportionally.
  const available = components.filter((c) => c.score !== undefined);
  const availableWeight = available.reduce((n, c) => n + c.weight, 0);
  const total =
    availableWeight > 0
      ? Math.round(available.reduce((n, c) => n + c.score! * (c.weight / availableWeight), 0))
      : 0;

  return { total, components };
}
