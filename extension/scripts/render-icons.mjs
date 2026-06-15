// Renders logo.svg to PNG icons at multiple sizes. Run from repo root:
//   node extension/scripts/render-icons.mjs
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(here, '../public/icons');
const svg = readFileSync(resolve(iconsDir, 'logo.svg'));

const targets = [
  [16, 'icon16.png'],
  [48, 'icon48.png'],
  [128, 'icon128.png'],
  [256, 'icon256.png'],
  [512, 'logo-512.png'],
];

for (const [size, name] of targets) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  writeFileSync(resolve(iconsDir, name), r.render().asPng());
  console.log('wrote', name, size + 'px');
}
