import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ffprobe from '@ffprobe-installer/ffprobe';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { unzipSync } from 'fflate';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Lyric Impact previews four distinct styles and exports the selected audio', { timeout: 240000, skip: process.env.MUMOO_HEADLESS !== '1' }, async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' }); await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); let syncCalls = 0; let analysisCalls = 0;
    await page.route('**/api/brain-tester-access', route => route.fulfill({ json: { token: 'test-token' } }));
    await page.route('**/.netlify/functions/analyze-music', async route => {
      analysisCalls++; const hash = createHash('sha256').update(route.request().postDataBuffer()).digest('hex');
      await route.fulfill({ json: { version: 1, method: 'beat_this_librosa', clip: { durationMs: 15000, offsetMs: 0, sha256: hash }, rhythm: { beatsMs: [1000, 2000], downbeatsMs: [], tempo: { status: 'estimated', gridBpm: 120, alternativesBpm: [] } }, features: { transientsMs: [1000], frames: [{ timeMs: 0, rms: 0.2, centroidHz: 1000, onsetStrength: 0.1 }, { timeMs: 1000, rms: 0.5, centroidHz: 1200, onsetStrength: 0.4 }] }, provenance: {}, metrics: {} } });
    });
    await page.route('**/.netlify/functions/align-lyrics', async route => {
      syncCalls++; await route.fulfill({ json: { version: 1, method: 'whisperx_supplied_lyrics', words: [
        { text: 'Make', status: 'aligned', startMs: 1000, endMs: 1200 }, { text: 'it', status: 'aligned', startMs: 1200, endMs: 1400 },
        { text: 'move!', status: 'aligned', startMs: 1400, endMs: 1800 }, { text: 'Again.', status: 'aligned', startMs: 2500, endMs: 2800 },
      ] } });
    });
    await page.route('**/api/brain-recommendations', async route => {
      const payload = route.request().postDataJSON(); assert.equal(payload.videoType, 'lyric'); assert.equal(JSON.stringify(payload).includes('Make'), false);
      const ids = process.env.MUMOO_ONLY_IMPACT === '1' ? ['lyric-impact'] : ['daily-screens', 'lyric-impact'];
      await route.fulfill({ json: { catalog: ids.map(id => ({ id, renderer: { template: id } })) } });
    });
    await page.goto(process.env.MUMOO_STAGING_URL || `http://127.0.0.1:${server.httpServer.address().port}/`);
    const rate = 48000, samples = rate * 18, wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
    for (const marker of [3, 4, 16.5]) for (let n = 0; n < 480; n++) wav.writeInt16LE(Math.round(28000 * Math.sin(n * Math.PI / 8)), 44 + (marker * rate + n) * 2);
    const song = process.env.MUMOO_REAL_SONG;
    await page.getByLabel('Source WAV').setInputFiles(song || { name: 'fixture.wav', mimeType: 'audio/wav', buffer: wav });
    await page.getByLabel('Primary genre').fill('House'); await page.getByText('Staging access enabled.').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Continue to clip' }).click(); await page.getByLabel('Clip start (ms)').fill(song ? '41000' : '2000');
    await page.getByRole('button', { name: 'Continue to video type' }).click(); await page.getByLabel('Lyric Video').check(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByText('Paste lyrics for this section').click(); await page.getByLabel('Lyrics for this section').fill('Make it move! Again.'); await page.getByRole('button', { name: 'Sync lyrics' }).click();
    await page.getByText('Synced 4 words.', { exact: false }).waitFor(); await page.getByRole('button', { name: 'Approve lyrics and choose visual' }).click();
    await page.getByRole('button', { name: 'Lyric Impact', exact: true }).click();
    const canvas = page.getByLabel('Lyric Impact preview'); await canvas.waitFor(); await page.getByLabel('Seek preview').fill('1400');
    if (process.env.MUMOO_ONLY_IMPACT === '1') {
      await page.getByRole('button', { name: 'Daily Screens', exact: true }).click();
      await page.getByText('Daily Screens is not available for this song yet.').waitFor();
      await page.getByRole('button', { name: 'Lyric Impact', exact: true }).click();
      await page.getByLabel('Lyric Impact preview').waitFor();
      return;
    }
    const shots = {};
    for (const name of ['Poster', 'Punch', 'Editorial', 'Echo']) {
      await page.getByRole('button', { name, exact: true }).click();
      shots[name.toLowerCase()] = Buffer.from((await canvas.evaluate(el => el.toDataURL('image/png'))).split(',')[1], 'base64');
      if (process.env.MUMOO_IMPACT_SAMPLE) writeFileSync(`${process.env.MUMOO_IMPACT_SAMPLE}-${name.toLowerCase()}.png`, shots[name.toLowerCase()]);
    }
    assert.equal(new Set(Object.values(shots).map(value => createHash('sha256').update(value).digest('hex'))).size, 4);
    const singlePending = page.waitForEvent('download', { timeout: 120000 }); await page.getByRole('button', { name: 'Download MP4' }).click();
    const single = await singlePending; assert.equal(single.suggestedFilename(), 'mumoo-lyric-impact-echo.mp4');
    const singleInfo = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', await single.path()]));
    assert.deepEqual([singleInfo.streams[0].codec_name, singleInfo.streams[1].codec_name, singleInfo.format.duration], ['h264', 'aac', '15.000000']);
    const started = performance.now(); const pending = page.waitForEvent('download', { timeout: 180000 }); await page.getByRole('button', { name: 'Download all styles' }).click();
    const download = await pending; const seconds = (performance.now() - started) / 1000;
    assert.equal(download.suggestedFilename(), 'mumoo-lyric-impact.zip');
    const files = unzipSync(readFileSync(await download.path()));
    assert.deepEqual(Object.keys(files).sort(), ['mumoo-lyric-impact-echo.mp4', 'mumoo-lyric-impact-editorial.mp4', 'mumoo-lyric-impact-poster.mp4', 'mumoo-lyric-impact-punch.mp4']);
    const dir = mkdtempSync(join(tmpdir(), 'mumoo-impact-')); const digests = []; let firstPcm;
    try {
      for (const [name, bytes] of Object.entries(files)) {
        const file = join(dir, name); writeFileSync(file, bytes);
        const probe = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
        assert.deepEqual([probe.streams[0].codec_name, probe.streams[0].width, probe.streams[0].height, probe.streams[0].nb_frames, probe.streams[1].codec_name, probe.format.duration], ['h264', 1080, 1920, '450', 'aac', '15.000000']);
        const pcm = execFileSync(ffmpeg.path, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-'], { maxBuffer: 2000000 });
        if (!firstPcm) firstPcm = pcm;
        digests.push(createHash('sha256').update(pcm).digest('hex'));
        const style = name.replace('mumoo-lyric-impact-', '').replace('.mp4', '');
        const expected = execFileSync(ffmpeg.path, ['-v', 'error', '-i', 'pipe:0', '-vf', 'scale=108:192', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { input: shots[style] });
        const actual = execFileSync(ffmpeg.path, ['-v', 'error', '-i', file, '-vf', "select='eq(n,42)',scale=108:192", '-vsync', '0', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
        assert.equal(expected.length, actual.length); const error = expected.reduce((sum, value, i) => sum + Math.abs(value - actual[i]), 0) / expected.length;
        assert.ok(error < 8, `${style} preview/export error ${error}`);
      }
      assert.equal(new Set(digests).size, 1, 'all exports must contain the same audio');
      if (song) {
        const reference = execFileSync(ffmpeg.path, ['-v', 'error', '-ss', '41', '-i', song, '-t', '15', '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-'], { maxBuffer: 2000000 });
        let dot = 0, a2 = 0, b2 = 0;
        for (let offset = rate * 2; offset < rate * 4; offset += 8) {
          const a = reference.readInt16LE(offset), b = firstPcm.readInt16LE(offset); dot += a * b; a2 += a * a; b2 += b * b;
        }
        const correlation = dot / Math.sqrt(a2 * b2);
        assert.ok(correlation > 0.9, `selected song segment correlation ${correlation}`);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
    await page.getByRole('button', { name: 'Daily Screens', exact: true }).click(); await page.getByLabel('Daily Screens preview').waitFor();
    assert.equal(syncCalls, 1); assert.equal(analysisCalls, 1);
    t.diagnostic(`${song ? 'Real-song source' : 'Synthetic source'}; services mocked. Four MP4s exported in ${seconds.toFixed(2)} s, with matching audio and sampled preview frames.`);
  } finally { await browser.close(); await server.close(); }
});
