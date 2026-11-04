import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import ffprobe from '@ffprobe-installer/ffprobe';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

test('Pixi WebGL proof renders deterministic sampled frames', { timeout: 60000 }, async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  await server.warmupRequest('/src/pixi-proof/scene.ts');
  const browser = await chromium.launch({ headless: process.env.MUMOO_HEADED !== '1', ...(process.env.MUMOO_HEADED === '1' ? { executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' } : {}) });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/export.html`);
    const frames = await page.evaluate(async () => {
      const { createEditorialScene } = await import('/src/pixi-proof/scene.ts');
      const canvas = document.createElement('canvas'); document.body.append(canvas);
      const scene = await createEditorialScene(canvas, null, 1);
      await scene.render(94); const first = canvas.toDataURL();
      await scene.render(120); const second = canvas.toDataURL();
      await scene.render(94); const repeat = canvas.toDataURL();
      scene.destroy(); return { first, second, repeat };
    });
    assert.ok(frames.first === frames.repeat, 'repeated frames must match');
    assert.ok(frames.first !== frames.second, 'different frames must differ');
  } finally { await browser.close(); await server.close(); }
});

test('editorial treatments have distinct reproducible parameters', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  try {
    const { editorialLook } = await server.ssrLoadModule('/src/pixi-proof/looks.ts');
    assert.equal(new Set([0, 1, 2].map(seed => JSON.stringify(editorialLook(seed)))).size, 3);
    assert.deepEqual(editorialLook(1), editorialLook(1));
    assert.throws(() => editorialLook(-1));
  } finally { await server.close(); }
});

test('three editorial treatments render distinct repeatable frames', { timeout: 60000, skip: process.env.MUMOO_HEADED !== '1' || process.platform !== 'darwin' }, async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen(); await server.warmupRequest('/src/pixi-proof/scene.ts');
  const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try {
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/export.html`);
    const result = await page.evaluate(async () => {
      const { createEditorialScene } = await import('/src/pixi-proof/scene.ts');
      const output = [];
      for (const seed of [0, 1, 2, 0]) {
        const canvas = document.createElement('canvas');
        const scene = await createEditorialScene(canvas, null, seed, false);
        await scene.render(60); output.push(canvas.toDataURL()); scene.destroy();
      }
      return { distinct: new Set(output.slice(0, 3)).size, repeat: output[0] === output[3] };
    });
    assert.equal(result.distinct, 3); assert.equal(result.repeat, true);
  } finally { await browser.close(); await server.close(); }
});

test('supplied footage supports deterministic nonzero frame seeks', { timeout: 60000, skip: !process.env.MUMOO_FOOTAGE_FIXTURE }, async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen(); await server.warmupRequest('/src/pixi-proof/scene.ts');
  const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/export.html`);
    await page.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.id = 'fixture'; document.body.append(input); });
    await page.locator('#fixture').setInputFiles(process.env.MUMOO_FOOTAGE_FIXTURE);
    const result = await page.evaluate(async () => {
      const { createEditorialScene } = await import('/src/pixi-proof/scene.ts');
      const canvas = document.createElement('canvas');
      const scene = await createEditorialScene(canvas, null, 1, true, undefined, URL.createObjectURL(document.querySelector('#fixture').files[0]));
      try {
        await scene.render(30); const first = canvas.toDataURL();
        await scene.render(150); const later = canvas.toDataURL();
        await scene.render(30); return { different: first !== later, same: first === canvas.toDataURL() };
      } finally { scene.destroy(); }
    });
    assert.equal(result.different, true); assert.equal(result.same, true);
  } finally { await browser.close(); await server.close(); }
});

