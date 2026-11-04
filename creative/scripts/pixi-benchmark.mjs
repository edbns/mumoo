import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
await server.warmupRequest('/src/pixi-proof/scene.ts');
await server.warmupRequest('/src/pixi-proof/benchmark-support.ts');
const browser = await chromium.launch({ headless: process.env.MUMOO_HEADED !== '1', ...(process.env.MUMOO_HEADED === '1' ? { executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' } : {}) });
try {
  const page = await browser.newPage();
  page.on('console', message => { if (message.text().startsWith('BENCH ')) console.log(message.text()); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/export.html`);
  const result = await page.evaluate(async () => {
    const { createEditorialScene } = await import('/src/pixi-proof/scene.ts');
    const { draw, loadFont } = await import('/src/render.ts');
    const { Output, BufferTarget, CanvasSource, Mp4OutputFormat } = await import('/src/pixi-proof/benchmark-support.ts');
    await loadFont('test');
    const reports = [];
    for (const mode of ['canvas', 'pixi-no-video', 'pixi-video']) {
      for (const count of [30, 90, 150]) {
        const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
        const initStart = performance.now();
        const scene = mode === 'canvas' ? null : await createEditorialScene(canvas, null, 1, mode === 'pixi-video');
        const initializationMs = performance.now() - initStart;
        const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
        const track = new CanvasSource(canvas, { codec: 'avc', bitrate: 5000000 });
        output.addVideoTrack(track, { frameRate: 30 }); await output.start();
        let seekMs = 0, evaluationMs = 0, renderMs = 0, addMs = 0;
        const start = performance.now();
        for (let frame = 0; frame < count; frame++) {
          if (scene) { const times = await scene.render(frame); seekMs += times.seekMs; evaluationMs += times.evaluationMs; renderMs += times.renderMs; }
          else { const before = performance.now(); draw(canvas, { version: 2, template: 'scribble', sourceSha256: 'a'.repeat(64), clipStartMs: 0, cues: [{ text: 'test', startMs: 0, endMs: 15000 }] }, frame); renderMs += performance.now() - before; }
          const before = performance.now(); await track.add(frame / 30, 1 / 30); addMs += performance.now() - before;
        }
        const processingMs = performance.now() - start; const finalizeStart = performance.now(); track.close(); await output.finalize();
        const report = { mode, count, initializationMs, processingMs, seekMs, evaluationMs, renderMs, canvasCaptureAndEncodeMs: addMs, finalizeMs: performance.now() - finalizeStart, heapBytes: performance.memory?.usedJSHeapSize ?? null };
        reports.push(report); console.log('BENCH ' + JSON.stringify(report));
        scene?.destroy();
      }
    }
    return reports;
  });
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); await server.close(); }
