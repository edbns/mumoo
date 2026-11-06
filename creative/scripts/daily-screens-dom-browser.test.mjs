import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ffprobe from '@ffprobe-installer/ffprobe';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { copyFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.MUMOO_DOM_SAMPLE || join(HERE, '../tmp-daily-dom');

test('React Daily Screens dating, ride and food export synchronized MP4s', {
  timeout: 420000,
  skip: process.env.MUMOO_HEADLESS !== '1' && (process.env.MUMOO_HEADED !== '1' || process.platform !== 'darwin'),
}, async t => {
  mkdirSync(OUT, { recursive: true });
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch(process.env.MUMOO_HEADLESS === '1'
    ? { headless: true }
    : { headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try {
    const page = await browser.newPage();
    await page.route('**/api/brain-tester-access', route => route.fulfill({ json: { token: 'test-token' } }));
    await page.route('**/.netlify/functions/analyze-music', async route => {
      const hash = createHash('sha256').update(route.request().postDataBuffer()).digest('hex');
      await route.fulfill({ json: { version: 1, method: 'beat_this_librosa', clip: { durationMs: 15000, offsetMs: 0, sha256: hash }, rhythm: { beatsMs: [1000, 2000], downbeatsMs: [], tempo: { status: 'estimated', gridBpm: 120, alternativesBpm: [] } }, features: { transientsMs: [1000], frames: [{ timeMs: 0, rms: 0.2, centroidHz: 1000, onsetStrength: 0.1 }] }, provenance: {}, metrics: {} } });
    });
    await page.route('**/.netlify/functions/align-lyrics', async route => {
      await route.fulfill({ json: { version: 1, method: 'whisperx_supplied_lyrics', words: [
        { text: 'Make', status: 'aligned', startMs: 1000, endMs: 1200 }, { text: 'it', status: 'aligned', startMs: 1200, endMs: 1400 },
        { text: 'move!', status: 'aligned', startMs: 1400, endMs: 1800 }, { text: 'Again.', status: 'aligned', startMs: 2500, endMs: 2800 },
      ] } });
    });
    await page.route('**/api/brain-recommendations', async route => {
      await route.fulfill({ json: { recommendations: [], catalog: [{ id: 'daily-screens', renderer: { template: 'daily-screens' } }] } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    const rate = 48000, samples = rate * 18, wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
    for (const marker of [0.5, 3, 4, 16.5, 17.5]) for (let n = 0; n < 480; n++) wav.writeInt16LE(Math.round(28000 * Math.sin(n * Math.PI / 8)), 44 + (marker * rate + n) * 2);
    await page.getByLabel('Source WAV').setInputFiles({ name: 'fixture.wav', mimeType: 'audio/wav', buffer: wav });
    await page.getByLabel('Primary genre').fill('House');
    await page.getByLabel('Staging tester password').fill('test password');
    await page.getByRole('button', { name: 'Unlock staging' }).click();
    await page.getByRole('button', { name: 'Continue to clip' }).click();
    await page.getByLabel('Clip start (ms)').fill('2000');
    await page.getByRole('button', { name: 'Continue to video type' }).click();
    await page.getByLabel('Lyric Video').check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByText('Paste lyrics for this section').click();
    await page.getByLabel('Lyrics for this section').fill('Make it move! Again.');
    await page.getByRole('button', { name: 'Sync lyrics' }).click();
    await page.getByText('Synced 4 words.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Approve lyrics and choose visual' }).click();
    await page.getByRole('button', { name: 'Dating match', exact: true }).waitFor();

    const exports = {};
    for (const name of ['Dating match', 'Ride', 'Food delivery']) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.getByLabel('Daily Screens preview').waitFor();
      await page.getByLabel('Seek preview').fill('1400');
      const preview = await page.getByLabel('Daily Screens preview').screenshot();
      writeFileSync(join(OUT, `${name.toLowerCase().replace(/\s+/g, '-')}-preview.png`), preview);
      const started = performance.now();
      const pending = page.waitForEvent('download', { timeout: 180000 });
      await page.getByRole('button', { name: 'Download MP4' }).click();
      const path = await (await pending).path();
      const seconds = (performance.now() - started) / 1000;
      const id = name === 'Dating match' ? 'dating' : name === 'Ride' ? 'ride' : 'food';
      const dest = join(OUT, `mumoo-${id}.mp4`);
      copyFileSync(path, dest);
      const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', dest]));
      assert.deepEqual(
        [info.streams[0].codec_name, info.streams[0].width, info.streams[0].height, info.streams[0].nb_frames, info.streams[0].avg_frame_rate, info.streams[1].codec_name, info.format.duration],
        ['h264', 1080, 1920, '450', '30/1', 'aac', '15.000000'],
      );
      const framePng = execFileSync(ffmpeg.path, ['-y', '-v', 'error', '-i', dest, '-vf', "select='eq(n,42)'", '-vsync', '0', '-frames:v', '1', join(OUT, `mumoo-${id}-frame42.png`)]);
      void framePng;
      exports[id] = { seconds, dest };
      t.diagnostic(`${id} export ${seconds.toFixed(2)} s → ${dest}`);
    }
    assert.equal(Object.keys(exports).sort().join(','), 'dating,food,ride');
  } finally {
    await browser.close();
    await server.close();
  }
});
