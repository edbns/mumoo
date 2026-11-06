import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';

test('switching Messages ↔ Dating/Ride keeps a non-black canvas preview', {
  timeout: 180000,
  skip: process.env.MUMOO_HEADLESS !== '1' && process.env.MUMOO_HEADED !== '1',
}, async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ headless: process.env.MUMOO_HEADLESS === '1' });
  try {
    const page = await browser.newPage();
    await page.route('**/api/brain-tester-access', route => route.fulfill({ json: { token: 'test-token' } }));
    await page.route('**/.netlify/functions/analyze-music', async route => {
      const hash = createHash('sha256').update(route.request().postDataBuffer()).digest('hex');
      await route.fulfill({ json: { version: 1, method: 'beat_this_librosa', clip: { durationMs: 15000, offsetMs: 0, sha256: hash }, rhythm: { beatsMs: [1000, 2000], downbeatsMs: [], tempo: { status: 'estimated', gridBpm: 120, alternativesBpm: [] } }, features: { transientsMs: [1000], frames: [{ timeMs: 0, rms: 0.2, centroidHz: 1000, onsetStrength: 0.1 }] }, provenance: {}, metrics: {} } });
    });
    await page.route('**/.netlify/functions/align-lyrics', async route => {
      await route.fulfill({ json: { version: 1, method: 'whisperx_supplied_lyrics', words: [
        { text: 'Make', status: 'aligned', startMs: 1000, endMs: 1200 },
        { text: 'it', status: 'aligned', startMs: 1200, endMs: 1400 },
        { text: 'move!', status: 'aligned', startMs: 1400, endMs: 1800 },
        { text: 'Again.', status: 'aligned', startMs: 2500, endMs: 2800 },
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
    await page.getByText('Staging access enabled.').waitFor({ timeout: 15000 });
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
    await page.getByLabel('Daily Screens preview').waitFor();

    async function sample(label) {
      await page.getByLabel('Seek preview').fill('1400');
      await page.waitForTimeout(80);
      const stats = await page.getByLabel('Daily Screens preview').evaluate(canvas => {
        const ctx = canvas.getContext('2d');
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let black = 0, bright = 0, total = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 8 || (r < 12 && g < 12 && b < 12)) black++;
          if (r + g + b > 80) bright++;
        }
        return { w: canvas.width, h: canvas.height, blackRatio: black / total, brightRatio: bright / total };
      });
      return { ...stats, label };
    }

    const sequence = ['Messages', 'Dating match', 'Messages', 'Dating match', 'WhatsApp', 'Ride', 'Food delivery', 'Dating match', 'Messages'];
    const results = [];
    for (const name of sequence) {
      await page.getByRole('button', { name, exact: true }).click();
      results.push(await sample(name));
    }
    for (const result of results) {
      assert.equal(result.w, 1080, `${result.label} width`);
      assert.equal(result.h, 1920, `${result.label} height`);
      assert.ok(result.blackRatio < 0.92, `${result.label} too black: ${JSON.stringify(result)}`);
      assert.ok(result.brightRatio > 0.02, `${result.label} not bright enough: ${JSON.stringify(result)}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
});
