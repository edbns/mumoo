import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createFileServer } from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

/**
 * The page draws a person's own picture from a signed storage link. In the browser that link used to be shown
 * in an <img> first (a thumbnail), which put an answer without CORS headers in the cache, and the renderer's
 * own request for the same link then failed: every card stayed black. This runs the real renderer in headless
 * Chromium against a stand-in for storage that answers like Cloudflare R2 (CORS headers only when the request
 * has an Origin, `Vary: Origin`, ETag and Last-Modified, no Cache-Control, a bare 304 on revalidation). Skipped where no Chromium is installed.
 */
const PHOTO = readFileSync('public/punch-plates/burnnet-woman-1547507-1920.jpg');

function storage() {
  const server = createFileServer((request, response) => {
    const origin = request.headers.origin;
    const common = { ETag: '"photo"', 'Last-Modified': 'Mon, 09 Nov 2026 08:00:00 GMT', Vary: 'Origin' };
    // R2 answers a revalidation of what an <img> cached with a bare 304, which carries no CORS headers.
    if (request.headers['if-none-match'] === '"photo"') {
      response.writeHead(304, common);
      response.end();
      return;
    }
    response.writeHead(request.url?.startsWith('/missing') ? 403 : 200, {
      ...common,
      'Content-Type': 'image/jpeg',
      'Content-Length': PHOTO.length,
      'Accept-Ranges': 'bytes',
      ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    });
    response.end(PHOTO);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

/** Whichever headless Chromium Playwright has installed (its revision need not be the one this Playwright asks for). */
function installedChromium() {
  const caches = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), platform() === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright')];
  for (const cache of caches.filter(path => path && existsSync(path))) {
    for (const folder of readdirSync(cache).filter(name => name.startsWith('chromium_headless_shell-'))) {
      for (const build of readdirSync(join(cache, folder)).filter(name => name.startsWith('chrome-headless-shell-'))) {
        const executable = join(cache, folder, build, 'chrome-headless-shell');
        if (existsSync(executable)) return executable;
      }
    }
  }
  return null;
}

async function browser() {
  const executablePath = installedChromium();
  if (!executablePath) return null;
  return chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

const opts = (photoUrl) => ({
  style: 'filter', font: 'Anton', fontSecondary: 'Oswald', layout: { rotate: 0, scaleBias: 1, cut: 0, seed: 7 },
  cues: [], music: null, fallbackText: '', lyrics: false, colors: { ground: '#101010', dust: '#ff4d2e' },
  filter: 'duotone', typeStyle: 'stack', photoUrl,
});

test('a picture shown in an <img> first can still be drawn, and one that cannot be loaded fails loudly', { timeout: 180000 }, async (t) => {
  const chrome = await browser();
  if (!chrome) return t.skip('no Chromium installed');
  const files = await storage();
  const site = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await site.listen();
  try {
    const page = await chrome.newPage();
    await page.goto(`${site.resolvedUrls.local[0]}render.html`);
    await page.waitForFunction(() => 'mumooPack' in window, null, { timeout: 60000 });
    const brightness = (link) => page.evaluate(async (picture) => {
      const pack = window.mumooPack;
      await pack.prepare(picture.opts);
      const jpeg = await pack.frame(30);
      const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${jpeg}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
      return sum / (data.length / 4) / 3;
    }, { opts: opts(link) });

    const link = `${files.url}/own.jpg?signature=1`;
    await page.evaluate(src => new Promise(resolve => { const img = new Image(); img.onload = img.onerror = resolve; img.src = src; document.body.append(img); }), link);
    assert.ok(await brightness(link) > 20, 'the card shows the picture, not black');

    await assert.rejects(brightness(`${files.url}/missing.jpg`), /The photo could not be loaded \(403\)/);
  } finally {
    await chrome.close();
    await site.close();
    files.server.close();
  }
});

test('a photo is shrunk to a small JPEG, and transparent parts turn white rather than black', { timeout: 180000 }, async (t) => {
  const chrome = await browser();
  if (!chrome) return t.skip('no Chromium installed');
  const site = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await site.listen();
  try {
    const page = await chrome.newPage();
    await page.goto(`${site.resolvedUrls.local[0]}render.html`);
    await page.addScriptTag({ type: 'module', content: "import { shrinkPhoto, LONG_SIDE } from '/src/photo-shrink.ts'; Object.assign(window, { shrinkPhoto, LONG_SIDE });" });
    await page.waitForFunction(() => 'shrinkPhoto' in window, null, { timeout: 60000 });
    const result = await page.evaluate(async () => {
      // A 4000 x 3000 PNG: a red square in one corner, everything else transparent.
      const source = new OffscreenCanvas(4000, 3000);
      const painter = source.getContext('2d');
      painter.fillStyle = '#f00';
      painter.fillRect(0, 0, 400, 400);
      const jpeg = await window.shrinkPhoto(await source.convertToBlob({ type: 'image/png' }));
      const bitmap = await createImageBitmap(jpeg);
      const read = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      read.drawImage(bitmap, 0, 0);
      return { type: jpeg.type, bytes: jpeg.size, width: bitmap.width, height: bitmap.height, limit: window.LONG_SIDE, empty: [...read.getImageData(bitmap.width - 5, bitmap.height - 5, 1, 1).data], red: [...read.getImageData(20, 20, 1, 1).data] };
    });
    assert.equal(result.type, 'image/jpeg');
    assert.equal(result.width, result.limit);
    assert.equal(result.height, result.limit * 3 / 4);
    assert.ok(result.bytes < 200_000, `small enough to send quickly, got ${result.bytes}`);
    assert.ok(result.empty.slice(0, 3).every(channel => channel > 240), `transparent turns white, got ${result.empty}`);
    assert.ok(result.red[0] > 200 && result.red[1] < 60, `the picture itself is kept, got ${result.red}`);
  } finally {
    await chrome.close();
    await site.close();
  }
});
