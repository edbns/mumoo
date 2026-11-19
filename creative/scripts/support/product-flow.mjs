import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';

/**
 * One harness for every browser test of the product flow:
 *   upload song + style → clip + lyrics → creatives.
 * Network is mocked at the Netlify boundary (access, lyrics, music analysis); everything else is the real app.
 * Headed Brave on macOS only, like the rest of the browser suite (hardware-backed WebCodecs/WebGL).
 */
export const BROWSER = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
export const canRunBrowserTests = process.env.MUMOO_HEADED === '1' && process.platform === 'darwin';

/** A mono 16-bit WAV with a soft tone, long enough to choose a 15 s clip from. */
export function songWav(seconds = 20, rate = 44_100) {
  const samples = rate * seconds;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const beat = Math.exp(-((i / rate) % 0.5) * 8);
    wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * i / rate) * 9000 * beat), 44 + i * 2);
  }
  return wav;
}

/** Words evenly spread over the clip, one line each 5 words — what the lyrics worker returns, in shape. */
export function lyricsResult(text, { language = 'en', source = 'transcribed', step = 450 } = {}) {
  const words = text.split(/\s+/).filter(Boolean).map((word, index) => ({
    text: word, line: Math.floor(index / 5), startMs: 500 + index * step, endMs: 500 + index * step + step - 40, score: 0.9, status: 'aligned',
  }));
  return { version: 2, source, language, languageProbability: 0.97, languageAlternatives: [], words, metrics: {} };
}

