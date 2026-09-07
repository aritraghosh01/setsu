import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function hashFile(absPath: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(absPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolvePromise(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/** Stable short id from logical identity parts (spec section 13). */
export function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${sha256Hex(parts.join('::')).slice(0, 20)}`;
}
