import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

/** An RGBA image made of horizontal bands: [[r,g,b], rows]. */
function bands(...parts) {
  const out = [];
  for (const [[r, g, b], rows] of parts) for (let i = 0; i < rows * 20; i++) out.push(r, g, b, 255);
  return Uint8ClampedArray.from(out);
}

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'error' });
  return { server, mod: await server.ssrLoadModule('/src/cover-palette.ts') };
}

test('a cover becomes brightness, colour and warmth numbers', async () => {
  const { server, mod } = await load();
  try {
    const sunset = mod.describePixels(bands([[240, 90, 30], 6], [[250, 190, 40], 4]));
    assert.ok(sunset.warmth > 0.95, 'orange and yellow are warm');
    assert.ok(sunset.hue < 70 && sunset.hue >= 0);
    assert.ok(sunset.saturation > 0.7);
    assert.equal(sunset.palette.length, 2);
    assert.equal(sunset.palette[0].hex, '#f05a1e');
    assert.ok(Math.abs(sunset.palette.reduce((n, c) => n + c.share, 0) - 1) < 0.01);

    const night = mod.describePixels(bands([[20, 20, 80], 8], [[110, 40, 190], 2]));
    assert.ok(night.warmth < 0.1, 'navy and purple are cool');
    assert.ok(night.hue > 220 && night.hue < 290);
    assert.ok(night.lightness < 0.25, 'dark cover');

    const poster = mod.describePixels(bands([[0, 0, 0], 5], [[255, 255, 255], 5]));
    assert.equal(poster.hue, null, 'black and white has no hue');
    assert.equal(poster.warmth, 0.5);
    assert.ok(poster.contrast > 0.95 && poster.saturation === 0);

    const flat = mod.describePixels(bands([[128, 128, 128], 10]));
    assert.equal(flat.contrast, 0);
    assert.equal(flat.palette.length, 1);
  } finally { await server.close(); }
});

test('the same pixels always give the same read, and a tiny or empty image gives none', async () => {
  const { server, mod } = await load();
  try {
    const pixels = bands([[200, 30, 90], 3], [[30, 160, 200], 3], [[240, 230, 60], 3]);
    assert.deepEqual(mod.describePixels(pixels), mod.describePixels(pixels));
    assert.equal(mod.describePixels(new Uint8ClampedArray(16)), null);
    assert.equal(mod.describePixels(Uint8ClampedArray.from({ length: 4 * 200 }, (_, i) => (i % 4 === 3 ? 0 : 255))), null, 'transparent pixels are ignored');
    assert.equal(await mod.describeCover(null), null);
  } finally { await server.close(); }
});
