/**
 * Bake cleared masters into 1080×1920 Lyric Punch delivery proxies.
 *
 * Usage:
 *   node scripts/bake-punch-plates.mjs
 *
 * Reads:  punch-plates/masters/*.jpg|png|webp (+ optional *.json sidecar)
 *         punch-plates/cutouts/{id}.png  the subject's cut-out mask (Dust needs one; see scripts/prepare-sample.mjs)
 * Writes: punch-plates/out/{id}.jpg, {id}-thumb.jpg, {id}.cut.png, plates.json
 *         public/punch-plates/  (Vite/Netlify static copy — not committed), with punch-plates/looks → looks/ and
 *         punch-plates/effects/{id}.jpg → effects/ (Our photography's baked looks)
 *
 * Masters stay local. Only small proxies are served.
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync,
  rmSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mastersDir = join(root, 'punch-plates', 'masters');
const outDir = join(root, 'punch-plates', 'out');
const cutoutsDir = join(root, 'punch-plates', 'cutouts');
const publicDir = join(root, 'public', 'punch-plates');
const WIDTH = 1080;
const HEIGHT = 1920;
const THUMB_W = 180;
const THUMB_H = 320;

const PLACEHOLDERS = [
  { id: 'ember-dusk', color: '0x1a0a0f', accent: '0x8b2942', mood: ['dark', 'cinematic'], license: 'placeholder-internal' },
  { id: 'steel-horizon', color: '0x0b1420', accent: '0x2a4a6b', mood: ['cinematic', 'cool'], license: 'placeholder-internal' },
  { id: 'neon-rain', color: '0x0a0614', accent: '0x5b2a8f', mood: ['dark', 'saturated'], license: 'placeholder-internal' },
  { id: 'sand-flare', color: '0x1c1408', accent: '0x8a5a20', mood: ['warm', 'restrained'], license: 'placeholder-internal' },
];

function ffmpeg(args) {
  const result = spawnSync(ffmpegPath.path, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `ffmpeg failed: ${args.join(' ')}`);
  }
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'plate';
}

function readSidecar(masterPath) {
  const side = masterPath.replace(/\.[^.]+$/, '.json');
  if (!existsSync(side)) return {};
  try {
    return JSON.parse(readFileSync(side, 'utf8'));
  } catch {
    return {};
  }
}

function bakeStill(input, id, outBase) {
  const full = join(outBase, `${id}.jpg`);
  const thumb = join(outBase, `${id}-thumb.jpg`);
  // Cover-crop to 9:16, then scale. q:v 3 ≈ high-quality JPEG under ~400KB for photos.
  ffmpeg([
    '-i', input,
    '-vf', `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT}`,
    '-frames:v', '1',
    '-q:v', '3',
    full,
  ]);
  ffmpeg([
    '-i', full,
    '-vf', `scale=${THUMB_W}:${THUMB_H}`,
    '-frames:v', '1',
    '-q:v', '5',
    thumb,
  ]);
  return { file: `${id}.jpg`, thumb: `${id}-thumb.jpg` };
}

function bakePlaceholder(item, outBase) {
  const full = join(outBase, `${item.id}.jpg`);
  const thumb = join(outBase, `${item.id}-thumb.jpg`);
  // Soft vertical gradient via lavfi — stands in until cleared masters are added.
  ffmpeg([
    '-f', 'lavfi',
    '-i', `color=c=${item.color}:s=${WIDTH}x${HEIGHT}:d=1`,
    '-f', 'lavfi',
    '-i', `color=c=${item.accent}:s=${WIDTH}x${HEIGHT}:d=1`,
    '-filter_complex',
    `[0][1]blend=all_expr='A*(1-Y/${HEIGHT})+B*(Y/${HEIGHT})'`,
    '-frames:v', '1',
    '-q:v', '4',
    full,
  ]);
  ffmpeg([
    '-i', full,
    '-vf', `scale=${THUMB_W}:${THUMB_H}`,
    '-frames:v', '1',
    '-q:v', '6',
    thumb,
  ]);
  return { file: `${item.id}.jpg`, thumb: `${item.id}-thumb.jpg` };
}

function ensureDirs() {
  mkdirSync(mastersDir, { recursive: true });
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  rmSync(publicDir, { recursive: true, force: true });
  mkdirSync(publicDir, { recursive: true });
}

function publish(outBase) {
  for (const name of readdirSync(outBase)) {
    copyFileSync(join(outBase, name), join(publicDir, name));
  }
  // Baked Shaders looks live beside the masters and are republished every build: the Look Lab's backgrounds, and the
  // Photo Lab's effects on our photo (files starting with `_` are contact sheets for people, not for the site).
  publishJpegs('looks', name => /\.jpe?g$/i.test(name));
  publishJpegs('effects', name => /^[^_].*\.jpe?g$/i.test(name));
}

/** Copies the JPEGs of `punch-plates/{folder}` that `wanted` accepts to `public/punch-plates/{folder}`. */
function publishJpegs(folder, wanted) {
  const from = join(root, 'punch-plates', folder);
  if (!existsSync(from)) return;
  const to = join(publicDir, folder);
  mkdirSync(to, { recursive: true });
  const names = readdirSync(from).filter(wanted);
  for (const name of names) copyFileSync(join(from, name), join(to, name));
  console.log(`published ${names.length} ${folder} →`, to);
}

