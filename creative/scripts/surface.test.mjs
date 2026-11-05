import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import ffprobe from '@ffprobe-installer/ffprobe';

const clip = { sourceSha256: 'a'.repeat(64), offsetMs: 1000, durationMs: 15000 };
const timeline = { version: 1, clip, beatsMs: [1000, 3000], onsetsMs: [1000], energy: [{ timeMs: 0, rms: 0.2, centroidHz: 1000 }, { timeMs: 1000, rms: 0.3, centroidHz: 1000 }], tempo: { status: 'ambiguous', bpm: 120, alternativesBpm: [60] } };
const composition = { version: 2, template: 'scribble', sourceSha256: 'a'.repeat(64), clipStartMs: 1000, cues: [{ text: 'Test lyric', startMs: 2000, endMs: 3000 }] };

test('signal adapter is deterministic, bounded, event-based, and distinguishes silence from fallback', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  try {
    const { createMusicSignalAdapter } = await server.ssrLoadModule('/src/visual-signals/adapter.ts');
    const signal = createMusicSignalAdapter(timeline, { recoveryMs: 420 });
    assert.deepEqual(signal(30), signal(30));
    assert.equal(signal(0).beat, 0); assert.ok(signal(30).beat > signal(45).beat);
    assert.ok(signal(30).transient > signal(36).transient);
    assert.equal(signal(30).source, 'analysis');
    for (let n = 0; n < 450; n++) for (const value of [signal(n).beat, signal(n).transient, signal(n).energy]) assert.ok(value >= 0 && value <= 1);
    const fallback = createMusicSignalAdapter(null, { recoveryMs: 420 });
    assert.equal(fallback(36).source, 'fallback'); assert.ok(fallback(36).beat > 0);
    const silent = createMusicSignalAdapter({ ...timeline, beatsMs: [], onsetsMs: [], energy: [{ timeMs: 0, rms: 0, centroidHz: 0 }] }, { recoveryMs: 420 });
    assert.deepEqual(silent(36), { beat: 0, transient: 0, energy: 0, source: 'analysis' });
  } finally { await server.close(); }
});

test('surface renders deterministic event response and real MP4 with matching preview frames', { timeout: 150000, skip: process.env.MUMOO_HEADED !== '1' || process.platform !== 'darwin' }, async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    page.on('pageerror', error => console.error('Browser error:', error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/export.html`);
    const frames = await page.evaluate(async ({ composition, timeline }) => {
      const { createSurfaceScene } = await import('/src/pixi-surface/scene.ts');
      const canvas = document.createElement('canvas');
      const scene = await createSurfaceScene(canvas, timeline, 7, composition, '/pixi-proof/night-window.png');
      try {
        const values = [];
        for (const frame of [0, 30, 45, 60, 30]) { await scene.render(frame); values.push(canvas.toDataURL()); }
        return { values, compatibility: scene.compatibility };
      } finally { scene.destroy(); }
    }, { composition, timeline });
    assert.equal(frames.values[1], frames.values[4]); assert.notEqual(frames.values[0], frames.values[1]);
    assert.notEqual(frames.values[1], frames.values[2]); assert.notEqual(frames.values[2], frames.values[3]);
    assert.equal(frames.compatibility, 'hardware');
    const contrasts = await page.evaluate(async ({ composition, timeline }) => {
      const { createSurfaceScene } = await import('/src/pixi-surface/scene.ts');
      const output = [];
      for (const [data, cue] of [[timeline, composition], [{ ...timeline, beatsMs: [], onsetsMs: [] }, composition], [timeline, { ...composition, cues: [] }]]) {
        const canvas = document.createElement('canvas');
        const scene = await createSurfaceScene(canvas, data, 7, cue, '/pixi-proof/night-window.png');
        try { await scene.render(output.length === 2 ? 60 : 30); output.push(canvas.toDataURL()); } finally { scene.destroy(); }
      }
      return output;
    }, { composition, timeline });
    assert.notEqual(contrasts[0], contrasts[1], 'real beat/onset events must affect pixels at the same frame');
    assert.notEqual(frames.values[3], contrasts[2], 'active lyric must render independently over the surface');
    const parameterResponse = await page.evaluate(async ({ composition, timeline }) => {
      const { createSurfaceScene, DEFAULT_SURFACE_PARAMETERS } = await import('/src/pixi-surface/scene.ts');
      const output = [];
      for (const displacementStrength of [0, 1]) {
        const canvas = document.createElement('canvas');
        const scene = await createSurfaceScene(canvas, timeline, 7, composition, '/pixi-proof/night-window.png', { ...DEFAULT_SURFACE_PARAMETERS, displacementStrength });
        try { await scene.render(30); output.push(canvas.toDataURL()); } finally { scene.destroy(); }
      }
      return output[0] !== output[1];
    }, { composition, timeline });
    assert.equal(parameterResponse, true, 'displacement parameter must alter event pixels');
    const pending = page.waitForEvent('download', { timeout: 140000 });
    const start = performance.now();
    await page.evaluate(async ({ composition, timeline }) => {
      const { createSurfaceScene } = await import('/src/pixi-surface/scene.ts');
      const { renderMp4 } = await import('/src/browser-export.ts');
      const audio = new AudioBuffer({ length: 17 * 48000, numberOfChannels: 1, sampleRate: 48000 });
      const sample = audio.getChannelData(0); for (let n = 0; n < 480; n++) sample[3 * 48000 + n] = 0.8 * Math.sin(n * Math.PI / 8);
      let scene;
      try {
        const blob = await renderMp4(composition, audio, () => {}, async (canvas, frame) => {
          scene ??= await createSurfaceScene(canvas, timeline, 7, composition, '/pixi-proof/night-window.png');
          await scene.render(frame);
        });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'surface.mp4'; a.click();
      } finally { scene?.destroy(); }
    }, { composition, timeline });
    const file = await (await pending).path();
    const elapsed = (performance.now() - start) / 1000;
    const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
    assert.deepEqual([info.streams[0].codec_name, info.streams[0].width, info.streams[0].height, info.streams[0].nb_frames, info.streams[1].codec_name, info.format.duration], ['h264', 1080, 1920, '450', 'aac', '15.000000']);
    const preview = Buffer.concat([1, 2, 3].map(i => execFileSync(ffmpeg.path, ['-v', 'error', '-i', 'pipe:0', '-vf', 'scale=54:96', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { input: Buffer.from(frames.values[i].split(',')[1], 'base64') })));
    const encoded = execFileSync(ffmpeg.path, ['-v', 'error', '-i', file, '-vf', "select='eq(n,30)+eq(n,45)+eq(n,60)',scale=54:96", '-vsync', '0', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
    assert.equal(preview.length, encoded.length);
    const error = encoded.reduce((sum, x, i) => sum + Math.abs(x - preview[i]), 0) / encoded.length;
    assert.ok(error < 12, `Preview/export error ${error}`);
    const pcm = execFileSync(ffmpeg.path, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], { maxBuffer: 2000000 });
    const marker = pcm.findIndex((_, index) => index % 2 === 0 && Math.abs(pcm.readInt16LE(index)) > 9000);
    assert.ok(marker >= 0 && Math.abs(marker / 2 / 48000 - 2) < 0.01);
    t.diagnostic(`export ${elapsed.toFixed(2)} s; sampled preview/export RGB difference ${error.toFixed(2)}/255; ${frames.compatibility} WebGL`);
  } finally { await browser.close(); await server.close(); }
});
