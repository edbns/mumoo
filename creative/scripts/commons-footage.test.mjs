import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import ffprobe from '@ffprobe-installer/ffprobe';

test('public-domain source video decodes and exports through the automatic timeline', { timeout: 240000, skip: process.env.MUMOO_COMMONS_TEST !== '1' || process.platform !== 'darwin' }, async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' }); await server.listen();
  const browser = await chromium.launch({ headless: false, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try { const page = await browser.newPage({ acceptDownloads: true }); await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/export.html`);
    const input = { clip: { sourceSha256: 'a'.repeat(64), offsetMs: 0, durationMs: 15000 }, composition: { version: 2, template: 'scribble', sourceSha256: 'a'.repeat(64), clipStartMs: 0, cues: [] }, plan: { version: 1, status: 'ready', durationMs: 15000,
      assets: [{ id: 'commons-190973326', type: 'video', assetUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/2c/NASA_Experiment_to_Track_Space_%E2%80%98Doughnut%E2%80%99_Encircling_Earth_%28SVS15011_-_ISS_RENA_Magnetic_Field%29.webm', title: 'Earth', status: 'approved', commercialUseEligible: true }, { id: 'commons-190973390', type: 'video', assetUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/ae/NASA_Experiment_to_Track_Space_%E2%80%98Doughnut%E2%80%99_Encircling_Earth_%28SVS15011_-_video_linear%29.webm', title: 'Space', status: 'approved', commercialUseEligible: true }],
      shots: [{ assetId: 'commons-190973326', startMs: 0, endMs: 7200, transition: 'cut' }, { assetId: 'commons-190973390', startMs: 7200, endMs: 15000, transition: 'dissolve' }] } };
    const download = page.waitForEvent('download', { timeout: 230000 });
    const report = await page.evaluate(async input => { const totalStart = performance.now(); const { directorEdit } = await import('/src/media-timeline.ts'); const { createMediaRenderer } = await import('/src/media-renderer.ts'); const { renderMp4 } = await import('/src/browser-export.ts');
      const stages = {}; const measure = (name, ms) => { const value = stages[name] ??= { count: 0, totalMs: 0, maxMs: 0 }; value.count++; value.totalMs += ms; value.maxMs = Math.max(value.maxMs, ms); };
      const edit = directorEdit(input.clip, input.plan); const audio = new AudioBuffer({ length: 15 * 48000, numberOfChannels: 1, sampleRate: 48000 }); let renderer;
      try { const blob = await renderMp4(input.composition, audio, () => {}, async (canvas, frame) => { renderer ??= await createMediaRenderer(canvas, edit, input.composition, measure); await renderer.render(frame); }, measure); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'commons-test.mp4'; link.click();
        return { totalMs: performance.now() - totalStart, stages, resources: performance.getEntriesByType('resource').filter(entry => entry.name.startsWith('https://upload.wikimedia.org/')).map(entry => ({ durationMs: entry.duration, transferBytes: entry.transferSize, decodedBytes: entry.decodedBodySize })) }; } finally { renderer?.destroy(); }
    }, input);
    const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', await (await download).path()]));
    assert.deepEqual([info.streams[0].codec_name, info.streams[0].nb_frames, info.streams[1].codec_name, info.format.duration], ['h264', '450', 'aac', '15.000000']);
    t.diagnostic(JSON.stringify(report));
  } finally { await browser.close(); await server.close(); }
});
