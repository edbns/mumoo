/**
 * Photo Lab — bake the Shaders Pro "image-effects" presets onto OUR photograph, OFFLINE.
 * (Presets come from the owner's Shaders Pro licence; see src/look-lab/photo-effects/recipes.ts.)
 * The shipped app never runs WebGPU/Shaders. It loads the JPEGs this writes.
 *
 *   npm run bake:photo-effects                     # every look
 *   npm run bake:photo-effects -- tinted-lenses-2  # one preset (all its variants)
 *   npm run bake:photo-effects -- impression-trail-1-soft   # one variant
 *   npm run bake:photo-effects -- --finalize       # only (re)build effects.json + _contact.jpg from what is on disk
 *
 * Needs a WebGPU-capable Chromium (real Chrome/Brave, a window opens). Override with LOOK_LAB_BROWSER.
 *
 * Writes: punch-plates/effects/{slug}[-{variant}].jpg, effects.json, _contact.jpg
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'punch-plates', 'effects');
const PHOTO = join(root, 'punch-plates', 'out', 'burnnet-woman-1547507-1920.jpg');
const PORT = 5198;
const VIEW = { width: 360, height: 640 }; // CSS px; deviceScaleFactor 3 gives the 1080x1920 canvas.
const SIZE = 48;

const BROWSERS = [
  process.env.LOOK_LAB_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
].filter(Boolean);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const planId = plan => (plan.suffix ? `${plan.slug}-${plan.suffix}` : plan.slug);

function pickBrowser() {
  const found = BROWSERS.find(path => existsSync(path));
  if (!found) throw new Error('No WebGPU-capable Chrome/Brave found. Set LOOK_LAB_BROWSER.');
  return found;
}

function pixels(file) {
  const run = spawnSync(ffmpeg.path, ['-v', 'error', '-i', file, '-vf', `scale=${SIZE}:${SIZE}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 24 });
  if (run.status !== 0) throw new Error(`ffmpeg failed on ${file}: ${run.stderr}`);
  return new Uint8ClampedArray(run.stdout);
}

/** 0..1: how different a bake is from the plain photo (mean absolute channel difference). */
function differenceFromPhoto(file, photoPixels) {
  const a = pixels(file);
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) sum += (Math.abs(a[i] - photoPixels[i]) + Math.abs(a[i + 1] - photoPixels[i + 1]) + Math.abs(a[i + 2] - photoPixels[i + 2])) / 3;
  return sum / (a.length / 4) / 255;
}

async function sweep(page, path, holdMs) {
  if (!path.length) {
    await sleep(holdMs);
    return;
  }
  const at = ([x, y]) => [Math.round(x * (VIEW.width - 1)), Math.round(y * (VIEW.height - 1))];
  const [sx, sy] = at(path[0]);
  await page.mouse.move(sx, sy);
  for (const point of path.slice(1)) {
    const [x, y] = at(point);
    await page.mouse.move(x, y, { steps: 28 });
    await sleep(120);
  }
  // Keep the pointer circling gently while the effect settles, so trail/ripple effects are still "alive" at capture.
  const [cx, cy] = at(path[path.length - 1]);
  const until = Date.now() + holdMs;
  for (let a = 0; Date.now() < until; a += 0.5) {
    await page.mouse.move(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28);
    await sleep(40);
  }
}

async function openLab(server) {
  const executablePath = pickBrowser();
  console.log('photo-lab browser:', executablePath);
  const browser = await chromium.launch({
    executablePath,
    headless: false,
    args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--window-size=420,780'],
  });
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 3 });
  page.on('pageerror', error => console.error('photo-lab page error:', error.message));
  await page.goto(`http://127.0.0.1:${PORT}/photo-lab.html`, { waitUntil: 'load' });
  // Vite may re-optimize deps once and reload; wait for a stable ready flag.
  for (let i = 0; i < 60; i++) {
    try {
      if (await page.evaluate(() => window.__photoLabReady === true)) break;
    } catch { /* navigation in flight */ }
    await sleep(500);
  }
  return { browser, page, server };
}

async function bake(page, plans, wanted) {
  const todo = plans.filter(plan => !plan.skip && (!wanted.length || wanted.includes(planId(plan)) || wanted.includes(plan.slug)));
  if (!todo.length) throw new Error(`Nothing to bake for: ${wanted.join(', ')}`);
  const failures = [];
  for (const plan of todo) {
    const id = planId(plan);
    const started = Date.now();
    try {
      await page.evaluate(([slug, suffix]) => window.photoLab.start(slug, suffix), [plan.slug, plan.suffix]);
      await sleep(400);
      await sweep(page, plan.path, plan.settleMs);
      const dataUrl = await page.evaluate(() => window.photoLab.capture());
      const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
      writeFileSync(join(outDir, `${id}.jpg`), bytes);
      console.log(`baked ${id}.jpg (${Math.round(bytes.length / 1024)} KB, ${((Date.now() - started) / 1000).toFixed(1)} s)`);
    } catch (error) {
      failures.push(id);
      console.error(`FAILED ${id}: ${error.message}`);
      await page.evaluate(() => window.photoLab.stop()).catch(() => undefined);
    }
  }
  return failures;
}

