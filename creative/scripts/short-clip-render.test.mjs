import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { launchChromium } from './support/chromium.mjs';

/** The cloud's frame page draws as many frames as the clip is long: a short song's card ends with it, a 15-second card is as before. */
const card = (extra = {}) => ({
  style: 'filter', font: 'Anton', fontSecondary: 'Oswald', layout: { rotate: 0, scaleBias: 1, cut: 0, seed: 7 },
  cues: [{ text: 'end', startMs: 11_000, endMs: 12_300 }], music: null, fallbackText: '', lyrics: true,
  typeStyle: 'stack', photoUrl: '/punch-plates/burnnet-woman-1547507-1920.jpg', ...extra,
});

test('a card of a 12.3-second clip has 369 frames; one that says no length has 450', { timeout: 180000 }, async (t) => {
  const chrome = await launchChromium();
  if (!chrome) return t.skip('no Chromium installed');
  const site = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await site.listen();
  try {
    const page = await chrome.newPage();
    await page.goto(`${site.resolvedUrls.local[0]}render.html`);
    await page.waitForFunction(() => 'mumooPack' in window, null, { timeout: 60000 });
    const prepared = await page.evaluate(opts => window.mumooPack.prepare(opts), card({ durationMs: 12_300 }));
    assert.equal(prepared.frames, 369);
    assert.ok((await page.evaluate(() => window.mumooPack.frame(368))).length > 1000, 'the last frame is drawn');
    await assert.rejects(page.evaluate(() => window.mumooPack.frame(369)), /Invalid frame index/);
    assert.equal((await page.evaluate(opts => window.mumooPack.prepare(opts), card())).frames, 450);
  } finally {
    await chrome.close();
    await site.close();
  }
});
