import { watch, type FSWatcher } from 'chokidar';
import { relative, sep } from 'node:path';

/** Batched repository change event (spec section 16). */
export interface RepoChange {
  /** repo-relative POSIX paths that changed since the last batch */
  paths: string[];
}

export interface RepoWatcher {
  start(root: string): Promise<void>;
  stop(): Promise<void>;
  onChange(handler: (change: RepoChange) => void): void;
}

export interface WatcherOptions {
  /** Debounce window; related edits batch into one event (spec: 250ms). */
  debounceMs?: number;
}

// chokidar v4 takes no globs; match path segments directly.
const IGNORED_SEGMENTS = /[\\/](node_modules|\.git|dist|build|coverage|\.setsu)([\\/]|$)/;
const isIgnored = (path: string): boolean => IGNORED_SEGMENTS.test(path);

export function createWatcher(options: WatcherOptions = {}): RepoWatcher {
  const debounceMs = options.debounceMs ?? 250;
  let watcher: FSWatcher | undefined;
  let handler: ((change: RepoChange) => void) | undefined;
  let pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  let rootDir = '';

  const flush = (): void => {
    timer = undefined;
    if (pending.size === 0 || !handler) return;
    const paths = [...pending].sort();
    pending = new Set();
    handler({ paths });
  };

  const record = (absPath: string): void => {
    const rel = relative(rootDir, absPath).split(sep).join('/');
    if (rel === '' || rel.startsWith('..')) return;
    pending.add(rel);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  return {
    async start(root: string): Promise<void> {
      rootDir = root;
      watcher = watch(root, {
        ignored: isIgnored,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      });
      watcher.on('add', record);
      watcher.on('change', record);
      watcher.on('unlink', record);
      await new Promise<void>((resolve) => watcher!.once('ready', () => resolve()));
    },
    async stop(): Promise<void> {
      if (timer) {
        clearTimeout(timer);
        flush();
      }
      await watcher?.close();
      watcher = undefined;
    },
    onChange(h: (change: RepoChange) => void): void {
      handler = h;
    },
  };
}