async function finalize(server, page, plans) {
  const { describePixels } = await server.ssrLoadModule('/src/cover-palette.ts');
  const photoPixels = pixels(PHOTO);
  const effects = [];
  const flags = [];
  for (const plan of plans) {
    const id = planId(plan);
    const file = join(outDir, `${id}.jpg`);
    if (plan.skip) {
      if (existsSync(file)) rmSync(file);
      continue;
    }
    if (!existsSync(file)) continue;
    const read = describePixels(pixels(file));
    if (!read) { flags.push(`${id}: unreadable`); continue; }
    const diff = differenceFromPhoto(file, photoPixels);
    if (read.lightness < 0.06) flags.push(`${id}: nearly black (${read.lightness})`);
    if (diff < 0.03) flags.push(`${id}: looks like the plain photo (diff ${diff.toFixed(3)})`);
    // "Impression Trail 3" when the collection has several presets, plain collection name otherwise.
    const several = plans.some(other => other.collection === plan.collection && other.slug !== plan.slug);
    const number = plan.slug.match(/-(\d+)$/)?.[1];
    const base = several && number ? `${plan.collection} ${number}` : plan.collection;
    const title = plan.label ? `${base} — ${plan.label}` : base;
    effects.push({
      id,
      title,
      collection: plan.collection,
      presetId: plan.presetId,
      file: `${id}.jpg`,
      palette: read.palette.slice(0, 3),
      mood: plan.mood || (read.lightness < 0.35 ? 'moody' : read.warmth > 0.6 ? 'warm' : 'cool'),
      lightness: read.lightness,
      saturation: read.saturation,
      warmth: read.warmth,
      diffFromPhoto: Number(diff.toFixed(3)),
    });
  }
  writeFileSync(join(outDir, 'effects.json'), `${JSON.stringify(effects, null, 2)}\n`);
  // Remove baked files that are no longer part of the plan (renamed/dropped looks).
  const keep = new Set(effects.map(item => item.file));
  for (const name of readdirSync(outDir)) if (name.endsWith('.jpg') && !name.startsWith('_') && !keep.has(name)) rmSync(join(outDir, name));

  const items = effects.map(item => ({
    src: `data:image/jpeg;base64,${readFileSync(join(outDir, item.file)).toString('base64')}`,
    label: `${item.id}\n${item.collection} · ${item.palette.map(c => c.hex).join(' ')}`,
  }));
  const sheet = await page.evaluate(list => window.photoLab.contactSheet(list, 6), items);
  writeFileSync(join(outDir, '_contact.jpg'), Buffer.from(sheet.split(',')[1], 'base64'));
  // Smaller pages (8 looks each) are easier to review at full detail.
  for (const name of readdirSync(outDir)) if (/^_contact-\d+\.jpg$/.test(name)) rmSync(join(outDir, name));
  for (let page_ = 0; page_ * 8 < items.length; page_++) {
    const part = await page.evaluate(list => window.photoLab.contactSheet(list, 4), items.slice(page_ * 8, page_ * 8 + 8));
    writeFileSync(join(outDir, `_contact-${page_ + 1}.jpg`), Buffer.from(part.split(',')[1], 'base64'));
  }
  console.log(`effects.json: ${effects.length} looks. Contact sheet: punch-plates/effects/_contact.jpg`);
  for (const flag of flags) console.log('FLAG', flag);
}

async function main() {
  const args = process.argv.slice(2);
  const finalizeOnly = args.includes('--finalize');
  const wanted = args.filter(arg => !arg.startsWith('-'));
  mkdirSync(outDir, { recursive: true });

  const server = await createServer({
    root,
    logLevel: 'error',
    server: { port: PORT, strictPort: true, host: '127.0.0.1' },
    optimizeDeps: { entries: ['photo-lab.html'], include: ['shaders/js'] },
  });
  await server.listen();
  const lab = await openLab(server);
  try {
    const plans = await lab.page.evaluate(() => window.photoLab.plans());
    if (args.includes('--list')) {
      for (const plan of plans) console.log(planId(plan), plan.skip ? `(skip: ${plan.skip})` : '');
      return;
    }
    let failures = [];
    if (!finalizeOnly) failures = await bake(lab.page, plans, wanted);
    await finalize(server, lab.page, plans);
    if (failures.length) {
      console.error(`These looks failed to bake: ${failures.join(', ')}`);
      process.exitCode = 1;
    }
  } finally {
    await lab.browser.close();
    await server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
