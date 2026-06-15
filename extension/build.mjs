// Build script for the extension: bundles the TS entry points with esbuild and
// copies static assets (manifest, popup html/css, icons) into dist/.
// Usage:  node build.mjs           (one-off build)
//         node build.mjs --watch   (rebuild on change)

import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(root, 'dist');
const watch = process.argv.includes('--watch');

const entryPoints = {
  background: resolve(root, 'src/background.ts'),
  content: resolve(root, 'src/content.ts'),
  popup: resolve(root, 'src/popup.ts'),
};

const buildOptions = {
  entryPoints,
  outdir,
  bundle: true,
  format: 'iife',
  target: ['chrome114'],
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
};

async function copyAssets() {
  await cp(resolve(root, 'manifest.json'), resolve(outdir, 'manifest.json'));
  await cp(resolve(root, 'public/popup.html'), resolve(outdir, 'popup.html'));
  await cp(resolve(root, 'public/popup.css'), resolve(outdir, 'popup.css'));
  const icons = resolve(root, 'public/icons');
  if (existsSync(icons)) {
    await cp(icons, resolve(outdir, 'icons'), { recursive: true });
  } else {
    console.warn('[build] public/icons not found — run scripts/make-icons first.');
  }
}

async function main() {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.rebuild();
    await copyAssets();
    await ctx.watch();
    console.log('[build] watching for changes…');
  } else {
    await build(buildOptions);
    await copyAssets();
    console.log('[build] done ->', outdir);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
