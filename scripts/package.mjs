// Builds the zip you upload to the Chrome Web Store: node scripts/package.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

if (manifest.version !== pkg.version) {
  console.error(`Version mismatch: manifest.json is ${manifest.version}, package.json is ${pkg.version}.`);
  process.exit(1);
}

// Only what the extension needs at runtime. Tests, docs and tooling stay out of the store build.
const include = ['manifest.json', 'background.js', 'src', 'library', 'icons'];
for (const p of include) {
  if (!existsSync(resolve(root, p))) {
    console.error(`Missing ${p}`);
    process.exit(1);
  }
}

const dist = resolve(root, 'dist');
const out = resolve(dist, `${pkg.name}-v${manifest.version}.zip`);
mkdirSync(dist, { recursive: true });
rmSync(out, { force: true });

execFileSync('zip', ['-r', '-X', out, ...include, '-x', '*.DS_Store'], { cwd: root, stdio: 'inherit' });
console.log(`\nCreated ${out}`);
