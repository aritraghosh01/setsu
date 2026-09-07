// Builds workspace packages in dependency order. tsup bundles workspace deps
// into the CLI, so only packages that ship build output need building; today
// that is just the CLI, but each package may declare its own build script.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ORDER = [
  'core',
  'storage',
  'parsers',
  'graph',
  'retrieval',
  'agents',
  'learning',
  'mcp',
  'cli',
];

for (const name of ORDER) {
  const dir = join('packages', name);
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts?.build) continue;
  console.log(`\n=== building ${pkg.name} ===`);
  execSync('npm run build', { cwd: dir, stdio: 'inherit' });
}
