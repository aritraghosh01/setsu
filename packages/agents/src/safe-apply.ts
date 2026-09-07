import { readFile, writeFile, mkdir, rename, rm, copyFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createTwoFilesPatch } from 'diff';

export interface FileChange {
  /** repo-relative POSIX path */
  path: string;
  before: string | undefined;
  after: string;
  /** post-write validation; throw to trigger rollback */
  validate?: (content: string) => void;
}

export interface ApplyResult {
  applied: string[];
  backupDir: string | undefined;
  rolledBack: boolean;
  error?: string;
}

export function renderDiff(change: FileChange): string {
  return createTwoFilesPatch(
    change.path,
    change.path,
    change.before ?? '',
    change.after,
    change.before === undefined ? '(new file)' : '',
    '',
    { context: 3 },
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe mutation pipeline, spec section 97:
 * backup -> atomic write (temp + rename) -> re-validate -> rollback on failure.
 */
export async function applyChanges(
  repoRoot: string,
  changes: readonly FileChange[],
  backupRoot: string,
): Promise<ApplyResult> {
  if (changes.length === 0) return { applied: [], backupDir: undefined, rolledBack: false };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(backupRoot, stamp);
  const backedUp: Array<{ path: string; existed: boolean }> = [];
  const applied: string[] = [];

  try {
    for (const change of changes) {
      const abs = join(repoRoot, change.path);
      const backupPath = join(backupDir, change.path);
      await mkdir(dirname(backupPath), { recursive: true });
      const existed = await exists(abs);
      if (existed) await copyFile(abs, backupPath);
      backedUp.push({ path: change.path, existed });

      const tmp = `${abs}.setsu-tmp`;
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(tmp, change.after, 'utf8');
      await rename(tmp, abs);

      const written = await readFile(abs, 'utf8');
      if (written !== change.after) throw new Error(`post-write verification failed for ${change.path}`);
      change.validate?.(written);
      applied.push(change.path);
    }
    return { applied, backupDir, rolledBack: false };
  } catch (err) {
    // Roll back everything that was touched, in reverse order.
    for (const item of [...backedUp].reverse()) {
      const abs = join(repoRoot, item.path);
      try {
        if (item.existed) {
          await copyFile(join(backupDir, item.path), abs);
        } else {
          await rm(abs, { force: true });
        }
      } catch {
        // Best-effort rollback; the backup dir still holds originals.
      }
    }
    return {
      applied: [],
      backupDir,
      rolledBack: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