/** Colourful test pictures (ffmpeg's test patterns), made once per run: the library the creatives draw from. */
let pictures;
function testPictures() {
  if (pictures) return pictures;
  const dir = mkdtempSync(join(tmpdir(), 'mumoo-library-'));
  try {
    pictures = ['testsrc2', 'smptehdbars', 'rgbtestsrc', 'testsrc'].map((source, index) => {
      const file = join(dir, `${index}.jpg`);
      const result = spawnSync(ffmpegPath.path, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `${source}=s=720x1280`, '-frames:v', '1', '-q:v', '3', file], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr}`);
      return readFileSync(file);
    });
    return pictures;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** What /api/library answers: a few approved photos, each with its cut-out, free for any genre, showing nothing in particular. */
export function testLibrary() {
  return testPictures().map((_, index) => ({
    id: `test-picture-${index}`, kind: 'photo', attitudes: [], tags: ['street'], genre: null, subGenre: null,
    url: `/test-media/${index}.jpg`, cutoutUrl: `/test-media/${index}.jpg`,
  }));
}

/**
 * Start the app and a browser with the Netlify boundary mocked.
 * `lyrics(meta)` receives {lines, language} and returns the worker result; every call is recorded.
 * `analysis` replaces the default music-analysis answer (e.g. a real worker result).
 * `meaning` is what the lyric-meaning worker says about the words (default: nothing in particular); each request body is recorded.
 * The library is `testLibrary()`, so every template has pictures to draw.
 */
export const NEUTRAL_READING = { version: 1, clarity: 'clear', attitude: 'neutral', sadness: 0, intensity: 3 };
export async function openProduct({ lyrics, analysisCalls = [], lyricsCalls = [], meaningCalls = [], analysis, meaning = NEUTRAL_READING } = {}) {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ headless: false, executablePath: BROWSER });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.route('**/api/brain-tester-access', route => route.fulfill({ json: { token: 'test-token' } }));
  await page.route('**/api/library', route => route.fulfill({ json: { items: testLibrary() } }));
  await page.route('**/test-media/*.jpg', route => route.fulfill({ contentType: 'image/jpeg', body: testPictures()[Number(/(\d+)\.jpg$/.exec(route.request().url())[1])] }));
  await page.route('**/.netlify/functions/analyze-music', route => {
    const hash = createHash('sha256').update(route.request().postDataBuffer()).digest('hex');
    analysisCalls.push(hash);
    if (analysis) return route.fulfill({ json: analysis });
    return route.fulfill({ json: {
      version: 1, method: 'beat_this_librosa', clip: { durationMs: 15000, offsetMs: 0, sha256: hash },
      rhythm: { beatsMs: [1200, 3600, 7200, 10800], downbeatsMs: [], tempo: { status: 'estimated', bpm: 100, gridBpm: 100, alternativesBpm: [] } },
      features: { transientsMs: [3600, 7200, 10800], frames: Array.from({ length: 30 }, (_, i) => ({ timeMs: i * 500, rms: 0.2, centroidHz: 1400, bandwidthHz: 700, rolloffHz: 3000, onsetStrength: 0.1 })) },
      provenance: {}, metrics: {},
    } });
  });
  let pending = null;
  await page.route('**/.netlify/functions/transcribe-lyrics', route => {
    const raw = route.request().postDataBuffer().toString('utf8');
    const meta = JSON.parse(/name="meta"\r\n\r\n([\s\S]*?)\r\n--/.exec(raw)[1]);
    lyricsCalls.push(meta);
    pending = { meta, polls: 0 };
    return route.fulfill({ status: 202, json: { id: 'fc-test0001' } });
  });
  await page.route('**/.netlify/functions/transcribe-lyrics-status*', route => {
    if (++pending.polls < 2) return route.fulfill({ status: 202, json: { status: 'running' } });
    const result = lyrics(pending.meta);
    return result instanceof Error
      ? route.fulfill({ status: 502, json: { error: result.message } })
      : route.fulfill({ json: result });
  });

  let reading = { polls: 0 };
  await page.route('**/.netlify/functions/read-lyric-meaning', route => {
    meaningCalls.push(route.request().postDataJSON());
    reading = { polls: 0 };
    return route.fulfill({ status: 202, json: { id: 'fc-meaning01' } });
  });
  await page.route('**/.netlify/functions/read-lyric-meaning-status*', route => ++reading.polls < 2
    ? route.fulfill({ status: 202, json: { status: 'running' } })
    : route.fulfill({ json: meaning }));

  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  return {
    page, errors, analysisCalls, lyricsCalls, meaningCalls,
    close: async () => { await browser.close(); await server.close(); },
  };
}

/** Step 1: the song, then what kind of music it is (typed into the one style box and picked from its list), then Continue. */
export async function uploadSong(page, { genre = 'Pop', seconds = 20, name = 'song.wav', file } = {}) {
  await page.locator('input[type=file]').first().setInputFiles(file ?? { name, mimeType: 'audio/wav', buffer: songWav(seconds) });
  const style = page.getByRole('combobox', { name: 'What kind of music is it?' });
  await style.fill(genre);
  await page.getByRole('option', { name: genre, exact: true }).click();
  await page.locator('main.desktop').getByRole('button', { name: /^(Continue|Get my free video)$/ }).click();
  await page.getByRole('heading', { name: 'Choose your 15 seconds' }).waitFor();
}

/** Step 2 to the shelf: find the lyrics, Continue, and wait until every card is painted (previews are drawn asynchronously). */
export async function reachShelf(page) {
  await page.getByRole('button', { name: 'Find the lyrics for me' }).click();
  await page.locator('.lyrics-editor').waitFor({ timeout: 30000 });
  await page.locator('.step-actions').getByRole('button', { name: 'Continue' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.creatives-pack-card').length > 0 && !document.querySelector('.creatives-pack-card.pending'), null, { timeout: 30000 });
  await page.waitForTimeout(4000);
}

/**
 * What the creator sees on each named template's card: how warm (mean of red minus blue, -255…255) and how colourful (mean of
 * the largest minus the smallest channel) its preview is. Keyed by template name, as in "Play Dust creative".
 */
export async function cardColours(page) {
  return page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.creatives-pack-card')].flatMap(card => {
    const name = /^Play (.+) creative$/.exec(card.querySelector('button[aria-label^="Play "]')?.getAttribute('aria-label') ?? '')?.[1];
    const canvas = card.querySelector('canvas');
    const context = canvas?.getContext('2d');
    if (!name || !context) return [];
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let warm = 0, spread = 0;
    for (let i = 0; i < data.length; i += 4) {
      warm += data[i] - data[i + 2];
      spread += Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
    }
    const pixels = data.length / 4;
    return [[name, { warm: Math.round(warm / pixels), spread: Math.round(spread / pixels) }]];
  })));
}

/** A real 20-second MP3 with a flat-colour cover embedded as an ID3 picture (made with the bundled ffmpeg). */
export function songMp3WithCover(color) {
  const dir = mkdtempSync(join(tmpdir(), 'mumoo-cover-'));
  try {
    const run = (...args) => {
      const result = spawnSync(ffmpegPath.path, ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr}`);
    };
    run('-f', 'lavfi', '-i', `color=c=${color}:s=300x300`, '-frames:v', '1', join(dir, 'cover.png'));
    run('-f', 'lavfi', '-i', 'sine=frequency=330:duration=20', '-i', join(dir, 'cover.png'), '-map', '0:a', '-map', '1:v',
      '-c:a', 'libmp3lame', '-c:v', 'copy', '-id3v2_version', '3', '-metadata:s:v', 'comment=Cover (front)', join(dir, 'song.mp3'));
    return { name: 'song.mp3', mimeType: 'audio/mpeg', buffer: readFileSync(join(dir, 'song.mp3')) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