function main() {
  ensureDirs();
  const today = new Date().toISOString().slice(0, 10);
  /** @type {object[]} */
  const plates = [];
  const used = new Set();

  const masters = existsSync(mastersDir)
    ? readdirSync(mastersDir).filter(name => /\.(jpe?g|png|webp)$/i.test(name))
    : [];

  for (const name of masters) {
    const input = join(mastersDir, name);
    const side = readSidecar(input);
    let id = typeof side.id === 'string' ? slugify(side.id) : slugify(basename(name, extname(name)));
    if (used.has(id)) id = `${id}-${used.size}`;
    used.add(id);
    const baked = bakeStill(input, id, outDir);
    // A photo with a cut-out can also be turned into Dust.
    const cutout = existsSync(join(cutoutsDir, `${id}.png`));
    if (cutout) copyFileSync(join(cutoutsDir, `${id}.png`), join(outDir, `${id}.cut.png`));
    plates.push({
      id,
      type: 'still',
      file: baked.file,
      thumb: baked.thumb,
      ...(cutout ? { cutout: `${id}.cut.png` } : {}),
      mood: Array.isArray(side.mood) ? side.mood.map(String).slice(0, 8) : [],
      license: typeof side.license === 'string' ? side.license : 'cleared-internal',
      sourceUrl: typeof side.sourceUrl === 'string' ? side.sourceUrl : '',
      clearedBy: typeof side.clearedBy === 'string' ? side.clearedBy : 'mumoo',
      clearedAt: typeof side.clearedAt === 'string' ? side.clearedAt : today,
    });
    console.log('baked', id, 'from', name);
  }

  if (!plates.length) {
    for (const item of PLACEHOLDERS) {
      used.add(item.id);
      const baked = bakePlaceholder(item, outDir);
      plates.push({
        id: item.id,
        type: 'still',
        file: baked.file,
        thumb: baked.thumb,
        mood: item.mood,
        license: item.license,
        sourceUrl: '',
        clearedBy: 'mumoo',
        clearedAt: today,
      });
      console.log('placeholder', item.id);
    }
  }

  const manifest = {
    version: 1,
    width: WIDTH,
    height: HEIGHT,
    plates,
  };
  writeFileSync(join(outDir, 'plates.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  publish(outDir);
  console.log(`wrote ${plates.length} plate(s) → punch-plates/out + public/punch-plates`);
}

main();
