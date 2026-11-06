import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ffprobe from '@ffprobe-installer/ffprobe';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('media-first flow requires real-shaped analysis, retrieves approved media and exports an edit', { timeout: 120000, skip: process.env.MUMOO_HEADED !== '1' || process.platform !== 'darwin' }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mumoo-media-test-'));
  const footage = join(tmp, 'footage.mp4');
  execFileSync(ffmpeg.path, ['-v','error','-y','-stream_loop','-1','-i','public/pixi-proof/window-motion.mp4','-t','10','-c','copy',footage]);
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }, logLevel: 'error' }); await server.listen();
  const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try {
    const page = await browser.newPage(); let analyses = 0, recommendations = 0, lyricCalls = 0;
    page.on('request', req => { if (req.url().includes('align-lyrics')) lyricCalls++; });
    await page.route('**/api/brain-tester-access', route => route.fulfill({ json: { token: 'private-test-token' } }));
    await page.route('**/.netlify/functions/analyze-music', async route => {
      analyses++; const hash = createHash('sha256').update(route.request().postDataBuffer()).digest('hex');
      await route.fulfill({ json: { version: 1, method: 'beat_this_librosa', source: null, clip: { durationMs: 15000, offsetMs: 0, sha256: hash }, rhythm: { beatsMs: [1200,2400,3600,4800,6000,7200,8400,9600,10800,12000,13200], downbeatsMs: [], tempo: { status: 'estimated', gridBpm: 100, alternativesBpm: [] } }, features: { transientsMs: [3600,7200,10800], frames: [{ timeMs: 0, rms: 0.2, centroidHz: 1000, onsetStrength: 0.1 }] }, provenance: {}, metrics: {} } });
    });
    await page.route('**/api/media-catalog', async route => {
      const body = route.request().postDataJSON(); if (body.operation === 'research-asset') return route.fulfill({ path: footage, contentType: 'video/mp4' }); assert.equal(body.operation, 'fast-plan'); assert.equal(body.profile.measured.tempo.gridBpm, 100); assert.deepEqual(body.profile.lyricCues, []); assert.deepEqual(body.profile.measured.onsetsMs, [3600, 7200, 10800]); recommendations++;
      const assets = [1,2,3,4].map(n => ({ id: `pixabay-${n}`, type: 'video', title: `Test asset ${n}`, query: 'fashion', rights: 'STAGING_TEST_ONLY', adSafety: 'REVIEW_REQUIRED' }));
      const starts = [0, 108, 216, 324, 450];
      const shots = starts.slice(0,-1).map((startFrame, i) => ({ assetId: assets[i].id, startFrame, endFrame: starts[i+1], sourceStartMs: 0, transition: i % 2 ? 'dissolve' : 'cut' }));
      const executionPlan = { version:2,clipSha256:body.profile.clipSha256,fps:30,durationFrames:450,seed:42,lyrics:{source:'none'},motion:[{startFrame:0,endFrame:450,intensity:.5}],shots:shots.map(shot=>({assetId:shot.assetId,startFrame:shot.startFrame,endFrame:shot.endFrame,sourceInMs:shot.sourceStartMs,sourceOutMs:Math.ceil((shot.endFrame-shot.startFrame)*1000/30),transition:{type:shot.transition,durationFrames:shot.transition==='dissolve'?9:0},crop:{mode:'cover',x:.5,y:.5}})) };
      await route.fulfill({ json: { version: 1, status: 'ready', scope: 'staging-test-only', durationMs: 15000, intent: { genre: 'House' }, assets, shots, executionPlan } });
    });
    await page.route('https://upload.wikimedia.org/test*.webm', route => route.fulfill({ path: 'public/pixi-proof/window-motion.mp4', contentType: 'video/mp4', headers: { 'access-control-allow-origin': '*' } }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?media-debug=1`);
    const rate = 48000, samples = rate * 16, wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
    await page.getByLabel('Source WAV').setInputFiles({ name: 'fixture.wav', mimeType: 'audio/wav', buffer: wav });
    await page.getByLabel('Primary genre').fill('House'); await page.getByLabel('Staging tester password').fill('test password'); await page.getByRole('button', { name: 'Unlock staging' }).click();
    await page.getByRole('button', { name: 'Continue to clip' }).click(); await page.getByRole('button', { name: 'Continue to video type' }).click();
    await page.getByLabel('Visual', { exact: true }).check(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Other visuals' }).click(); await page.getByLabel('Automatic video preview').waitFor(); assert.equal(analyses, 1); assert.equal(recommendations, 1); assert.equal(lyricCalls, 0);
    for (const obsolete of ['Elastic', 'Glitch', 'Scribble', 'Internal image-surface experiment']) assert.equal(await page.getByText(obsolete, { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const pending = page.waitForEvent('download', { timeout: 90000 }); await page.getByRole('button', { name: 'Download MP4' }).click();
    const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', await (await pending).path()]));
    assert.deepEqual([info.streams[0].codec_name, info.streams[0].nb_frames, info.streams[1].codec_name, info.format.duration], ['h264', '450', 'aac', '15.000000']);
    await page.getByText('Staging: inspect Director Blueprint').click(); const debug = await page.locator('pre').innerText(); assert.ok(debug.includes('directorBlueprint') && debug.includes('beatsMs')); assert.equal(debug.includes('private-test-token'), false);
  } finally { await browser.close(); await server.close(); rmSync(tmp, {recursive:true,force:true}); }
});

test('a failed analysis is visible and only retries when requested', { timeout: 60000, skip: process.env.MUMOO_HEADED !== '1' || process.platform !== 'darwin' }, async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' }); await server.listen();
  const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try {
    const page = await browser.newPage(); let analyses = 0, director = 0;
    await page.route('**/api/brain-tester-access', route => route.fulfill({ json: { token: 'test-token' } }));
    await page.route('**/.netlify/functions/analyze-music', async route => {
      analyses++; if (analyses === 1) { await route.fulfill({ status: 503, json: { error: 'Unavailable' } }); return; }
      const hash = createHash('sha256').update(route.request().postDataBuffer()).digest('hex');
      await route.fulfill({ json: { version: 1, method: 'beat_this_librosa', clip: { durationMs: 15000, offsetMs: 0, sha256: hash }, rhythm: { beatsMs: [1000, 3600, 7200], downbeatsMs: [], tempo: { status: 'estimated', gridBpm: 100, alternativesBpm: [] } }, features: { transientsMs: [3600, 7200], frames: [{ timeMs: 0, rms: 0.2, centroidHz: 1000, onsetStrength: 0.1 }] }, provenance: {}, metrics: {} } });
    });
    await page.route('**/api/media-catalog', async route => { director++; await route.fulfill({ json: { version: 1, status: 'unavailable', reason: 'No reviewed footage' } }); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?media-debug=1`);
    const rate = 48000, samples = rate * 16, wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
    await page.getByLabel('Source WAV').setInputFiles({ name: 'fixture.wav', mimeType: 'audio/wav', buffer: wav });
    await page.getByLabel('Primary genre').fill('House'); await page.getByLabel('Staging tester password').fill('test password'); await page.getByRole('button', { name: 'Unlock staging' }).click();
    await page.getByRole('button', { name: 'Continue to clip' }).click(); await page.getByRole('button', { name: 'Continue to video type' }).click(); await page.getByLabel('Visual', { exact: true }).check(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Other visuals' }).click(); await page.getByRole('button', { name: 'Retry music analysis' }).waitFor(); assert.equal(analyses, 1); assert.equal(director, 0);
    await page.getByRole('button', { name: 'Retry music analysis' }).click(); await page.getByText('Not enough matching footage or music timing is available yet.').waitFor();
    assert.equal(analyses, 2); assert.equal(director, 1);
    await page.getByText('Staging: inspect Director Blueprint').click(); const debug = await page.locator('pre').innerText(); assert.ok(debug.includes('analysis_failed')); assert.ok(debug.includes('analysis_response')); assert.equal(debug.includes('test-token'), false);
  } finally { await browser.close(); await server.close(); }
});
