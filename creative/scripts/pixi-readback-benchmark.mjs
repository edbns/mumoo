import { chromium } from 'playwright';
import { createServer } from 'vite';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen(); await server.warmupRequest('/src/pixi-proof/scene.ts');
const browser = await chromium.launch({ headless: process.env.MUMOO_HEADED !== '1', ...(process.env.MUMOO_HEADED === '1' ? { executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' } : {}) });
try {
  const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/export.html`);
  const report = await page.evaluate(async () => {
    const { createEditorialScene } = await import('/src/pixi-proof/scene.ts');
    const canvas = document.createElement('canvas');
    const scene = await createEditorialScene(canvas, null, 1, false);
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable';
    const pixels = new Uint8Array(1080 * 1920 * 4);
    let finishMs = 0, readMs = 0, frameMs = 0, renderMs = 0;
    for (let i = 0; i < 30; i++) {
      const a = performance.now(); await scene.render(i); const b = performance.now();
      gl.finish(); const c = performance.now();
      gl.readPixels(0, 0, 1080, 1920, gl.RGBA, gl.UNSIGNED_BYTE, pixels); const d = performance.now();
      const frame = new VideoFrame(canvas, { timestamp: i * 33333 }); frame.close(); const e = performance.now();
      renderMs += b - a; finishMs += c - b; readMs += d - c; frameMs += e - d;
    }
    scene.destroy(); return { renderer, renderMs, finishMs, readPixelsMs: readMs, videoFrameCreationMs: frameMs };
  });
  console.log(JSON.stringify(report));
} finally { await browser.close(); await server.close(); }
