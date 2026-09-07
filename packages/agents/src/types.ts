/** Adapter architecture, spec sections 40-41. */

export type ActivationMode = 'always' | 'path' | 'relevance' | 'manual' | 'skill' | 'unknown';

export interface InstructionFile {
  agent: string;
  /** repo-relative POSIX path */
  path: string;
  contentHash: string;
  estimatedTokens: number;
  currentMode: ActivationMode;
  pathPatterns?: string[];
  description?: string;
}

export interface SkillFile {
  agent: string;
  path: string;
  name: string;
  estimatedTokens: number;
}

export interface McpConfigInfo {
  agent: string;
  path: string;
  serverNames: string[];
  hasSetsu: boolean;
}

export interface DetectionResult {
  agent: string;
  detected: boolean;
  markers: string[];
}

export interface AgentInventory {
  detection: DetectionResult;
  instructions: InstructionFile[];
  skills: SkillFile[];
  mcp: McpConfigInfo[];
}

export interface AgentAdapter {
  id: string;
  /** Depth of config generation supported in this version. */
  depth: 'deep' | 'detection';
  detect(repoRoot: string): Promise<DetectionResult>;
  discover(repoRoot: string): Promise<AgentInventory>;
  /**
   * Install SETSU integration (managed guidance block and/or MCP server
   * registration). Only deep adapters implement writes; returns the list of
   * files that were (or would be) changed.
   */
  install?(repoRoot: string, opts: InstallOptions): Promise<string[]>;
}

export interface InstallOptions {
  guidance: boolean;
  mcp: boolean;
  dryRun?: boolean;
}
