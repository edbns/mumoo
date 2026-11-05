import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import ffprobe from '@ffprobe-installer/ffprobe';
const clip = { sourceSha256: 'a'.repeat(64), offsetMs: 1000, durationMs: 15000 };
const analysis = { status: 'ready', clip, result: { clip: { offsetMs: 0, durationMs: 15000 }, rhythm: { beatsMs: [1200, 2400, 3600, 4800, 6000, 7200, 8400, 9600, 10800, 12000, 13200] }, features: { transientsMs: [3600, 7200, 10800], frames: [{ timeMs: 0, rms: 0.1 }, { timeMs: 3000, rms: 0.4 }, { timeMs: 7000, rms: 0.3 }] } } };
const composition = { version: 2, template: 'scribble', sourceSha256: 'a'.repeat(64), clipStartMs: 1000, cues: [{ text: 'TEST LYRIC', startMs: 2000, endMs: 3000 }] };
const assets = [{ id: 'image', type: 'image', url: '/pixi-proof/night-window.png', title: 'Original test image' }, { id: 'video', type: 'video', url: '/pixi-proof/window-motion.mp4', title: 'Original test video' }];

test('automatic edit requires matching actual analysis and uses musical opportunities, not every beat', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  try { const { assembleMediaEdit, directorEdit, researchDirectorEdit, frameState } = await server.ssrLoadModule('/src/media-timeline.ts');
    assert.throws(() => assembleMediaEdit(clip, { status: 'unavailable', reason: 'not_requested' }, assets));
    assert.throws(() => assembleMediaEdit({ ...clip, offsetMs: 2000 }, analysis, assets));
    const edit = assembleMediaEdit(clip, analysis, assets);
    assert.ok(edit.shots.length >= 2 && edit.shots.length <= 4);
    for (const shot of edit.shots.slice(1)) assert.ok([...analysis.result.rhythm.beatsMs, ...analysis.result.features.transientsMs].includes(shot.startMs));
    assert.equal(edit.shots[0].startMs, 0); assert.equal(edit.shots.at(-1).endMs, 15000);
    assert.equal(frameState(edit, 0).shot.assetId, 'image');
    const approved = [1, 2].map(id => ({ id: `commons-${id}`, type: 'video', assetUrl: `https://upload.wikimedia.org/${id}.webm`, title: 'Video', status: 'approved', commercialUseEligible: true }));
    const plan = { version: 1, status: 'ready', durationMs: 15000, assets: approved, shots: [{ assetId: 'commons-1', startMs: 0, endMs: 7200, transition: 'cut' }, { assetId: 'commons-2', startMs: 7200, endMs: 15000, transition: 'dissolve' }] };
    assert.equal(directorEdit(clip, plan).shots.length, 2);
    assert.throws(() => directorEdit(clip, { ...plan, assets: [{ ...approved[0], status: 'pending' }, approved[1]] }));
    assert.throws(() => directorEdit(clip, { ...plan, assets: [{ ...approved[0], assetUrl: 'https://evil.example/a.webm' }, approved[1]] }));
    assert.throws(() => directorEdit(clip, { ...plan, shots: [{ ...plan.shots[0], endMs: 7100 }, plan.shots[1]] }));
    const coreAssets = [{ id: 'cma-1', type: 'image', title: 'Image', rights: 'APPROVED', adSafety: 'SAFE' }, { id: 'commons2-2', type: 'video', title: 'Video', rights: 'APPROVED', adSafety: 'SAFE' }];
    const corePlan = { version: 1, status: 'ready', durationMs: 15000, assets: coreAssets, shots: [{ assetId: 'cma-1', startMs: 0, endMs: 7200, transition: 'cut' }, { assetId: 'commons2-2', startMs: 7200, endMs: 15000, transition: 'dissolve' }] };
    const loaded = new Map([['cma-1', 'blob:one'], ['commons2-2', 'blob:two']]);
    assert.equal(researchDirectorEdit(clip, corePlan, loaded).shots.length, 2);
    const framed = { ...corePlan, shots: [{...corePlan.shots[0], startFrame:0, endFrame:216, sourceStartMs:1000}, {...corePlan.shots[1], startFrame:216, endFrame:450, sourceStartMs:2000}] };
    assert.equal(researchDirectorEdit(clip, framed, loaded).shots[1].sourceStartMs, 2000);
    assert.throws(() => researchDirectorEdit(clip, {...framed, shots:[{...framed.shots[0],endFrame:215},framed.shots[1]]}, loaded));
    assert.throws(() => researchDirectorEdit(clip, { ...corePlan, assets: [{ ...coreAssets[0], adSafety: 'REVIEW_REQUIRED' }, coreAssets[1]] }, loaded));
    assert.throws(() => researchDirectorEdit(clip, corePlan, new Map([['cma-1', 'https://evil.example/'], ['commons2-2', 'blob:two']])));
  } finally { await server.close(); }
});

