import { describe, it, expect } from 'vitest';
import { toRepoRelPosix, PathEscapeError, sha256Hex, stableId, languageForPath, estimateTokens } from '@setsu-ai/core';
import { join } from 'node:path';

describe('toRepoRelPosix', () => {
  const root = process.platform === 'win32' ? 'C:\\repo' : '/repo';

  it('normalizes separators to posix', () => {
    expect(toRepoRelPosix(root, join(root, 'src', 'auth', 'service.ts'))).toBe(
      'src/auth/service.ts',
    );
  });

  it('accepts already-relative paths', () => {
    expect(toRepoRelPosix(root, 'src/index.ts')).toBe('src/index.ts');
  });

  it('throws on paths escaping the repo', () => {
    expect(() => toRepoRelPosix(root, join(root, '..', 'outside.ts'))).toThrow(PathEscapeError);
  });
});

describe('stableId', () => {
  it('is deterministic and prefix-tagged', () => {
    const a = stableId('sym', 'src/auth/service.ts', 'typescript', 'class', 'AuthService');
    const b = stableId('sym', 'src/auth/service.ts', 'typescript', 'class', 'AuthService');
    expect(a).toBe(b);
    expect(a).toMatch(/^sym_[0-9a-f]{20}$/);
  });

  it('changes when any identity part changes', () => {
    const a = stableId('sym', 'a.ts', 'typescript', 'class', 'A');
    const b = stableId('sym', 'a.ts', 'typescript', 'class', 'B');
    expect(a).not.toBe(b);
  });
});

describe('languageForPath', () => {
  it('maps common extensions', () => {
    expect(languageForPath('src/a.ts')).toBe('typescript');
    expect(languageForPath('src/a.tsx')).toBe('tsx');
    expect(languageForPath('app/main.py')).toBe('python');
    expect(languageForPath('README.md')).toBe('markdown');
    expect(languageForPath('Makefile')).toBeUndefined();
  });
});

describe('estimateTokens', () => {
  it('scales with length and never returns 0 for non-empty text', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('x')).toBe(1);
    expect(estimateTokens('a'.repeat(380))).toBe(100);
  });
});

describe('sha256Hex', () => {
  it('hashes deterministically', () => {
    expect(sha256Hex('setsu')).toBe(sha256Hex('setsu'));
    expect(sha256Hex('setsu')).toHaveLength(64);
  });
});
