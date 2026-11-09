import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createFileServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './support/chromium.mjs';

/**
 * The page draws a person's own picture from a signed storage link. In the browser that link used to be shown
 * in an <img> first (a thumbnail), which put an answer without CORS headers in the cache, and the renderer's
 * own request for the same link then failed: every card stayed black. This runs the real renderer in headless
 * Chromium against a stand-in for storage that answers like Cloudflare R2 (CORS headers only when the request
 * has an Origin, `Vary: Origin`, ETag and Last-Modified, no Cache-Control, a bare 304 on revalidation). Skipped where no Chromium is installed.
 * It also draws a Riso card from a person's own photo and its cut-out, a card of Our photography from one of its baked effects, which the page loads from the site,
 * and Window cards of every kind of picture.
 */
const PHOTO = readFileSync('public/punch-plates/burnnet-woman-1547507-1920.jpg');
const CUTOUT = readFileSync('public/punch-plates/burnnet-woman-1547507-1920.cut.png');

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
    const body = request.url?.startsWith('/cutout') ? CUTOUT : PHOTO;
    response.writeHead(request.url?.startsWith('/missing') ? 403 : 200, {
      ...common,
      'Content-Type': body === CUTOUT ? 'image/png' : 'image/jpeg',
      'Content-Length': body.length,
      'Accept-Ranges': 'bytes',
      ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    });
    response.end(body);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

const browser = launchChromium;

/** Draws frame 30 of a card in the page and returns how bright it is (0 black … 255 white). */
function frameBrightness(page, cardOpts) {
  return page.evaluate(async (card) => {
    const pack = window.mumooPack;
    await pack.prepare(card);
    const jpeg = await pack.frame(30);
    const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${jpeg}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
    return sum / (data.length / 4) / 3;
  }, cardOpts);
}

