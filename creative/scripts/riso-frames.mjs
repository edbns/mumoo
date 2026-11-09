/**
 * Riso look test: draws still frames of the Riso template with real lyrics and beats from the reference songs.
 *
 *   node scripts/riso-frames.mjs
 *
 * Writes full-size 1080×1920 stills and one contact sheet to scripts/fixtures/riso/ (git-ignored) and copies them
 * to /tmp/riso/ for review. Needs the headless Chromium that Playwright installed (see below). Nothing is
 * deployed or sent anywhere: a throwaway local dev server serves the page and is closed at the end.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const analysis = clip => JSON.parse(readFileSync(`${root}scripts/fixtures/analysis/${clip}.json`, 'utf8'));
const lyrics = clip => JSON.parse(readFileSync(`${root}scripts/fixtures/analysis/${clip}-lyrics.json`, 'utf8')).heard.words.map(({ text, startMs, endMs }) => ({ text, startMs, endMs }));

const PLATE = 'burnnet-woman-1547507-1920';
/** How long after a beat the still is taken: the layers have just been thrown and are still settling. */
const AFTER_BEAT_MS = 70;

const out = `${root}scripts/fixtures/riso/`;
const review = '/tmp/riso/';
mkdirSync(out, { recursive: true });
mkdirSync(review, { recursive: true });

const server = await createServer({ root, server: { port: 5197, strictPort: false }, logLevel: 'error' });
await server.listen();
const { RISO_INK_SETS } = await server.ssrLoadModule('/src/riso-look.ts');
const browser = await chromium.launch({
  executablePath: `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-x64/chrome-headless-shell`,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', error => console.log('PAGE ERROR', error.message));
  page.on('console', message => message.type() === 'error' && console.log('CONSOLE', message.text().slice(0, 300)));
  await page.goto(`${server.resolvedUrls.local[0]}riso-lab.html`);
  await page.waitForFunction('window.risoLab');

  /** Three looks: an ink set, a song, a face of type and a seed each. */
  const looks = [
    { name: 'pink-blue', inks: RISO_INK_SETS[0].inks, clip: 'reggaeton', font: 'Anton', seed: 11 },
    { name: 'orange-teal', inks: RISO_INK_SETS[1].inks, clip: 'slaphouse', font: 'Archivo Black', seed: 23 },
    { name: 'violet-coral', inks: RISO_INK_SETS[2].inks, clip: 'reggaeton', font: 'Bowlby One', seed: 5 },
  ];

  const stills = [];
  const draw = async (name, look, ms, plateId) => {
    const { beatsMs, downbeatsMs } = analysis(look.clip).rhythm;
    const url = await page.evaluate(request => window.risoLab.still(request), {
      seed: look.seed, inks: look.inks, font: look.font, ms, cues: lyrics(look.clip), beatsMs, downbeatsMs, plateId,
    });
    for (const dir of [out, review]) writeFileSync(`${dir}${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`wrote ${name}.png (${look.clip} at ${ms} ms)`);
    return url;
  };

  const moments = look => {
    const { beatsMs, downbeatsMs } = analysis(look.clip).rhythm;
    const down = downbeatsMs[2];
    const quiet = beatsMs.find(beat => beat > down + 300 && !downbeatsMs.some(d => Math.abs(d - beat) < 45));
    return { quiet: quiet + AFTER_BEAT_MS, downbeat: down + AFTER_BEAT_MS };
  };

  // The contact sheet reads left to right by look, quiet beat on top and downbeat below.
  const quiets = [];
  const downs = [];
  for (const look of looks) {
    const { quiet, downbeat } = moments(look);
    quiets.push(await draw(`${look.name}-quiet`, look, quiet, PLATE));
    downs.push(await draw(`${look.name}-downbeat`, look, downbeat, PLATE));
  }
  stills.push(...quiets, ...downs);
  await draw('lyrics-only', looks[0], moments(looks[0]).downbeat, undefined);

  const sheet = await page.evaluate(([urls, columns, width, gap]) => window.risoLab.contactSheet(urls, columns, width, gap), [stills, 3, 360, 12]);
  writeFileSync(`${review}contact.png`, Buffer.from(sheet.split(',')[1], 'base64'));
  copyFileSync(`${review}contact.png`, `${out}contact.png`);
  console.log('wrote contact.png');
} finally {
  await browser.close();
  await server.close();
}
