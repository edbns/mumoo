/**
 * Window look test: draws still frames of the Window template with real lyrics and beats from the reference songs.
 *
 *   node scripts/window-frames.mjs
 *
 * Writes full-size 1080×1920 stills and one contact sheet to scripts/fixtures/window/ (git-ignored) and copies them
 * to /tmp/window/ for review. Needs the headless Chromium that Playwright installed. That Chromium cannot decode
 * video, so the video stills use single frames cut out of the reference videos with the ffmpeg this project bundles.
 * Nothing is deployed or sent anywhere: a throwaway local dev server serves the page and is closed at the end.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const analysis = clip => JSON.parse(readFileSync(`${root}scripts/fixtures/analysis/${clip}.json`, 'utf8'));
const lyrics = clip => JSON.parse(readFileSync(`${root}scripts/fixtures/analysis/${clip}-lyrics.json`, 'utf8')).heard.words.map(({ text, startMs, endMs }) => ({ text, startMs, endMs }));
const ffmpeg = `${root}node_modules/@ffmpeg-installer/darwin-x64/ffmpeg`;

const PLATE = 'burnnet-woman-1547507-1920';
const PHOTO = `/punch-plates/${PLATE}.jpg`;
const CUTOUT = `/punch-plates/${PLATE}.cut.png`;
/** How long after a beat the still is taken: the window is still punched. A group of words must have been up this long too, so its pop has settled. */
const AFTER_BEAT_MS = 25;
const SETTLED_MS = 150;

const out = `${root}scripts/fixtures/window/`;
const review = '/tmp/window/';
const frames = `${out}frames/`;
mkdirSync(frames, { recursive: true });
mkdirSync(review, { recursive: true });

/** One frame of a reference video, as a picture file the page can load. */
function frameOf(video, atSeconds, name) {
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(atSeconds), '-i', `${root}scripts/fixtures/${video}`, '-frames:v', '1', '-q:v', '2', `${frames}${name}.jpg`]);
  return `/scripts/fixtures/window/frames/${name}.jpg`;
}

