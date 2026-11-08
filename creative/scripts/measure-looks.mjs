/**
 * Measures every baked bank background (colour palette, brightness, saturation, warmth) and writes it into
 * src/look-lab/bank.json as `read`, so the brain can match a song's cover to a background by number.
 * Run after `npm run bake:looks`:  node scripts/measure-looks.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const bankFile = join(root, 'src/look-lab/bank.json');
const SIZE = 48;

const server = await createServer({ root, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'error' });
try {
  const { describePixels } = await server.ssrLoadModule('/src/cover-palette.ts');
  const bank = JSON.parse(readFileSync(bankFile, 'utf8'));
  for (const look of bank) {
    const image = join(root, 'punch-plates/looks', `bank__${look.slug}.jpg`);
    if (!existsSync(image)) throw new Error(`Missing baked look: ${image}. Run npm run bake:looks first.`);
    const run = spawnSync(ffmpegPath.path, ['-v', 'error', '-i', image, '-vf', `scale=${SIZE}:${SIZE}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 24 });
    if (run.status !== 0) throw new Error(`ffmpeg failed on ${look.slug}: ${run.stderr}`);
    const read = describePixels(new Uint8ClampedArray(run.stdout));
    if (!read) throw new Error(`Could not read ${look.slug}`);
    look.read = read;
    console.log(look.slug.padEnd(24), `hue ${String(read.hue).padStart(4)}  light ${read.lightness.toFixed(2)}  sat ${read.saturation.toFixed(2)}  warm ${read.warmth.toFixed(2)}  ${read.palette.map(c => c.hex).join(' ')}`);
  }
  writeFileSync(bankFile, `${JSON.stringify(bank, null, 2)}\n`);
} finally {
  await server.close();
}
