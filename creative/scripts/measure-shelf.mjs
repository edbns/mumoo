// Measures the shelf on the real library (links from the staging database, pictures streamed from storage): how long until every card is
// drawn, how much is downloaded, and how smoothly each named card plays. Opens Brave on this Mac and takes a few minutes.
//   node --env-file=.env.local scripts/measure-shelf.mjs Techno "Broken Screen,Directed"      (ALL plays every card; PLAY_MS sets how long)
import { openProduct, lyricsResult, songWav } from './support/product-flow.mjs';

const genre = process.argv[2] ?? 'Techno';
const templates = (process.argv[3] ?? 'Directed').split(',');
const playMs = Number(process.env.PLAY_MS ?? 8000);
const lib = await import('../netlify/lib/library.mjs');
const library = await lib.listApproved();
console.log('library', library.length);

const app = await openProduct({ lyrics: () => lyricsResult('we keep on running back to you every night the city calls my name hold me close until the morning') });
const { page } = app;
const born = Date.now();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
const urls = new Map();
let bytes = 0, requests = 0;
cdp.on('Network.requestWillBeSent', e => { if (e.request.url.includes('r2.cloudflarestorage.com')) { urls.set(e.requestId, e.request.url); requests++; } });
cdp.on('Network.dataReceived', e => { if (urls.has(e.requestId)) bytes += e.encodedDataLength || e.dataLength; });
const mb = () => (bytes / 1e6).toFixed(1);
page.on('crash', () => console.log('PAGE CRASHED'));
page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 160)); });
await page.route('**/api/library', route => route.fulfill({ json: { items: library } }));
{
  // The local build, served under the staging site's own name: storage then answers this page exactly as it will answer the staging site.
  const local = new URL(page.url()).origin;
  const site = 'https://mumoo-staging.netlify.app';
  await page.route(`${site}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/') || url.pathname.startsWith('/test-media/')) return route.fallback();
    const response = await route.fetch({ url: local + url.pathname + url.search }).catch(() => null);
    return response ? route.fulfill({ response }) : route.abort();
  });
  await page.goto(`${site}/`);
}
try {
  await page.addStyleTag({ content: '[data-slot=cookie-consent]{display:none!important}' });
  await page.locator('input[type=file]').first().setInputFiles({ name: 'song.wav', mimeType: 'audio/wav', buffer: songWav(20) });
  const style = page.getByRole('combobox', { name: 'What kind of music is it?' });
  await style.fill(genre);
  await page.getByRole('option', { name: genre, exact: true }).click();
  await page.locator('main.desktop').getByRole('button', { name: /^(Continue|Get my free video)$/ }).click();
  await page.getByRole('heading', { name: 'Pick your clip' }).waitFor();
  await page.getByRole('button', { name: 'Find the lyrics for me' }).click();
  await page.locator('.lyrics-editor').waitFor({ timeout: 30000 });
  const shelfAt = Date.now();
  await page.locator('.step-actions').getByRole('button', { name: 'Continue' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.creatives-pack-card').length > 0, null, { timeout: 60000 });
  const firstAt = await page.waitForFunction(() => document.querySelectorAll('.creatives-pack-card:not(.pending)').length > 0, null, { timeout: 900000 }).then(() => Date.now());
  console.log(`first card painted after ${((firstAt - shelfAt) / 1000).toFixed(1)} s, ${mb()} MB so far`);
  await page.waitForFunction(() => !document.querySelector('.creatives-pack-card.pending'), null, { timeout: 900000 });
  const cards = await page.locator('.creatives-pack-card').count();
  console.log(`shelf of ${cards} cards painted after ${((Date.now() - shelfAt) / 1000).toFixed(1)} s: ${requests} requests, ${mb()} MB downloaded`);
  await page.getByRole('button', { name: /^Play .+ creative$/ }).first().waitFor({ timeout: 30000 });
  console.log(`shelf on screen after ${((Date.now() - shelfAt) / 1000).toFixed(1)} s`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/measure-shelf.png', fullPage: false });
  const names = templates[0] === 'ALL' ? [...new Set(await page.$$eval('button[aria-label^="Play "][aria-label$=" creative"]', bs => bs.map(b => b.getAttribute('aria-label').slice(5, -9))))] : templates;
  for (const name of names) {
    const button = page.getByRole('button', { name: `Play ${name} creative` }).first();
    if (!(await button.count())) { console.log(name, 'no card'); continue; }
    const before = bytes;
    const pressed = Date.now();
    await button.click();
    // The card reads its first pictures before music and pictures start together.
    await page.getByRole('button', { name: `Pause ${name} creative` }).first().and(page.locator(':not([aria-busy=true])')).waitFor({ timeout: 30000 });
    const waitedMs = Date.now() - pressed;
    const result = await page.evaluate(async ([label, ms]) => {
      const card = [...document.querySelectorAll('.creatives-pack-card')].find(c => c.querySelector(`button[aria-label="Play ${label} creative"], button[aria-label="Pause ${label} creative"]`));
      const canvas = card.querySelector('canvas');
      const probe = document.createElement('canvas'); probe.width = 24; probe.height = 40;
      const ctx = probe.getContext('2d', { willReadFrequently: true });
      let last = '', changes = 0, frames = 0, longest = 0, lastChange = performance.now(), firstChange = 0;
      const start = performance.now();
      const perSecond = [];
      let bucket = 0, bucketStart = start;
      while (performance.now() - start < ms) {
        await new Promise(r => requestAnimationFrame(r));
        frames++;
        ctx.drawImage(canvas, 0, 0, 24, 40);
        const d = ctx.getImageData(0, 0, 24, 40).data;
        let h = 0;
        for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0;
        const now = performance.now();
        if (String(h) !== last) { changes++; bucket++; if (changes === 2) firstChange = now - start; longest = Math.max(longest, now - lastChange); lastChange = now; last = String(h); }
        if (now - bucketStart >= 1000) { perSecond.push(bucket); bucket = 0; bucketStart = now; }
      }
      return { fps: +(changes / (ms / 1000)).toFixed(1), raf: +(frames / (ms / 1000)).toFixed(1), firstMoveMs: Math.round(firstChange), longestStallMs: Math.round(longest), perSecond: perSecond.join(' ') };
    }, [name, playMs]);
    console.log(name.padEnd(16), `starts after ${waitedMs} ms | moving frames/s ${result.fps} (page ${result.raf}) | first movement after ${result.firstMoveMs} ms | longest freeze ${result.longestStallMs} ms | per second: ${result.perSecond} | +${((bytes - before) / 1e6).toFixed(1)} MB`);
    await page.locator('.creatives-pack-card', { has: page.getByRole('button', { name: `Pause ${name} creative` }) }).first().screenshot({ path: `/tmp/measure-card-${name.replace(/ /g, '-')}.png` }).catch(() => undefined);
    await page.getByRole('button', { name: `Pause ${name} creative` }).first().click().catch(() => undefined);
    await page.waitForTimeout(800);
  }
  const heap = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6));
  console.log(`total downloaded ${mb()} MB, page heap ${heap} MB, ${Math.round((Date.now() - born) / 1000)} s; errors`, app.errors.slice(0, 5));
} finally {
  await app.close();
}
