/**
 * Window look test: draws still frames of the Window template with real lyrics and beats from the reference songs,
 * dealt the way a shelf deals them: a photo or a frame of a video through one horizontal line of lyrics, on a black or
 * off-white screen, in several heavy faces of type.
 *
 *   node scripts/window-frames.mjs
 *
 * Writes full-size 1080×1920 stills and one contact sheet (contact2.png) to scripts/fixtures/window/ (git-ignored)
 * and copies them to /tmp/window/ for review. Needs the headless Chromium that Playwright installed. That Chromium
 * cannot decode video, so the video stills use single frames cut out of the reference videos with the ffmpeg this
 * project bundles. Nothing is deployed or sent anywhere: a throwaway local dev server serves the page and is closed
 * at the end.
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
/** How long after a beat the still is taken: the window is still punched. A group of words must have been up this long too, so its pop has settled. */
const AFTER_BEAT_MS = 25;
const SETTLED_MS = 150;
/** The two reference songs that have heard lyrics. */
const CLIPS = ['reggaeton', 'slaphouse'];

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

  const song = clip => ({ cues: lyrics(clip), ...analysis(clip).rhythm });
  const save = (name, url) => {
    for (const dir of [out, review]) writeFileSync(`${dir}${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  };

  /** Moments in a song worth judging: just after a beat (a plain one or a downbeat), with a group of words that has been up a moment. */
  const moments = clip => {
    const { cues, beatsMs } = song(clip);
    const groups = look.wordGroups(cues);
    const onAt = ms => {
      const at = look.groupAt(groups, ms);
      return at >= 0 && ms - groups[at].startMs >= SETTLED_MS && groups[at].endMs >= ms;
    };
    const after = beats => beats.map(beat => beat + AFTER_BEAT_MS).filter(onAt);
    return after(beatsMs);
  };
  const moment = Object.fromEntries(CLIPS.map(clip => [clip, moments(clip)]));

  /** One still: a picture, the screen (black or off-white, which it holds), a song, a face of type. */
  const draw = async (name, { picture, colour, clip, font, ms, cues }) => {
    const { beatsMs, cues: heard } = song(clip);
    const url = await page.evaluate(request => window.windowLab.still(request), { seed: 3, palette: colour, allowed: [colour], font, ms, cues: cues ?? heard, beatsMs, downbeatsMs: [], ...picture });
    save(name, url);
    const groups = look.wordGroups(cues ?? heard);
    const shown = groups[look.groupAt(groups, ms)]?.text;
    console.log(`wrote ${name}.png (${clip} at ${ms} ms: ${shown}, ${colour}, ${font})`);
    return url;
  };

  const plain = { photoUrl: PHOTO };
  const video = (file, atSeconds, name) => ({ photoUrl: frameOf(file, atSeconds, name) });
  const pictures = [plain, video('direction-b.mp4', 3, 'city'), video('direction-a.mp4', 4, 'colours'), plain];

  // Eight cards, as a shelf deals them: the screens take turns, the faces go round.
  const stills = [];
  for (let index = 0; index < 8; index++) {
    const clip = CLIPS[index % CLIPS.length];
    const colour = index % 2 ? 'off-white' : 'black';
    stills.push(await draw(`card-${String(index + 1).padStart(2, '0')}-${colour}`, { picture: pictures[index % pictures.length], colour, clip, font: look.WINDOW_FACES[index % look.WINDOW_FACES.length], ms: moment[clip][index % moment[clip].length] }));
  }

  // Fitting on one line: one very short word, and a pair of short words.
  const held = text => [{ text, startMs: 0, endMs: 2500 }];
  const [firstDownbeat] = analysis('slaphouse').rhythm.downbeatsMs;
  stills.push(await draw('short-word', { picture: plain, colour: 'black', clip: 'slaphouse', font: 'Anton', ms: firstDownbeat + AFTER_BEAT_MS, cues: held('NO') }));
  stills.push(await draw('long-pair', { picture: plain, colour: 'off-white', clip: 'slaphouse', font: 'Anton', ms: firstDownbeat + AFTER_BEAT_MS, cues: held('my love') }));

  const sheet = await page.evaluate(([urls, columns, width, gap]) => window.windowLab.contactSheet(urls, columns, width, gap), [stills, 4, 300, 12]);
  writeFileSync(`${review}contact2.png`, Buffer.from(sheet.split(',')[1], 'base64'));
  copyFileSync(`${review}contact2.png`, `${out}contact2.png`);
  console.log('wrote contact2.png');
} finally {
  await browser.close();
  await server.close();
}
