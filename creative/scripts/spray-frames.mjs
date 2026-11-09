/**
 * Spray look test: draws still frames of the Spray template with real lyrics and beats from the reference songs.
 *
 *   node scripts/spray-frames.mjs
 *
 * Writes full-size 1080×1920 stills, a contact sheet and a sequence strip to scripts/fixtures/spray/ (git-ignored)
 * and copies them to /tmp/spray/ for review. Needs the headless Chromium that Playwright installed (see below).
 * Nothing is deployed or sent anywhere: a throwaway local dev server serves the page and is closed at the end.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const analysis = clip => JSON.parse(readFileSync(`${root}scripts/fixtures/analysis/${clip}.json`, 'utf8'));
const lyrics = clip => JSON.parse(readFileSync(`${root}scripts/fixtures/analysis/${clip}-lyrics.json`, 'utf8')).heard.words.map(({ text, startMs, endMs }) => ({ text, startMs, endMs }));

/** How long after a plain beat the quiet still is taken, and after a downbeat the one with the drips (they run for 620 ms): the first moment in these windows that shows a word mostly on. */
const AFTER_BEAT_MS = [70, 250];
const AFTER_DOWNBEAT_MS = [400, 700];
const STEP_MS = 20;
/** The spray faces and the heavy capitals the template may be set in. */
const FACES = ['Rubik Spray Paint', 'Permanent Marker', 'Sedgwick Ave Display', 'Anton', 'Bowlby One', 'Bangers'];
/** The sequence: this many frames, this far apart, the first one this long after the word starts. */
const SEQUENCE_FRAMES = 6;
const SEQUENCE_STEP_MS = 60;
const SEQUENCE_FIRST_MS = 30;

const out = `${root}scripts/fixtures/spray/`;
const review = '/tmp/spray/';
mkdirSync(out, { recursive: true });
mkdirSync(review, { recursive: true });