test('image and video share deterministic preview and real 15-second MP4 timeline', { timeout: 180000, skip: process.env.MUMOO_HEADED !== '1' || process.platform !== 'darwin' }, async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }, logLevel: 'error' }); await server.listen();
  const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try { const page = await browser.newPage({ acceptDownloads: true }); await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/export.html`);
    const input = { clip, analysis, composition, assets };
    const previews = await page.evaluate(async input => {
      const { assembleMediaEdit } = await import('/src/media-timeline.ts'); const { createMediaRenderer } = await import('/src/media-renderer.ts');
      await document.fonts.load('800 112px "Inter Variable"', 'TEST LYRIC');
      const edit = assembleMediaEdit(input.clip, input.analysis, input.assets); edit.shots = edit.shots.map(shot => shot.assetId === 'video' ? {...shot, sourceStartMs: 500} : shot); const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
      const renderer = await createMediaRenderer(canvas, edit, input.composition);
      try { const output = []; await renderer.render(60); output.push(canvas.toDataURL());
        const pendingFrame = renderer.render(150); const duringSeek = canvas.toDataURL(); await pendingFrame;
        for (const frame of [108, 150, 108]) { await renderer.render(frame); output.push(canvas.toDataURL()); }
        return { output, duringSeek, shots: edit.shots }; } finally { renderer.destroy(); }
    }, input);
    assert.equal(previews.duringSeek, previews.output[0], 'an in-progress video seek must not flash a cleared canvas');
    assert.equal(previews.output[1], previews.output[3]); assert.notEqual(previews.output[0], previews.output[2]);
    const pending = page.waitForEvent('download', { timeout: 170000 }); const start = performance.now();
    await page.evaluate(async input => {
      const { assembleMediaEdit } = await import('/src/media-timeline.ts'); const { createMediaRenderer } = await import('/src/media-renderer.ts'); const { renderMp4 } = await import('/src/browser-export.ts');
      const edit = assembleMediaEdit(input.clip, input.analysis, input.assets); edit.shots = edit.shots.map(shot => shot.assetId === 'video' ? {...shot, sourceStartMs: 500} : shot); const audio = new AudioBuffer({ length: 17 * 48000, numberOfChannels: 1, sampleRate: 48000 });
      const channel = audio.getChannelData(0); for (let n = 0; n < 480; n++) channel[3 * 48000 + n] = 0.8 * Math.sin(n * Math.PI / 8);
      let renderer; try { const blob = await renderMp4(input.composition, audio, () => {}, async (canvas, frame) => { renderer ??= await createMediaRenderer(canvas, edit, input.composition); await renderer.render(frame); });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'media-edit.mp4'; a.click(); } finally { renderer?.destroy(); }
    }, input);
    const file = await (await pending).path(); const seconds = (performance.now() - start) / 1000;
    const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
    assert.deepEqual([info.streams[0].codec_name, info.streams[0].width, info.streams[0].height, info.streams[0].nb_frames, info.streams[1].codec_name, info.format.duration], ['h264', 1080, 1920, '450', 'aac', '15.000000']);
    const expected = Buffer.concat(previews.output.slice(0, 3).map(png => execFileSync(ffmpeg.path, ['-v', 'error', '-i', 'pipe:0', '-vf', 'scale=54:96', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { input: Buffer.from(png.split(',')[1], 'base64') })));
    const actual = execFileSync(ffmpeg.path, ['-v', 'error', '-i', file, '-vf', "select='eq(n,60)+eq(n,108)+eq(n,150)',scale=54:96", '-vsync', '0', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
    assert.equal(actual.length, expected.length); const error = actual.reduce((sum, value, i) => sum + Math.abs(value - expected[i]), 0) / actual.length;
    assert.ok(error < 15, `preview/export error ${error}`); t.diagnostic(`export ${seconds.toFixed(2)} s; preview/export RGB error ${error.toFixed(2)}/255`);
  } finally { await browser.close(); await server.close(); }
});