test('supplied footage exports through existing MP4 pipeline', { timeout: 120000, skip: !process.env.MUMOO_FOOTAGE_FIXTURE }, async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen(); await server.warmupRequest('/src/pixi-proof/scene.ts'); await server.warmupRequest('/src/browser-export.ts');
  const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/export.html`);
    await page.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.id = 'fixture'; document.body.append(input); });
    await page.locator('#fixture').setInputFiles(process.env.MUMOO_FOOTAGE_FIXTURE);
    const download = page.waitForEvent('download', { timeout: 110000 });
    const start = performance.now();
    await page.evaluate(async () => {
      const { renderMp4 } = await import('/src/browser-export.ts');
      const { createEditorialScene } = await import('/src/pixi-proof/scene.ts');
      const audio = new AudioBuffer({ length: 18 * 48000, numberOfChannels: 1, sampleRate: 48000 });
      const composition = { version: 2, template: 'scribble', sourceSha256: 'a'.repeat(64), clipStartMs: 1000, cues: [{ text: 'hello', startMs: 2000, endMs: 2500 }] };
      let scene;
      try {
        const blob = await renderMp4(composition, audio, () => {}, async (canvas, frame) => {
          scene ??= await createEditorialScene(canvas, null, 1, true, composition, URL.createObjectURL(document.querySelector('#fixture').files[0]));
          await scene.render(frame);
        });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'footage-test.mp4'; a.click();
      } finally { scene?.destroy(); }
    });
    const file = await (await download).path();
    const exportSeconds = (performance.now() - start) / 1000;
    const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
    assert.deepEqual([info.streams[0].codec_name, info.streams[0].width, info.streams[0].height, info.streams[0].nb_frames, info.streams[1].codec_name, info.format.duration], ['h264', 1080, 1920, '450', 'aac', '15.000000']);
    const pngs = await page.evaluate(async () => {
      const { createEditorialScene } = await import('/src/pixi-proof/scene.ts');
      const canvas = document.createElement('canvas');
      const composition = { version: 2, template: 'scribble', sourceSha256: 'a'.repeat(64), clipStartMs: 1000, cues: [{ text: 'hello', startMs: 2000, endMs: 2500 }] };
      const scene = await createEditorialScene(canvas, null, 1, true, composition, URL.createObjectURL(document.querySelector('#fixture').files[0]));
      try { const output = []; for (const n of [30, 60, 150]) { await scene.render(n); output.push(canvas.toDataURL().split(',')[1]); } return output; }
      finally { scene.destroy(); }
    });
    const expected = Buffer.concat(pngs.map(png => execFileSync(ffmpeg.path, ['-v', 'error', '-i', 'pipe:0', '-vf', 'scale=54:96', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { input: Buffer.from(png, 'base64') })));
    const actual = execFileSync(ffmpeg.path, ['-v', 'error', '-i', file, '-vf', "select='eq(n,30)+eq(n,60)+eq(n,150)',scale=54:96", '-vsync', '0', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
    assert.equal(actual.length, expected.length);
    const difference = actual.reduce((sum, v, index) => sum + Math.abs(v - expected[index]), 0) / actual.length;
    assert.ok(difference < 12, `Footage preview/export mean RGB error: ${difference}`);
    t.diagnostic(`Footage preview/export mean RGB error: ${difference.toFixed(2)}/255`);
    t.diagnostic(`Footage export seconds: ${exportSeconds.toFixed(2)}`);
  } finally { await browser.close(); await server.close(); }
});

test('Pixi proof uses supplied word timings for the lyric overlay', { timeout: 60000 }, async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen(); await server.warmupRequest('/src/pixi-proof/scene.ts');
  const browser = await chromium.launch({ headless: process.env.MUMOO_HEADED !== '1', ...(process.env.MUMOO_HEADED === '1' ? { executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' } : {}) });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/export.html`);
    const difference = await page.evaluate(async () => {
      const { createEditorialScene } = await import('/src/pixi-proof/scene.ts');
      const canvas = document.createElement('canvas');
      const cue = { version: 2, template: 'scribble', sourceSha256: 'a'.repeat(64), clipStartMs: 0, cues: [{ text: 'hello', startMs: 1000, endMs: 2000 }] };
      const scene = await createEditorialScene(canvas, null, 1, false, cue);
      await scene.render(45); const withLyric = canvas.toDataURL();
      const canvas2 = document.createElement('canvas');
      const without = await createEditorialScene(canvas2, null, 1, false);
      await without.render(45); const withoutLyric = canvas2.toDataURL(); without.destroy(); scene.destroy();
      return withLyric !== withoutLyric;
    });
    assert.ok(difference, 'an active lyric cue should change the rendered frame');
  } finally { await browser.close(); await server.close(); }
});