const server = await createServer({ root, server: { port: 5198, strictPort: false }, logLevel: 'error' });
await server.listen();
const look = await server.ssrLoadModule('/src/spray-look.ts');
const { DURATION_MS } = await server.ssrLoadModule('/src/composition.ts');
const browser = await chromium.launch({
  executablePath: `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-x64/chrome-headless-shell`,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', error => console.log('PAGE ERROR', error.message));
  page.on('console', message => message.type() === 'error' && console.log('CONSOLE', message.text().slice(0, 300)));
  await page.goto(`${server.resolvedUrls.local[0]}spray-lab.html`);
  await page.waitForFunction('window.sprayLab');

  /** Three walls: a palette, a song, a face of type and a seed each. */
  const looks = [
    { name: 'neon-night', palette: look.SPRAY_PALETTES[0], clip: 'reggaeton', font: 'Anton', seed: 11 },
    { name: 'bold-offwhite', palette: look.SPRAY_PALETTES[3], clip: 'slaphouse', font: 'Archivo Black', seed: 23 },
    { name: 'neon-plum', palette: look.SPRAY_PALETTES[1], clip: 'reggaeton', font: 'Rubik Spray Paint', seed: 5 },
  ];

  const frame = async (look, ms) => {
    const began = Date.now();
    const { beatsMs, downbeatsMs } = analysis(look.clip).rhythm;
    const url = await page.evaluate(request => window.sprayLab.still(request), {
      seed: look.seed, palette: look.palette, font: look.font, ms, cues: lyrics(look.clip), beatsMs, downbeatsMs,
    });
    return { url, cost: await page.evaluate(() => window.sprayLab.cost()), totalMs: Date.now() - began };
  };
  const save = (name, url) => {
    for (const dir of [out, review]) writeFileSync(`${dir}${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  };
  const draw = async (name, look, ms) => {
    const { url, cost, totalMs } = await frame(look, ms);
    save(name, url);
    console.log(`wrote ${name}.png (${look.clip} at ${ms} ms, ${cost.instances} grains+drips; words built in ${Math.round(cost.buildMs)} ms, frame drawn in ${Math.round(cost.drawMs)} ms, whole still ${totalMs} ms)`);
    return url;
  };

  /**
   * A moment worth judging: the first of `times` when the wall holds a good number of words, and the newest one
   * started at least this long ago (it is mostly on) with no newer one yet.
   */
  const READABLE_AFTER_MS = 330;
  const FULL_WALL_WORDS = 6;
  const settled = (clip, times) => {
    const cues = lyrics(clip);
    const { downbeatsMs } = analysis(clip).rhythm;
    const breaks = look.pageBreaks(cues, downbeatsMs);
    return times.find(ms => {
      if (ms >= DURATION_MS) return false;
      const newest = cues.findLast(cue => cue.startMs <= ms);
      const next = cues.find(cue => cue.startMs > ms);
      return newest && ms - newest.startMs >= READABLE_AFTER_MS && (!next || next.startMs > ms) && look.pageAt(cues, breaks, ms).words.length >= FULL_WALL_WORDS;
    });
  };

  const moments = look => {
    const { beatsMs, downbeatsMs } = analysis(look.clip).rhythm;
    const plain = beatsMs.filter(beat => !downbeatsMs.some(d => Math.abs(d - beat) < 45));
    /** Every moment from `[from, to]` after each of `beats`, in time order. */
    const after = (beats, [from, to]) => beats.flatMap(beat => Array.from({ length: Math.floor((to - from) / STEP_MS) + 1 }, (_, n) => beat + from + n * STEP_MS));
    return {
      quiet: settled(look.clip, after(plain.filter(beat => beat > downbeatsMs[1]), AFTER_BEAT_MS)),
      downbeat: settled(look.clip, after(downbeatsMs.slice(1), AFTER_DOWNBEAT_MS)),
    };
  };

  // The contact sheet reads left to right by wall, quiet beat on top and downbeat below.
  const quiets = [];
  const downs = [];
  for (const wall of looks) {
    const { quiet, downbeat } = moments(wall);
    quiets.push(await draw(`${wall.name}-quiet`, wall, quiet));
    downs.push(await draw(`${wall.name}-downbeat`, wall, downbeat));
  }
  const contact = await page.evaluate(([urls, columns, width, gap]) => window.sprayLab.sheet(urls, columns, width, gap), [[...quiets, ...downs], 3, 360, 12]);
  save('contact', contact);
  console.log('wrote contact.png');

  // The wipe, caught while it sweeps over the wall.
  const wiped = looks[0];
  const { downbeatsMs } = analysis(wiped.clip).rhythm;
  const phraseEnd = lyrics(wiped.clip).find((cue, i, all) => all[i + 1] && all[i + 1].startMs - cue.endMs > look.PHRASE_GAP_MS).endMs;
  await draw('wipe', wiped, phraseEnd + look.PHRASE_HOLD_MS + look.WIPE_MS * 0.5);
  console.log(`(the bar wipe falls at ${downbeatsMs[look.PAGE_BARS]} ms)`);

  // One word being sprayed on: frames 60 ms apart, cropped to the band the word sits in.
  const sprayed = looks[0];
  const cues = lyrics(sprayed.clip);
  const index = 3;
  const place = look.placeWord(sprayed.seed, index, sprayed.palette.sprays.length);
  const centreY = look.wordCentre(place, look.wordWidth(place), 260)[1];
  const crop = { y: Math.round(Math.max(0, Math.min(1920 - 620, centreY - 310))), height: 620 };
  const frames = [];
  for (let n = 0; n < SEQUENCE_FRAMES; n++) frames.push((await frame(sprayed, cues[index].startMs + SEQUENCE_FIRST_MS + n * SEQUENCE_STEP_MS)).url);
  const strip = await page.evaluate(([urls, columns, width, gap, band]) => window.sprayLab.sheet(urls, columns, width, gap, band), [frames, 3, 540, 8, crop]);
  save('sequence', strip);
  console.log(`wrote sequence.png (${cues[index].text}, ${SEQUENCE_FRAMES} frames ${SEQUENCE_STEP_MS} ms apart)`);

  // The same moment in each of the six walls, and in each of the six faces of type.
  const same = looks[0];
  const { downbeat } = moments(same);
  const walls = [];
  for (const palette of look.SPRAY_PALETTES) walls.push((await frame({ ...same, palette }, downbeat)).url);
  save('palettes', await page.evaluate(([urls, columns, width, gap]) => window.sprayLab.sheet(urls, columns, width, gap), [walls, 3, 360, 12]));
  const faces = [];
  for (const font of FACES) faces.push((await frame({ ...looks[2], font }, downbeat)).url);
  save('fonts', await page.evaluate(([urls, columns, width, gap]) => window.sprayLab.sheet(urls, columns, width, gap), [faces, 3, 360, 12]));
  console.log(`wrote palettes.png and fonts.png (${FACES.join(', ')})`);
} finally {
  await browser.close();
  await server.close();
}
