import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import ffprobe from '@ffprobe-installer/ffprobe';

test('staging workflow previews and exports Pixi visual without lyric requests', { timeout: 120000, skip: process.env.MUMOO_HEADED !== '1' || process.platform !== 'darwin' }, async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  const port = server.httpServer.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => console.error('BROWSER ERROR:', error.message));
    const calls = [];
    page.on('request', request => { if (/align-lyrics|analyze-music/.test(request.url())) calls.push(request.url()); });
    await page.goto(origin);
    const rate = 48000, samples = rate * 16;
    const wav = Buffer.alloc(44 + samples * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
    for (let n = 0; n < 480; n++) wav.writeInt16LE(Math.round(28000 * Math.sin(n * Math.PI / 8)), 44 + (rate * 3 + n) * 2);
    await page.getByLabel('Source WAV').setInputFiles({ name: 'fixture.wav', mimeType: 'audio/wav', buffer: wav });
    await page.getByLabel('Primary genre').fill('House');
    await page.getByRole('button', { name: 'Continue to clip' }).click();
    await page.getByRole('button', { name: 'Continue to video type' }).click();
    await page.getByLabel('Visual', { exact: true }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Continue without lyrics' }).click();
    await page.getByLabel('Pixi visual preview').waitFor();
    await page.getByText('Hardware-accelerated preview').waitFor({ timeout: 30000 });
    for (const label of ['Window', 'Close', 'Wide', 'Motion preset', 'Try Pixi visual proof']) assert.equal(await page.getByText(label, { exact: true }).count(), 0);
    if (process.env.MUMOO_FOOTAGE_FIXTURE) {
      await page.getByLabel('Add your video').setInputFiles(process.env.MUMOO_FOOTAGE_FIXTURE);
      await page.getByText('Hardware-accelerated preview').waitFor({ timeout: 30000 });
    }
    const pending = page.waitForEvent('download', { timeout: 120000 });
    await page.getByRole('button', { name: 'Export MP4' }).click();
    const file = await (await pending).path();
    const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
    assert.deepEqual([info.streams[0].codec_name, info.streams[0].width, info.streams[0].height, info.streams[0].nb_frames, info.streams[1].codec_name, info.format.duration], ['h264', 1080, 1920, '450', 'aac', '15.000000']);
    assert.deepEqual(calls, []);
  } finally { await browser.close(); await server.close(); }
});