test('Pixi video scene can be encoded by the browser MP4 exporter', { timeout: 240000 }, async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  await server.warmupRequest('/src/pixi-proof/scene.ts');
  await server.warmupRequest('/src/browser-export.ts');
  const browser = await chromium.launch({ headless: process.env.MUMOO_HEADED !== '1', ...(process.env.MUMOO_HEADED === '1' ? { executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' } : {}) });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/export.html`);
    const download = page.waitForEvent('download', { timeout: 220000 });
    const started = performance.now();
    await page.evaluate(async () => {
      const { renderMp4 } = await import('/src/browser-export.ts');
      const { createEditorialScene } = await import('/src/pixi-proof/scene.ts');
      const audio = new AudioBuffer({ length: 18 * 48000, numberOfChannels: 1, sampleRate: 48000 });
      const samples = audio.getChannelData(0);
      for (let n = 0; n < 480; n++) samples[3 * 48000 + n] = 0.9 * Math.sin(n * Math.PI / 8);
      const composition = { version: 2, template: 'scribble', sourceSha256: 'a'.repeat(64), clipStartMs: 1000, cues: [{ text: 'hello', startMs: 2000, endMs: 2500 }] };
      let scene;
      try {
        const blob = await renderMp4(composition, audio, () => {}, async (canvas, frame) => {
          scene ??= await createEditorialScene(canvas, null, 1, true, composition);
          await scene.render(frame);
        });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pixi-test.mp4'; a.click();
      } finally { scene?.destroy(); }
    });
    const file = await (await download).path();
    const exportSeconds = (performance.now() - started) / 1000;
    const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
    assert.deepEqual([info.streams[0].codec_name, info.streams[0].width, info.streams[0].height, info.streams[0].nb_frames, info.streams[1].codec_name, info.format.duration], ['h264', 1080, 1920, '450', 'aac', '15.000000']);
    const pcm = execFileSync(ffmpeg.path, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], { maxBuffer: 2000000 });
    const first = pcm.findIndex((_, index) => index % 2 === 0 && Math.abs(pcm.readInt16LE(index)) > 9000);
    assert.ok(first >= 0 && Math.abs(first / 2 / 48000 - 2) < 0.01, 'selected audio marker must remain at 2 seconds');
    const previewPngs = await page.evaluate(async () => {
      const { createEditorialScene } = await import('/src/pixi-proof/scene.ts');
      const canvas = document.createElement('canvas');
      const composition = { version: 2, template: 'scribble', sourceSha256: 'a'.repeat(64), clipStartMs: 1000, cues: [{ text: 'hello', startMs: 2000, endMs: 2500 }] };
      const scene = await createEditorialScene(canvas, null, 1, true, composition);
      try {
        const frames = [];
        for (const frame of [60, 90, 210]) { await scene.render(frame); frames.push(canvas.toDataURL().split(',')[1]); }
        return frames;
      } finally { scene.destroy(); }
    });
    const expected = Buffer.concat(previewPngs.map(png => execFileSync(ffmpeg.path, ['-v', 'error', '-i', 'pipe:0', '-vf', 'scale=54:96', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { input: Buffer.from(png, 'base64') })));
    const actual = execFileSync(ffmpeg.path, ['-v', 'error', '-i', file, '-vf', "select='eq(n,60)+eq(n,90)+eq(n,210)',scale=54:96", '-vsync', '0', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
    assert.equal(actual.length, expected.length);
    const meanError = actual.reduce((sum, value, index) => sum + Math.abs(value - expected[index]), 0) / actual.length;
    assert.ok(meanError < 12, `preview/export mean RGB error ${meanError}`);
    t.diagnostic(`Preview/export mean RGB error: ${meanError.toFixed(2)}/255`);
    t.diagnostic(`Browser export seconds: ${exportSeconds.toFixed(2)}`);
  } finally { await browser.close(); await server.close(); }
});
