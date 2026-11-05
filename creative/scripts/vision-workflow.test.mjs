import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ffprobe from '@ffprobe-installer/ffprobe';
import { readFileSync, realpathSync } from 'node:fs';

test('isolated visual-intelligence flow plays and exports through the existing renderer', { timeout: 120000, skip: process.env.MUMOO_HEADED !== '1' || process.platform !== 'darwin' }, async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }, logLevel: 'error' }); await server.listen();
  const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try {
    const page = await browser.newPage(); let calls = 0, lyrics = 0;
    await page.addInitScript(() => { const original = window.setTimeout; window.setTimeout = (fn, ms, ...args) => original(fn, ms === 12000 ? 1000 : ms, ...args); });
    page.on('request', req => { if (req.url().includes('align-lyrics')) lyrics++; });
    await page.route('**/api/brain-tester-access', route => route.fulfill({ json: { token: 'test-token' } }));
    await page.route('**/.netlify/functions/analyze-music', route => {
      const hash = createHash('sha256').update(route.request().postDataBuffer()).digest('hex');
      return route.fulfill({ json: { version: 1, method: 'beat_this_librosa', clip: { durationMs: 15000, offsetMs: 0, sha256: hash }, rhythm: { beatsMs: [1200,3600,7200,10800], downbeatsMs: [], tempo: { status: 'estimated', gridBpm: 100, alternativesBpm: [] } }, features: { transientsMs: [3600,7200,10800], frames: [{ timeMs: 0, rms: 0.2, centroidHz: 1000, onsetStrength: 0.1 }] }, provenance: {}, metrics: {} } });
    });
    await page.route('**/api/media-catalog', route => {
      const body = route.request().postDataJSON();
      if (body.operation === 'research-asset') { calls++; return route.fulfill({ path: 'public/pixi-proof/window-motion.mp4', contentType: 'video/mp4' }); }
      if (body.operation === 'vision-start') { assert.equal(body.profile.videoType,'visual'); assert.deepEqual(body.profile.lyricCues,[]); assert.equal(body.profile.measured.envelope.length,30); return route.fulfill({json:{status:'pending',phase:'direction',jobId:'fc-first',ticket:'a'.repeat(64)}}); }
      if (body.operation === 'vision-poll' && body.phase === 'direction') return route.fulfill({json:{status:'pending',phase:'vision',jobId:'fc-next',ticket:'b'.repeat(64)}});
      assert.equal(body.operation,'vision-poll'); assert.equal(body.phase,'vision');
      const assets = [{ id:'pixabay-1', type:'video', title:'Fixture 1', query:'test', rights:'STAGING_TEST_ONLY', adSafety:'REVIEW_REQUIRED' }, { id:'pixabay-2', type:'video', title:'Fixture 2', query:'test', rights:'STAGING_TEST_ONLY', adSafety:'REVIEW_REQUIRED' }];
      const shots=[{assetId:assets[0].id,startFrame:0,endFrame:216,startMs:0,endMs:7200,sourceStartMs:500,transition:'cut'},{assetId:assets[1].id,startFrame:216,endFrame:450,startMs:7200,endMs:15000,sourceStartMs:500,transition:'dissolve'}];
      return route.fulfill({json:{status:'ready',result:{version:1,status:'ready',scope:'staging-test-only',durationMs:15000,assets,shots}}});
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?vision-intelligence=1&vision-research-internal=1&media-debug=1`);
    const rate = 48000, samples = rate * 16, wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
    await page.getByLabel('Source WAV').setInputFiles({ name: 'fixture.wav', mimeType: 'audio/wav', buffer: wav });
    await page.getByLabel('Primary genre').fill('House'); await page.getByLabel('Staging tester password').fill('test password'); await page.getByRole('button', { name: 'Unlock staging' }).click();
    await page.getByRole('button', { name: 'Continue to clip' }).click(); await page.getByRole('button', { name: 'Continue to video type' }).click(); await page.getByLabel('Visual', { exact: true }).check(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Automatic video preview').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Play' && !button.disabled));
    const visiblePixels = await page.getByLabel('Automatic video preview').evaluate(canvas => { const ctx = canvas.getContext('2d'); let nonBlack = 0; for (let y = 100; y < canvas.height; y += 300) for (let x = 100; x < canvas.width; x += 200) { const data = ctx.getImageData(x, y, 1, 1).data; if (data[0] + data[1] + data[2] > 10) nonBlack++; } return nonBlack; });
    assert.ok(visiblePixels > 0, 'Play must not be enabled before a visible first frame'); assert.equal(calls, 2); assert.equal(lyrics, 0);
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await page.getByRole('button', { name: 'Pause', exact: true }).waitFor(); await page.getByRole('button', { name: 'Pause', exact: true }).click();
    assert.ok(await page.getByText('Private staging research: footage has not been cleared for advertising or release.').isVisible());
    const pending = page.waitForEvent('download', { timeout: 90000 }); await page.getByRole('button', { name: 'Download MP4' }).click();
    const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', await (await pending).path()]));
    assert.deepEqual([info.streams[0].codec_name, info.streams[0].width, info.streams[0].height, info.streams[0].nb_frames, info.streams[1].codec_name, info.format.duration], ['h264', 1080, 1920, '450', 'aac', '15.000000']);
    await page.getByText('Staging: inspect Director Blueprint').click(); const diagnosticDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Blueprint' }).click();
    const text = readFileSync(await (await diagnosticDownload).path(), 'utf8'); const diagnostic = JSON.parse(text);
    assert.equal(diagnostic.directorBlueprint.scope, 'staging-test-only'); assert.equal(text.includes('test-token'), false); assert.equal(text.includes('fixture.wav'), false);
    const stages = diagnostic.diagnostics.map(event => event.stage); assert.ok(stages.indexOf('preview_renderer_ready') >= 0 && stages.indexOf('preview_ready') > stages.indexOf('preview_renderer_ready'));
  } finally { await browser.close(); await server.close(); }
});
