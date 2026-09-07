import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type SqlValue = string | number | bigint | Uint8Array | null;
export type Row = Record<string, SqlValue>;

/**
 * Thin facade over node:sqlite. Everything in SETSU talks to this interface,
 * never to node:sqlite directly, so the driver can be swapped (e.g. for
 * better-sqlite3) without touching callers.
 */
export class Db {
  private readonly db: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  private stmt(sql: string): StatementSync {
    let s = this.statements.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.statements.set(sql, s);
    }
    return s;
  }

  run(sql: string, ...params: SqlValue[]): { changes: number | bigint } {
    return this.stmt(sql).run(...params);
  }

  get<T = Row>(sql: string, ...params: SqlValue[]): T | undefined {
    return this.stmt(sql).get(...params) as T | undefined;
  }

  all<T = Row>(sql: string, ...params: SqlValue[]): T[] {
    return this.stmt(sql).all(...params) as T[];
  }

  /** node:sqlite has no transaction helper; BEGIN IMMEDIATE avoids upgrade deadlocks. */
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // rollback failure is secondary; surface the original error
      }
      throw err;
    }
  }

  close(): void {
    this.statements.clear();
    this.db.close();
  }
}