const server = await createServer({ root, server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const look = await server.ssrLoadModule('/src/window-look.ts');
const browser = await chromium.launch({
  executablePath: `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-x64/chrome-headless-shell`,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', error => console.log('PAGE ERROR', error.message));
  page.on('console', message => message.type() === 'error' && console.log('CONSOLE', message.text().slice(0, 300)));
  await page.goto(`${server.resolvedUrls.local[0]}window-lab.html`);
  await page.waitForFunction('window.windowLab');

  const screen = name => look.WINDOW_SCREENS.filter(s => s.name === name);
  const song = clip => ({ cues: lyrics(clip), ...analysis(clip).rhythm });

  /** A still: one colour of screen (so it never flips), a song, a face of type, a picture. */
  const draw = async (name, { picture, colour, clip, font, ms, cues }) => {
    const { beatsMs, downbeatsMs, cues: heard } = song(clip);
    const url = await page.evaluate(request => window.windowLab.still(request), {
      seed: 3, screens: screen(colour), font, ms, cues: cues ?? heard, beatsMs, downbeatsMs, ...picture,
    });
    for (const dir of [out, review]) writeFileSync(`${dir}${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`wrote ${name}.png (${clip} at ${ms} ms, ${colour}, ${font})`);
    return url;
  };

  /** Moments in a song worth judging: a plain beat and a downbeat with a group of words that has been up a moment. */
  const moments = clip => {
    const { cues, beatsMs, downbeatsMs } = song(clip);
    const groups = look.wordGroups(cues);
    const onAt = ms => {
      const at = look.groupAt(groups, ms);
      return at >= 0 && ms - groups[at].startMs >= SETTLED_MS && groups[at].endMs >= ms ? groups[at].text : null;
    };
    const isDown = beat => downbeatsMs.some(d => Math.abs(d - beat) < 45);
    const pick = (beats, nth) => {
      const found = beats.filter(beat => onAt(beat + AFTER_BEAT_MS) && beat > downbeatsMs[1]);
      return found[nth % found.length] + AFTER_BEAT_MS;
    };
    return {
      quiet: nth => pick(beatsMs.filter(beat => !isDown(beat)), nth),
      downbeat: nth => pick(downbeatsMs, nth),
    };
  };

  const woman = { photoUrl: PHOTO, cutoutUrl: CUTOUT };
  const reggaeton = moments('reggaeton');
  const slaphouse = moments('slaphouse');
  const stills = [];
  const record = async (name, spec) => stills.push(await draw(name, spec));

  // The person stands in front of the word, on three screens: a quiet beat on top, a downbeat below.
  const font = 'Anton';
  const people = [
    { name: 'red', colour: 'hot red', clip: 'reggaeton', at: reggaeton, nth: 0 },
    { name: 'cobalt', colour: 'cobalt', clip: 'slaphouse', at: slaphouse, nth: 1 },
    { name: 'yellow', colour: 'acid yellow', clip: 'reggaeton', at: reggaeton, nth: 3 },
  ];
  for (const { name, colour, clip, at, nth } of people) await record(`person-${name}-quiet`, { picture: woman, colour, clip, font, ms: at.quiet(nth) });
  for (const { name, colour, clip, at, nth } of people) await record(`person-${name}-downbeat`, { picture: woman, colour, clip, font, ms: at.downbeat(nth) });
  // The same photo with nobody in front.
  await record('plain-green', { picture: { photoUrl: PHOTO }, colour: 'deep green', clip: 'slaphouse', font, ms: slaphouse.downbeat(2) });
  // A video: a frame of it as the picture.
  await record('video-city-offwhite', { picture: { photoUrl: frameOf('direction-b.mp4', 3, 'city') }, colour: 'off-white', clip: 'reggaeton', font, ms: reggaeton.downbeat(1) });
  await record('video-colours-black', { picture: { photoUrl: frameOf('direction-a.mp4', 4, 'colours') }, colour: 'black', clip: 'slaphouse', font, ms: slaphouse.quiet(2) });
  // Fitting: one very short word, and a long phrase that wraps.
  const held = text => [{ text, startMs: 0, endMs: 2500 }];
  const downbeat = analysis('slaphouse').rhythm.downbeatsMs[0] + AFTER_BEAT_MS;
  await record('short-word', { picture: woman, colour: 'hot red', clip: 'slaphouse', font, ms: downbeat, cues: held('NO') });
  await record('long-phrase', { picture: { photoUrl: PHOTO }, colour: 'cobalt', clip: 'slaphouse', font, ms: downbeat, cues: held('never gonna let you go tonight') });

  // The screen flips colour on a downbeat: the moment before one, and the moment after, with every colour in play.
  const flip = slaphouse.downbeat(1) - AFTER_BEAT_MS;
  for (const [name, ms] of [['flip-before', flip - 60], ['flip-after', flip + 60]]) {
    const { beatsMs, downbeatsMs, cues } = song('slaphouse');
    const url = await page.evaluate(request => window.windowLab.still(request), { seed: 3, screens: look.WINDOW_SCREENS, font, ms, cues, beatsMs, downbeatsMs, photoUrl: PHOTO });
    for (const dir of [out, review]) writeFileSync(`${dir}${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`wrote ${name}.png`);
  }

  const sheet = await page.evaluate(([urls, columns, width, gap]) => window.windowLab.contactSheet(urls, columns, width, gap), [stills, 4, 300, 12]);
  writeFileSync(`${review}contact.png`, Buffer.from(sheet.split(',')[1], 'base64'));
  copyFileSync(`${review}contact.png`, `${out}contact.png`);
  console.log('wrote contact.png');
} finally {
  await browser.close();
  await server.close();
}
