/**
 * Window look test: draws still frames of the Window template with real lyrics and beats from the reference songs,
 * dealt the way a shelf deals them: a person in front of the word, a plain photo, one of the baked Shaders effect
 * stills, a baked Shaders background, a frame of a video; on every palette colour, in several heavy faces of type.
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
const CUTOUT = `/punch-plates/${PLATE}.cut.png`;
const effect = id => `/punch-plates/effects/${id}.jpg`;
const bank = id => `/punch-plates/looks/bank__${id}.jpg`;
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

  /** The palettes that read against a picture, as it shows in the letters. */
  const readable = async ({ photoUrl, cutoutUrl }) => look.legiblePalettes(await page.evaluate(([photo, cutout]) => window.windowLab.colours(photo, cutout), [photoUrl, cutoutUrl]));

  /**
   * One still: a picture, the colour on show, a song, a face of type. Colours that do not read against the picture are
   * not allowed. The card is caught on its starting colour (no downbeats are passed, so it has not flipped yet), so
   * any colour can be shown at any word; `flip-before` and `flip-after` show the flips.
   */
  const draw = async (name, { picture, colour, clip, font, ms, cues }) => {
    const { beatsMs, cues: heard } = song(clip);
    const allowed = await readable(picture);
    if (!allowed.includes(colour)) throw new Error(`${name}: ${colour} does not read against this picture; palettes that do: ${allowed.join(', ')}.`);
    const url = await page.evaluate(request => window.windowLab.still(request), { seed: 3, palette: colour, allowed, font, ms, cues: cues ?? heard, beatsMs, downbeatsMs: [], ...picture });
    save(name, url);
    const groups = look.wordGroups(cues ?? heard);
    const shown = groups[look.groupAt(groups, ms)]?.text;
    console.log(`wrote ${name}.png (${clip} at ${ms} ms: ${shown}, ${colour}, ${font})`);
    return url;
  };

  const woman = { photoUrl: PHOTO, cutoutUrl: CUTOUT };
  const plain = { photoUrl: PHOTO };
  const still = id => ({ photoUrl: effect(id) });
  /** A Shaders effect still of the woman with her cut-out in front: she stands in front of her own effect. */
  const womanIn = id => ({ photoUrl: effect(id), cutoutUrl: CUTOUT });
  const background = id => ({ photoUrl: bank(id) });
  const video = (file, atSeconds, name) => ({ photoUrl: frameOf(file, atSeconds, name) });

  /**
   * The cards of a shelf, four to a row, as the shelf would deal them: the mode, the picture, the colour and the
   * song moment each card is caught at, and the face of type: they go round the faces the window is set in. Between them they use every palette colour.
   */
  const cards = [
    // row 1
    { mode: 'person', picture: woman, colour: 'sun-yellow', clip: 'reggaeton', nth: 0 },
    { mode: 'plain', picture: plain, colour: 'violet', clip: 'slaphouse', nth: 1 },
    { mode: 'effect', picture: still('tinted-lenses-2'), colour: 'teal', clip: 'reggaeton', nth: 2 },
    { mode: 'bank', picture: background('neon-flow-5'), colour: 'lime', clip: 'slaphouse', nth: 3 },
    // row 2
    { mode: 'effect', picture: still('impression-trail-6'), colour: 'green', clip: 'slaphouse', nth: 4 },
    { mode: 'person', picture: woman, colour: 'cobalt', clip: 'slaphouse', nth: 5 },
    { mode: 'video', picture: video('direction-b.mp4', 3, 'city'), colour: 'orange', clip: 'reggaeton', nth: 6 },
    { mode: 'plain', picture: plain, colour: 'deep-green', clip: 'slaphouse', nth: 7 },
    // row 3
    { mode: 'plain', picture: plain, colour: 'magenta', clip: 'reggaeton', nth: 8 },
    { mode: 'effect', picture: still('tinted-lenses-7'), colour: 'hot-red', clip: 'slaphouse', nth: 9 },
    { mode: 'person', picture: woman, colour: 'black', clip: 'reggaeton', nth: 10 },
    { mode: 'video', picture: video('direction-a.mp4', 4, 'colours'), colour: 'acid-yellow', clip: 'slaphouse', nth: 11 },
    // row 4
    { mode: 'person', picture: womanIn('impression-trail-4'), colour: 'sand', clip: 'reggaeton', nth: 12 },
    { mode: 'plain', picture: plain, colour: 'off-white', clip: 'slaphouse', nth: 13 },
    { mode: 'effect', picture: still('impression-trail-9'), colour: 'hot-pink', clip: 'reggaeton', nth: 14 },
    { mode: 'bank', picture: background('royal-purple-5'), colour: 'cyan', clip: 'slaphouse', nth: 15 },
  ];
  const missing = look.WINDOW_PALETTE_IDS.filter(id => !cards.some(card => card.colour === id));
  if (missing.length) throw new Error(`The sheet shows no ${missing.join(', ')}.`);

  const unreadable = [];
  for (const { mode, picture, colour } of cards) {
    const allowed = await readable(picture);
    if (!allowed.includes(colour)) unreadable.push(`${mode} ${picture.photoUrl.split('/').pop()}: ${colour} does not read; these do: ${allowed.join(', ')}`);
  }
  if (unreadable.length) throw new Error(`\n${unreadable.join('\n')}`);

  const stills = [];
  for (const [index, { mode, picture, colour, clip, nth }] of cards.entries()) {
    stills.push(await draw(`card-${String(index + 1).padStart(2, '0')}-${mode}-${colour}`, { picture, colour, clip, font: look.WINDOW_FACES[index % look.WINDOW_FACES.length], ms: moment[clip][nth % moment[clip].length] }));
  }

  // Fitting: one very short word, and a long phrase that wraps.
  const held = text => [{ text, startMs: 0, endMs: 2500 }];
  const [firstDownbeat] = analysis('slaphouse').rhythm.downbeatsMs;
  await draw('short-word', { picture: woman, colour: 'sun-yellow', clip: 'slaphouse', font: 'Anton', ms: firstDownbeat + AFTER_BEAT_MS, cues: held('NO') });
  await draw('long-phrase', { picture: plain, colour: 'cobalt', clip: 'slaphouse', font: 'Anton', ms: firstDownbeat + AFTER_BEAT_MS, cues: held('never gonna let you go tonight') });

  // The screen flips colour on a downbeat: the moment before one, and the moment after.
  const flip = analysis('slaphouse').rhythm.downbeatsMs[2];
  const { beatsMs, downbeatsMs, cues } = song('slaphouse');
  const allowed = await readable(plain);
  for (const [name, ms] of [['flip-before', flip - 60], ['flip-after', flip + 60]]) {
    save(name, await page.evaluate(request => window.windowLab.still(request), { seed: 3, palette: allowed[0], allowed, font: 'Anton', ms, cues, beatsMs, downbeatsMs, photoUrl: PHOTO }));
    console.log(`wrote ${name}.png`);
  }

  const sheet = await page.evaluate(([urls, columns, width, gap]) => window.windowLab.contactSheet(urls, columns, width, gap), [stills, 4, 300, 12]);
  writeFileSync(`${review}contact2.png`, Buffer.from(sheet.split(',')[1], 'base64'));
  copyFileSync(`${review}contact2.png`, `${out}contact2.png`);
  console.log('wrote contact2.png');
} finally {
  await browser.close();
  await server.close();
}
