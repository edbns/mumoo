import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ffprobe from '@ffprobe-installer/ffprobe';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { copyFileSync, writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unzipSync } from 'fflate';

test('six screens preview approved lyrics and export synchronized MP4s', { timeout: 240000, skip: process.env.MUMOO_HEADLESS !== '1' && (process.env.MUMOO_HEADED !== '1' || process.platform !== 'darwin') }, async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' }); await server.listen();
  const browser = await chromium.launch(process.env.MUMOO_HEADLESS === '1' ? { headless: true } : { headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try {
    const page = await browser.newPage(); let syncCalls = 0; let brainCalls = 0; let analysisCalls = 0;
    await page.route('**/api/brain-tester-access', route => route.fulfill({ json: { token: 'test-token' } }));
    await page.route('**/.netlify/functions/analyze-music', async route => {
      analysisCalls++;
      const hash = createHash('sha256').update(route.request().postDataBuffer()).digest('hex');
      await route.fulfill({ json: { version: 1, method: 'beat_this_librosa', clip: { durationMs: 15000, offsetMs: 0, sha256: hash }, rhythm: { beatsMs: [1000, 2000], downbeatsMs: [], tempo: { status: 'estimated', gridBpm: 120, alternativesBpm: [] } }, features: { transientsMs: [1000], frames: [{ timeMs: 0, rms: 0.2, centroidHz: 1000, onsetStrength: 0.1 }] }, provenance: {}, metrics: {} } });
    });
    await page.route('**/.netlify/functions/align-lyrics', async route => {
      syncCalls++; assert.equal(route.request().postDataJSON().lyrics, 'Make it move! Again.');
      await route.fulfill({ json: { version: 1, method: 'whisperx_supplied_lyrics', words: [
        { text: 'Make', status: 'aligned', startMs: 1000, endMs: 1200 }, { text: 'it', status: 'aligned', startMs: 1200, endMs: 1400 },
        { text: 'move!', status: 'aligned', startMs: 1400, endMs: 1800 }, { text: 'Again.', status: 'aligned', startMs: 2500, endMs: 2800 },
      ] } });
    });
    await page.route('**/api/brain-recommendations', async route => {
      brainCalls++; const data = route.request().postDataJSON();
      assert.equal(data.videoType, 'lyric'); assert.equal(JSON.stringify(data).includes('Make'), false);
      const item = { id: 'daily-screens', renderer: { template: 'daily-screens' } };
      await route.fulfill({ json: { recommendations: [], catalog: [item] } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    const rate = 48000, samples = rate * 18, wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
    for (const marker of [0.5, 3, 4, 16.5, 17.5]) for (let n = 0; n < 480; n++) wav.writeInt16LE(Math.round(28000 * Math.sin(n * Math.PI / 8)), 44 + (marker * rate + n) * 2);
    await page.getByLabel('Source WAV').setInputFiles({ name: 'fixture.wav', mimeType: 'audio/wav', buffer: wav });
    await page.getByLabel('Primary genre').fill('House'); await page.getByLabel('Staging tester password').fill('test password'); await page.getByRole('button', { name: 'Unlock staging' }).click();
    await page.getByRole('button', { name: 'Continue to clip' }).click(); await page.getByLabel('Clip start (ms)').fill('2000');
    await page.getByRole('button', { name: 'Continue to video type' }).click(); await page.getByLabel('Lyric Video').check(); await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByText('Paste lyrics for this section').click(); await page.getByLabel('Lyrics for this section').fill('Make it move! Again.'); await page.getByRole('button', { name: 'Sync lyrics' }).click();
    await page.getByText('Synced 4 words.', { exact: false }).waitFor(); await page.getByRole('button', { name: 'Approve lyrics and choose visual' }).click();
    const canvas = page.getByLabel('Daily Screens preview'); await canvas.waitFor();
    await page.getByLabel('Seek preview').fill('1400');
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForFunction(input => Number(input.value) > 1450, await page.getByLabel('Seek preview').elementHandle(), { timeout: 5000 });
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByLabel('Seek preview').fill('1400');
    const snapshots = {};
    for (const name of ['Messages', 'WhatsApp', 'Telegram', 'Messenger', 'Instagram', 'Dating chat']) {
      await page.getByRole('button', { name, exact: true }).click();
      snapshots[name === 'Dating chat' ? 'dating' : name.toLowerCase()] = Buffer.from((await canvas.evaluate(el => el.toDataURL('image/png'))).split(',')[1], 'base64');
      if (process.env.MUMOO_DAILY_SAMPLE) writeFileSync(`${process.env.MUMOO_DAILY_SAMPLE}-${name.toLowerCase()}.png`, snapshots[name === 'Dating chat' ? 'dating' : name.toLowerCase()]);
    }
    assert.equal(new Set(Object.values(snapshots).map(value => createHash('sha256').update(value).digest('hex'))).size, 6);
    await page.getByRole('button', { name: 'Messages', exact: true }).click();
    const png = Buffer.from((await canvas.evaluate(el => el.toDataURL('image/png'))).split(',')[1], 'base64');
    const start = performance.now(); const pending = page.waitForEvent('download', { timeout: 120000 }); await page.getByRole('button', { name: 'Download MP4' }).click();
    assert.equal(await page.getByRole('button', { name: 'Back to lyrics' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Other visuals' }).isDisabled(), true);
    const path = await (await pending).path(); const seconds = (performance.now() - start) / 1000;
    if (process.env.MUMOO_DAILY_SAMPLE) { writeFileSync(`${process.env.MUMOO_DAILY_SAMPLE}.png`, png); copyFileSync(path, `${process.env.MUMOO_DAILY_SAMPLE}.mp4`); }
    const info = JSON.parse(execFileSync(ffprobe.path, ['-v','error','-show_streams','-show_format','-of','json',path]));
    assert.deepEqual([info.streams[0].codec_name, info.streams[0].width, info.streams[0].height, info.streams[0].nb_frames, info.streams[0].avg_frame_rate, info.streams[1].codec_name, info.format.duration], ['h264',1080,1920,'450','30/1','aac','15.000000']);
    const preview = execFileSync(ffmpeg.path,['-v','error','-i','pipe:0','-vf','scale=108:192','-pix_fmt','rgb24','-f','rawvideo','-'],{ input: png });
    const exported = execFileSync(ffmpeg.path,['-v','error','-i',path,'-vf',"select='eq(n,42)',scale=108:192",'-vsync','0','-pix_fmt','rgb24','-f','rawvideo','-']);
    assert.equal(preview.length, exported.length); const error = preview.reduce((n, value, index) => n + Math.abs(value - exported[index]), 0) / preview.length;
    assert.ok(error < 8, `preview/export error ${error}`);
    const pcm = execFileSync(ffmpeg.path,['-v','error','-i',path,'-vn','-ac','1','-ar',String(rate),'-f','s16le','-'],{maxBuffer:2000000});
    const markers=[]; for(let i=0;i<pcm.length;i+=2) { if(Math.abs(pcm.readInt16LE(i))<9000) continue; const at=i/2/rate; if(!markers.length || at-markers.at(-1)>0.1) markers.push(at); }
    assert.equal(markers.length,3); [1,2,14.5].forEach((at,i)=>assert.ok(Math.abs(markers[i]-at)<0.006));
    const pendingZip = page.waitForEvent('download', { timeout: 120000 }); await page.getByRole('button', { name: 'Download all six' }).click();
    const zipDownload = await pendingZip;
    assert.equal(zipDownload.suggestedFilename(), 'mumoo-daily-screens.zip');
    const files = unzipSync(readFileSync(await zipDownload.path()));
    assert.deepEqual(Object.keys(files).sort(), ['mumoo-dating.mp4', 'mumoo-instagram.mp4', 'mumoo-messages.mp4', 'mumoo-messenger.mp4', 'mumoo-telegram.mp4', 'mumoo-whatsapp.mp4']);
    const dir = mkdtempSync(join(tmpdir(), 'mumoo-daily-five-'));
    try {
      for (const [name, bytes] of Object.entries(files)) {
        const file = join(dir, name); writeFileSync(file, bytes);
        const metadata = JSON.parse(execFileSync(ffprobe.path, ['-v','error','-show_streams','-show_format','-of','json',file]));
        assert.deepEqual([metadata.streams[0].codec_name, metadata.streams[0].width, metadata.streams[0].height, metadata.streams[0].nb_frames, metadata.streams[1].codec_name, metadata.format.duration], ['h264',1080,1920,'450','aac','15.000000']);
        const decodedAudio = execFileSync(ffmpeg.path, ['-v','error','-i',file,'-vn','-ac','1','-ar',String(rate),'-f','s16le','-'], { maxBuffer: 2000000 });
        assert.equal(createHash('sha256').update(decodedAudio).digest('hex'), createHash('sha256').update(pcm).digest('hex'), `${name} must preserve the selected audio`);
        const variant = name.replace('mumoo-', '').replace('.mp4', '');
        const expected = execFileSync(ffmpeg.path,['-v','error','-i','pipe:0','-vf','scale=108:192','-pix_fmt','rgb24','-f','rawvideo','-'], { input: snapshots[variant] });
        const actual = execFileSync(ffmpeg.path,['-v','error','-i',file,'-vf',"select='eq(n,42)',scale=108:192",'-vsync','0','-pix_fmt','rgb24','-f','rawvideo','-']);
        const difference = expected.reduce((sum, value, index) => sum + Math.abs(value - actual[index]), 0) / expected.length;
        assert.ok(difference < 8, `${variant} preview/export error ${difference}`);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
    assert.equal(syncCalls,1); assert.equal(brainCalls,1); assert.equal(analysisCalls,1);
    t.diagnostic(`Mocked services; ${process.env.MUMOO_HEADLESS === '1' ? 'headless Chromium' : 'headed Brave'}. Export ${seconds.toFixed(2)} s; frame 42 mean RGB error ${error.toFixed(2)}/255; selected-audio markers ${markers.map(x=>x.toFixed(3)).join(', ')} s.`);
  } finally { await browser.close(); await server.close(); }
});