const opts = (photoUrl) => ({
  style: 'filter', font: 'Anton', fontSecondary: 'Oswald', layout: { rotate: 0, scaleBias: 1, cut: 0, seed: 7 },
  cues: [], music: null, fallbackText: '', lyrics: false,
  typeStyle: 'stack', photoUrl,
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
    const brightness = (link) => frameBrightness(page, opts(link));

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

test('an Our photography card draws its baked effect from the site, and never the effect together with a picture of the person\'s own', { timeout: 180000 }, async (t) => {
  const chrome = await browser();
  if (!chrome) return t.skip('no Chromium installed');
  const site = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await site.listen();
  try {
    const page = await chrome.newPage();
    // The site serves the effects from public/ once they are published; here they are read from where they are committed.
    await page.route('**/punch-plates/effects/*.jpg', route => route.fulfill({ path: `punch-plates/effects/${new URL(route.request().url()).pathname.split('/').pop()}` }));
    await page.goto(`${site.resolvedUrls.local[0]}render.html`);
    await page.waitForFunction(() => 'mumooPack' in window, null, { timeout: 60000 });
    const card = (effectId) => ({ ...opts(undefined), effectId });
    const dark = await frameBrightness(page, card('tropical-ascii-cam-1'));
    const light = await frameBrightness(page, card('impression-trail-9'));
    assert.ok(dark > 5, `the dark effect is drawn, not black (${dark})`);
    assert.ok(light > dark + 40, `two effects look different: ${dark} against ${light}`);

    const files = await storage();
    try {
      await assert.rejects(frameBrightness(page, { ...card('impression-trail-9'), photoUrl: `${files.url}/own.jpg` }), /not both/);
    } finally {
      files.server.close();
    }
  } finally {
    await chrome.close();
    await site.close();
  }
});

test('a Riso card draws a person\'s own photo and its cut-out from storage, and refuses a photo without its cut-out', { timeout: 180000 }, async (t) => {
  const chrome = await browser();
  if (!chrome) return t.skip('no Chromium installed');
  const files = await storage();
  const site = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await site.listen();
  try {
    const page = await chrome.newPage();
    await page.goto(`${site.resolvedUrls.local[0]}render.html`);
    await page.waitForFunction(() => 'mumooPack' in window, null, { timeout: 60000 });
    const riso = (extra) => ({ ...opts(undefined), style: 'riso', typeStyle: undefined, inkSet: 'pink-blue', ...extra });
    const own = { photoUrl: `${files.url}/own.jpg?signature=1`, cutoutUrl: `${files.url}/cutout.png?signature=1` };
    // Paper is light and the person is inked on it: a drawn card is bright, not black.
    assert.ok(await frameBrightness(page, riso(own)) > 100, 'the card shows the photo on paper, not black');
    await assert.rejects(frameBrightness(page, riso({ photoUrl: own.photoUrl })), /cut-out/);
    await assert.rejects(frameBrightness(page, riso({ ...own, inkSet: undefined })), /ink set/);
  } finally {
    await chrome.close();
    await site.close();
    files.server.close();
  }
});

test('a Window card draws our photo, a person\'s own photo with and without her in front, our effect and our background, and refuses every other combination', { timeout: 240000 }, async (t) => {
  const chrome = await browser();
  if (!chrome) return t.skip('no Chromium installed');
  const files = await storage();
  const site = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await site.listen();
  try {
    const { WINDOW_PALETTES } = await site.ssrLoadModule('/src/window-look.ts');
    const { default: bank } = await site.ssrLoadModule('/src/look-lab/bank.json');
    const ids = WINDOW_PALETTES.map(palette => palette.id);
    const page = await chrome.newPage();
    // The site serves the baked effects and backgrounds from public/ once they are published; here they are read from where they are committed.
    await page.route('**/punch-plates/effects/*.jpg', route => route.fulfill({ path: `punch-plates/effects/${new URL(route.request().url()).pathname.split('/').pop()}` }));
    await page.route('**/punch-plates/looks/*.jpg', route => route.fulfill({ path: `punch-plates/looks/${new URL(route.request().url()).pathname.split('/').pop()}` }));
    await page.goto(`${site.resolvedUrls.local[0]}render.html`);
    await page.waitForFunction(() => 'mumooPack' in window, null, { timeout: 60000 });
    const card = (extra) => ({ ...opts(undefined), style: 'window', typeStyle: undefined, fallbackText: 'HELLO', lyrics: true, font: 'Anton', fontSecondary: 'Anton', windowMode: 'plain', windowPalette: 'black', windowAllowed: ids, ...extra });
    const own = { photoUrl: `${files.url}/own.jpg?signature=1`, cutoutUrl: `${files.url}/cutout.png?signature=1` };
    const woman = 'burnnet-woman-1547507-1920';
    const brightness = palette => [1, 3, 5].reduce((sum, at) => sum + parseInt(palette.screen.slice(at, at + 2), 16), 0);
    const light = WINDOW_PALETTES.reduce((best, palette) => (brightness(palette) > brightness(best) ? palette : best)).id;

    const black = await frameBrightness(page, card({ plateId: woman }));
    assert.ok(black > 2, `our photo shows through the word, not black (${black})`);
    assert.ok(await frameBrightness(page, card({ plateId: woman, windowPalette: light })) > black + 40, 'the screen colour is what is drawn around the word');
    assert.ok(await frameBrightness(page, card({ windowMode: 'plain', photoUrl: own.photoUrl, cutoutUrl: undefined })) > 2, 'a person\'s own photo, plain');
    assert.ok(await frameBrightness(page, card({ windowMode: 'person', ...own })) > 2, 'a person\'s own photo with her in front');
    assert.ok(await frameBrightness(page, card({ windowMode: 'person', plateId: woman })) > 2, 'our woman in front of the word');
    assert.ok(await frameBrightness(page, card({ windowMode: 'effect', effectId: 'tropical-ascii-cam-1' })) > 2, 'one of our effects in the letters');
    assert.ok(await frameBrightness(page, card({ windowMode: 'bank', bankId: bank[0].slug })) > 2, 'one of our backgrounds in the letters');

    // A mistake in a card is an error, never a picture drawn around it.
    await assert.rejects(frameBrightness(page, card({ windowMode: 'person', photoUrl: own.photoUrl })), /cut-out/, 'her in front needs her cut-out');
    await assert.rejects(frameBrightness(page, card({ windowMode: 'person', motionUrl: `${files.url}/own.mp4` })), /not a video/, 'nobody stands in front of a video');
    await assert.rejects(frameBrightness(page, card({ windowMode: 'effect', effectId: 'tropical-ascii-cam-1', photoUrl: own.photoUrl })), /exactly one picture/, 'an effect is never mixed with the person\'s own photo');
    await assert.rejects(frameBrightness(page, card({ windowMode: 'effect', plateId: woman })), /exactly one picture/, 'an effect card must name an effect');
    await assert.rejects(frameBrightness(page, card({ windowMode: 'plain', plateId: woman, bankId: bank[0].slug })), /exactly one picture/);
    await assert.rejects(frameBrightness(page, card({ windowMode: 'plain' })), /exactly one picture/, 'no picture at all');
    await assert.rejects(frameBrightness(page, card({ plateId: woman, windowPalette: undefined })), /screen colour/);
    await assert.rejects(frameBrightness(page, card({ plateId: woman, windowPalette: 'chartreuse-ish' })), /no such screen colour/);
    await assert.rejects(frameBrightness(page, card({ plateId: woman, windowAllowed: undefined })), /screen colour/);
  } finally {
    await chrome.close();
    await site.close();
    files.server.close();
  }
});
