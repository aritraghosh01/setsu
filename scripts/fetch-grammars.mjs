// Downloads prebuilt tree-sitter grammar .wasm files from official grammar
// releases into packages/parsers/wasm/. Dev-time only — the wasm files are
// committed to git and shipped in the npm package; users never hit the
// network (spec section 66 rule 9).
//
// Run: node scripts/fetch-grammars.mjs [--verify]
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'parsers', 'wasm');

// Pinned releases. sha256 values are recorded after first fetch and verified
// on every subsequent run; bump versions and hashes together.
const PINS = [
  {
    file: 'tree-sitter-typescript.wasm',
    url: 'https://github.com/tree-sitter/tree-sitter-typescript/releases/download/v0.23.2/tree-sitter-typescript.wasm',
    sha256: '778025db5a8be0e70f8ccc3671e486dfeddd048c25d9e8a70c26de2e1bf6f97d',
  },
  {
    file: 'tree-sitter-tsx.wasm',
    url: 'https://github.com/tree-sitter/tree-sitter-typescript/releases/download/v0.23.2/tree-sitter-tsx.wasm',
    sha256: '79e5da75ea62855a0cd67177685f0164eac87d5f630b3cbe1e0a099751ad30f8',
  },
  {
    file: 'tree-sitter-javascript.wasm',
    url: 'https://github.com/tree-sitter/tree-sitter-javascript/releases/download/v0.25.0/tree-sitter-javascript.wasm',
    sha256: '5fb488d0cabb4775a594bab85682de5ad6ce83c0d6ac997a9f82dd084d571240',
  },
  {
    file: 'tree-sitter-python.wasm',
    url: 'https://github.com/tree-sitter/tree-sitter-python/releases/download/v0.25.0/tree-sitter-python.wasm',
    sha256: '16108b50df4ee9a30168794252ab55e7c93bfc5765d7fa0aa3e335752c515f47',
  },
];

mkdirSync(OUT_DIR, { recursive: true });

const verifyOnly = process.argv.includes('--verify');
let failed = false;

for (const pin of PINS) {
  const dest = join(OUT_DIR, pin.file);
  if (verifyOnly || existsSync(dest)) {
    if (!existsSync(dest)) {
      console.error(`MISSING ${pin.file}`);
      failed = true;
      continue;
    }
    const hash = createHash('sha256').update(readFileSync(dest)).digest('hex');
    if (pin.sha256 && hash !== pin.sha256) {
      console.error(`HASH MISMATCH ${pin.file}\n  expected ${pin.sha256}\n  actual   ${hash}`);
      failed = true;
    } else {
      console.log(`ok ${pin.file} sha256=${hash}`);
    }
    continue;
  }
  console.log(`fetching ${pin.url}`);
  const res = await fetch(pin.url, { redirect: 'follow' });
  if (!res.ok) {
    console.error(`FAILED ${pin.url}: ${res.status}`);
    failed = true;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = createHash('sha256').update(buf).digest('hex');
  if (pin.sha256 && hash !== pin.sha256) {
    console.error(`HASH MISMATCH ${pin.file}\n  expected ${pin.sha256}\n  actual   ${hash}`);
    failed = true;
    continue;
  }
  writeFileSync(dest, buf);
  console.log(`saved ${pin.file} (${buf.length} bytes) sha256=${hash}`);
}

process.exit(failed ? 1 : 0);
