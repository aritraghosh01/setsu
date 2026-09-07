import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { sha256Hex } from '@setsu-ai/core';
import { setsuHome } from '@setsu-ai/storage';

/** Task fingerprint, spec section 34. Raw prompts are never persisted. */
export interface TaskFingerprint {
  taskClass: string;
  hashedTerms: string[];
  paths: string[];
  extensions: string[];
  symbols: string[];
  toolCategories: string[];
  changedFileCount: number;
  startedAt: string;
}

let cachedSalt: string | undefined;

/** Machine-local salt (spec s34); created on first use, never leaves disk. */
export function getSalt(): string {
  if (cachedSalt) return cachedSalt;
  const saltPath = join(setsuHome(), 'salt');
  if (existsSync(saltPath)) {
    cachedSalt = readFileSync(saltPath, 'utf8').trim();
    return cachedSalt;
  }
  mkdirSync(dirname(saltPath), { recursive: true });
  cachedSalt = randomBytes(32).toString('hex');
  writeFileSync(saltPath, cachedSalt, { encoding: 'utf8', mode: 0o600 });
  return cachedSalt;
}

export function hashTerm(term: string): string {
  return sha256Hex(`${getSalt()}::${term.toLowerCase()}`).slice(0, 12);
}

export interface FingerprintInput {
  taskClass: string;
  terms: readonly string[];
  paths: readonly string[];
  symbols: readonly string[];
  toolCategories?: readonly string[];
  changedFileCount?: number;
}

export function makeFingerprint(input: FingerprintInput): TaskFingerprint {
  const extensions = [
    ...new Set(
      input.paths
        .map((p) => {
          const dot = p.lastIndexOf('.');
          return dot === -1 ? '' : p.slice(dot);
        })
        .filter((e) => e !== ''),
    ),
  ].sort();
  return {
    taskClass: input.taskClass,
    hashedTerms: [...new Set(input.terms.map(hashTerm))].sort(),
    paths: [...new Set(input.paths)].sort().slice(0, 20),
    extensions,
    symbols: [...new Set(input.symbols)].sort().slice(0, 20),
    toolCategories: [...(input.toolCategories ?? [])],
    changedFileCount: input.changedFileCount ?? 0,
    startedAt: new Date().toISOString(),
  };
}

/** For tests: clear the cached salt (e.g. after SETSU_HOME changes). */
export function resetSaltCache(): void {
  cachedSalt = undefined;
}
