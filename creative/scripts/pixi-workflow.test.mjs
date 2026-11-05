import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
    await page.route('**/api/brain-tester-access', route => route.fulfill({ json: { token: 'test-token' } }));
    await page.route('**/api/brain-recommendations', async route => {
      const body = route.request().postDataJSON();
      assert.equal(body.videoType, 'visual'); assert.equal(body.primaryGenre, 'House');
      assert.equal('lyrics' in body, false);
      await route.fulfill({ json: { version: 1, catalogVersion: 1, algorithmVersion: 1, eligibleCount: 0, catalog: [], recommendations: [] } });
    });
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
    await page.getByLabel('Staging tester password').fill('test password');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByText('No eligible recommendations are available yet.').waitFor();
    for (const label of ['Window', 'Close', 'Wide', 'Motion preset', 'Try Pixi visual proof']) assert.equal(await page.getByText(label, { exact: true }).count(), 0);
    assert.ok(process.env.MUMOO_FOOTAGE_FIXTURE, 'rights-cleared video fixture required');
    await page.getByLabel('Add an image or video').setInputFiles(process.env.MUMOO_FOOTAGE_FIXTURE);
    await page.getByRole('button', { name: 'Play your media' }).click();
    await page.getByLabel('Pixi visual preview').waitFor();
    await page.getByText('Hardware-accelerated preview').waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Select your media' }).click();
    console.log('video export started');
    const pending = page.waitForEvent('download', { timeout: 60000 });
    await page.getByRole('button', { name: 'Generate Selected' }).click();
    const file = await (await pending).path();
    const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
    assert.deepEqual([info.streams[0].codec_name, info.streams[0].width, info.streams[0].height, info.streams[0].nb_frames, info.streams[1].codec_name, info.format.duration], ['h264', 1080, 1920, '450', 'aac', '15.000000']);
    console.log('video export completed');
    await page.getByLabel('Add an image or video').setInputFiles('public/pixi-proof/night-window.png');
    await page.getByRole('button', { name: 'Play your media' }).click();
    await page.getByText('Hardware-accelerated preview').waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Select your media' }).click();
    console.log('image export started');
    const imageDownload = page.waitForEvent('download', { timeout: 60000 });
    await page.getByRole('button', { name: 'Generate Selected' }).click();
    const imageFile = await (await imageDownload).path();
    console.log('image export completed');
    const imageInfo = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', imageFile]));
    assert.deepEqual([imageInfo.streams[0].codec_name, imageInfo.streams[0].nb_frames, imageInfo.streams[1].codec_name, imageInfo.format.duration], ['h264', '450', 'aac', '15.000000']);
    assert.deepEqual(calls, []);
  } finally { await browser.close(); await server.close(); }
});

test('lyric gallery uses Brain results and keeps multi-select honest', { timeout: 120000, skip: process.env.MUMOO_HEADED !== '1' || process.platform !== 'darwin' }, async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try {
    const page = await browser.newPage();
    let analysisCalls = 0;
    let sawMusicFeatures = false;
    await page.addInitScript(() => sessionStorage.setItem('mumoo-music-access', 'test-code'));
    await page.route('**/.netlify/functions/analyze-music', async route => {
      analysisCalls++;
      const hash = createHash('sha256').update(route.request().postDataBuffer()).digest('hex');
      await route.fulfill({ json: { version: 1, method: 'beat_this_librosa', source: null,
        clip: { durationMs: 15000, offsetMs: 0, sha256: hash },
        rhythm: { beatsMs: [500, 1000], downbeatsMs: [], tempo: { status: 'ambiguous', gridBpm: 120, alternativesBpm: [60] } },
        features: { transientsMs: [500], frames: [{ timeMs: 0, rms: 0.2, centroidHz: 1000 }] }, provenance: {}, metrics: {} } });
    });
    const items = ['elastic', 'glitch', 'scribble'].map(id => ({ id, version: 1, name: id, description: 'Typography', renderer: { kind: 'existing_canvas', template: id }, preview: true, export: true }));
    await page.route('**/api/brain-tester-access', route => route.fulfill({ json: { token: 'test-token' } }));
    await page.route('**/api/brain-recommendations', async route => {
      const body = route.request().postDataJSON();
      assert.equal(body.videoType, 'lyric'); assert.equal(body.primaryGenre, 'House');
      if (body.music) sawMusicFeatures = body.music.gridBpm === 120 && body.music.tempoStatus === 'ambiguous';
      assert.equal('lyrics' in body, false); assert.equal('clip' in body, false);
      await route.fulfill({ json: { version: 1, catalogVersion: 1, algorithmVersion: 1, eligibleCount: 3, catalog: items, recommendations: items.map(item => ({ ...item, explanation: 'Supports timed lyrics.' })) } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
    const rate = 48000, samples = rate * 16, wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
    await page.getByLabel('Source WAV').setInputFiles({ name: 'fixture.wav', mimeType: 'audio/wav', buffer: wav });
    await page.getByLabel('Primary genre').fill('House');
    await page.getByRole('button', { name: 'Continue to clip' }).click();
    await page.getByRole('button', { name: 'Continue to video type' }).click();
    await page.getByLabel('Lyric Video').check(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByText('Advanced manual timing', { exact: true }).click();
    await page.getByRole('button', { name: 'Add lyric line' }).click();
    await page.getByLabel('Lyric 1', { exact: true }).fill('Example lyric');
    await page.getByLabel('Line 1 in (ms)').fill('1000'); await page.getByLabel('Line 1 out (ms)').fill('2000');
    await page.getByRole('button', { name: 'Approve lyrics and choose visual' }).click();
    await page.getByLabel('Staging tester password').fill('test password'); await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByText('3 eligible recommendations are available right now.').waitFor();
    assert.equal(await page.locator('.gallery-card').count(), 6);
    const recommended = page.locator('.gallery-grid').first();
    await recommended.getByRole('button', { name: 'Play', exact: true }).first().click();
    assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).count(), 1);
    await recommended.getByRole('button', { name: 'Play', exact: true }).first().click();
    assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).count(), 1);
    await recommended.getByRole('button', { name: 'Select', exact: true }).first().click();
    await recommended.getByRole('button', { name: 'Select', exact: true }).first().click();
    assert.equal(await page.getByRole('button', { name: 'Generate Selected' }).isDisabled(), true);
    await recommended.getByRole('button', { name: 'Selected ✓', exact: true }).first().click();
    assert.equal(await page.getByRole('button', { name: 'Generate Selected' }).isEnabled(), true);
    const pending = page.waitForEvent('download', { timeout: 90000 });
    await page.getByRole('button', { name: 'Generate Selected' }).click();
    const file = await (await pending).path();
    assert.equal(analysisCalls, 1, 'changing previews and selections must reuse music analysis');
    assert.equal(sawMusicFeatures, true, 'the Brain receives available music features');
    const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
    assert.deepEqual([info.streams[0].codec_name, info.streams[0].nb_frames, info.streams[1].codec_name, info.format.duration], ['h264', '450', 'aac', '15.000000']);
  } finally { await browser.close(); await server.close(); }
});
