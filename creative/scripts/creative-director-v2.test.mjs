import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { realpathSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const ffprobe = require('@ffprobe-installer/ffprobe');
const fixtureDir = join(process.cwd(), 'scripts/fixtures');
const audioPath = join(fixtureDir, 'excerpt-15s.wav');
const footageA = join(fixtureDir, 'direction-a.mp4');
const footageB = join(fixtureDir, 'direction-b.mp4');
const outDir = join(fixtureDir, 'exports');

const clip = { sourceSha256: 'a'.repeat(64), offsetMs: 0, durationMs: 15000 };
const composition = { version: 2, template: 'scribble', sourceSha256: clip.sourceSha256, clipStartMs: 0, cues: [] };

function plan(seed, shots, motionIntensity) {
  const assets = shots.map((shot, i) => ({ id: `pixabay-${i + 1}`, type: 'video', title: `Direction footage ${i + 1}`, rights: 'STAGING_TEST_ONLY', adSafety: 'REVIEW_REQUIRED' }));
  return {
    version: 1, status: 'ready', scope: 'staging-test-only', durationMs: 15000, assets,
    executionPlan: {
      version: 2, clipSha256: 'b'.repeat(64), fps: 30, durationFrames: 450, seed,
      lyrics: { source: 'none' },
      motion: motionIntensity.map(([startFrame, endFrame, intensity]) => ({ startFrame, endFrame, intensity })),
      shots,
    },
  };
}

test('Creative Director 2.0 exports two genuinely different measured compositions', {
  timeout: 900000,
  skip: process.env.MUMOO_DIRECTOR_V2 !== '1' || !existsSync(audioPath) || !existsSync(footageA) || !existsSync(footageB),
}, async t => {
  const { chromium } = await import('playwright');
  mkdirSync(outDir, { recursive: true });
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  const timings = {};
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/export.html`);
    await page.evaluate(() => {
      for (const id of ['footage-a', 'footage-b', 'audio']) {
        const input = document.createElement('input'); input.type = 'file'; input.id = id; document.body.append(input);
      }
    });
    await page.locator('#footage-a').setInputFiles(footageA);
    await page.locator('#footage-b').setInputFiles(footageB);
    await page.locator('#audio').setInputFiles(audioPath);

    // Kinetic landscape motion vs restrained vertical atmosphere — different cuts, motion, source windows.
    const restrained = plan(22, [
      { assetId: 'pixabay-1', startFrame: 0, endFrame: 225, sourceInMs: 0, sourceOutMs: 7500, transition: { type: 'cut', durationFrames: 0 }, crop: { mode: 'cover', x: 0.5, y: 0.45 } },
      { assetId: 'pixabay-2', startFrame: 225, endFrame: 450, sourceInMs: 2500, sourceOutMs: 10000, transition: { type: 'dissolve', durationFrames: 12 }, crop: { mode: 'cover', x: 0.5, y: 0.5 } },
    ], [[0, 450, 0.15]]);
    const kinetic = plan(11, [
      { assetId: 'pixabay-1', startFrame: 0, endFrame: 180, sourceInMs: 800, sourceOutMs: 6800, transition: { type: 'cut', durationFrames: 0 }, crop: { mode: 'cover', x: 0.52, y: 0.48 } },
      { assetId: 'pixabay-2', startFrame: 180, endFrame: 450, sourceInMs: 1200, sourceOutMs: 10200, transition: { type: 'cut', durationFrames: 0 }, crop: { mode: 'cover', x: 0.48, y: 0.42 } },
    ], [[0, 150, 0.9], [150, 450, 0.75]]);

    const payload = { kinetic, restrained, clip, composition };
    const previewStart = performance.now();
    const previews = await page.evaluate(async input => {
      const { directorExecutionEdit } = await import('/src/director-plan.ts');
      const { createPixiDirectorRenderer } = await import('/src/pixi-director.ts');
      const { inspectVisualFootage } = await import('/src/visual-footage.ts');
      const a = URL.createObjectURL(document.querySelector('#footage-a').files[0]);
      const b = URL.createObjectURL(document.querySelector('#footage-b').files[0]);
      const loaded = new Map([['pixabay-1', a], ['pixabay-2', b]]);
      const measures = {
        a: await inspectVisualFootage(a, new AbortController().signal),
        b: await inspectVisualFootage(b, new AbortController().signal),
      };
      const result = [];
      for (const blueprint of [input.kinetic, input.restrained]) {
        const edit = directorExecutionEdit(input.clip, blueprint, loaded, input.composition, 'b'.repeat(64));
        const canvas = document.createElement('canvas');
        const scene = await createPixiDirectorRenderer(canvas, edit, input.composition);
        const images = [];
        try {
          for (const frame of [0, 90, 180, 270, 360, 449]) {
            await scene.render(frame);
            images.push(canvas.toDataURL());
          }
          result.push({ images, seed: edit.seed, shots: edit.shots.map(s => ({ assetId: s.assetId, sourceInMs: s.sourceInMs, transition: s.transition.type })) });
        } finally { scene.destroy(); }
      }
      URL.revokeObjectURL(a); URL.revokeObjectURL(b);
      return { result, measures };
    }, payload);
    timings.previewMs = Math.round(performance.now() - previewStart);

    assert.notEqual(previews.result[0].images[0], previews.result[1].images[0], 'opening frames must differ across directions');
    assert.notEqual(previews.result[0].images[2], previews.result[1].images[2], 'mid frames must differ across directions');
    assert.notDeepEqual(previews.result[0].shots, previews.result[1].shots);
    assert.ok(previews.measures.a.length >= 2 && previews.measures.b.length >= 2);
    t.diagnostic(`Measured ${previews.measures.a.length}+${previews.measures.b.length} frame samples; mean motion A=${(previews.measures.a.reduce((s, x) => s + x.motionScore, 0) / previews.measures.a.length).toFixed(3)} B=${(previews.measures.b.reduce((s, x) => s + x.motionScore, 0) / previews.measures.b.length).toFixed(3)}`);

    const exports = [];
    for (const [index, name] of [['kinetic', payload.kinetic], ['restrained', payload.restrained]].entries()) {
      const waiting = page.waitForEvent('download', { timeout: 260000 });
      const started = performance.now();
      await page.evaluate(async input => {
        const { directorExecutionEdit } = await import('/src/director-plan.ts');
        const { createPixiDirectorRenderer } = await import('/src/pixi-director.ts');
        const { renderMp4 } = await import('/src/browser-export.ts');
        const a = URL.createObjectURL(document.querySelector('#footage-a').files[0]);
        const b = URL.createObjectURL(document.querySelector('#footage-b').files[0]);
        const edit = directorExecutionEdit(input.clip, input.blueprint, new Map([['pixabay-1', a], ['pixabay-2', b]]), input.composition, 'b'.repeat(64));
        const audioFile = document.querySelector('#audio').files[0];
        const context = new AudioContext();
        const audio = await context.decodeAudioData(await audioFile.arrayBuffer());
        await context.close();
        let renderer;
        try {
          const output = await renderMp4(input.composition, audio, () => {}, async (canvas, frame) => {
            renderer ??= await createPixiDirectorRenderer(canvas, edit, input.composition);
            await renderer.render(frame);
          });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(output);
          link.download = input.name;
          link.click();
        } finally {
          renderer?.destroy();
          URL.revokeObjectURL(a); URL.revokeObjectURL(b);
        }
      }, { blueprint: name[1], name: `mumoo-director-v2-${name[0]}.mp4`, clip: payload.clip, composition: payload.composition });
      const download = await waiting;
      const path = await download.path();
      const seconds = (performance.now() - started) / 1000;
      const dest = join(outDir, `mumoo-director-v2-${name[0]}.mp4`);
      writeFileSync(dest, readFileSync(path));
      const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', dest]));
      const video = info.streams.find(s => s.codec_type === 'video');
      const audio = info.streams.find(s => s.codec_type === 'audio');
      assert.deepEqual([video.codec_name, video.width, video.height, video.nb_frames, video.r_frame_rate, audio.codec_name, info.format.duration], ['h264', 1080, 1920, '450', '30/1', 'aac', '15.000000']);
      const sourceAudio = execFileSync(ffmpeg.path, ['-v', 'error', '-i', audioPath, '-t', '15', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-']);
      const exportedAudio = execFileSync(ffmpeg.path, ['-v', 'error', '-i', dest, '-t', '15', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-']);
      const samples = Math.min(sourceAudio.length, exportedAudio.length) / 4;
      let dot = 0, a2 = 0, b2 = 0;
      for (let j = 0; j < samples; j++) {
        const a = sourceAudio.readFloatLE(j * 4), b = exportedAudio.readFloatLE(j * 4);
        dot += a * b; a2 += a * a; b2 += b * b;
      }
      const correlation = dot / Math.sqrt(a2 * b2);
      assert.ok(correlation > 0.9, `${name[0]} audio correlation ${correlation}`);
      exports.push({ name: name[0], path: dest, seconds, correlation, bytes: Number(info.format.size) });
      t.diagnostic(`${name[0]}: ${seconds.toFixed(2)}s export, ${(Number(info.format.size) / 1024 / 1024).toFixed(2)} MiB, audio correlation ${correlation.toFixed(4)}`);
      timings[`export_${name[0]}_s`] = Number(seconds.toFixed(2));
    }

    assert.notEqual(exports[0].path, exports[1].path);
    writeFileSync(join(outDir, 'performance.json'), JSON.stringify({
      previewMs: timings.previewMs,
      exports,
      measures: {
        a: previews.measures.a.map(({ offsetMs, meanLuma, contrast, motionScore, edgeDensity, aspectFit }) => ({ offsetMs, meanLuma, contrast, motionScore, edgeDensity, aspectFit })),
        b: previews.measures.b.map(({ offsetMs, meanLuma, contrast, motionScore, edgeDensity, aspectFit }) => ({ offsetMs, meanLuma, contrast, motionScore, edgeDensity, aspectFit })),
      },
      note: 'Rendered with authorized local fixtures representing Pixabay/owned access. Vimeo discovery remains metadata-first when API download is absent.',
    }, null, 2));
    t.diagnostic(`Preview sampling ${timings.previewMs} ms; wrote ${outDir}`);
  } finally {
    await browser.close();
    await server.close();
  }
});
