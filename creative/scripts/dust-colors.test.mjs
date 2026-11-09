import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  return { server, colors: await server.ssrLoadModule('/src/dust-colors.ts') };
}

test('every dust pair reads at phone size and is never just black and white', async () => {
  const { server, colors } = await load();
  try {
    const seen = new Set();
    for (let seed = 0; seed < 400; seed++) {
      const pair = colors.dustColors(seed);
      assert.match(pair.ground, /^#[0-9a-f]{6}$/);
      assert.match(pair.dust, /^#[0-9a-f]{6}$/);
      assert.ok(colors.contrast(pair.ground, pair.dust) >= 5, `seed ${seed}: ${pair.ground} / ${pair.dust}`);
      assert.notEqual(pair.ground, '#000000');
      assert.notEqual(pair.dust, '#ffffff');
      seen.add(`${pair.ground}${pair.dust}`);
    }
    assert.ok(seen.size > 300, 'seeds give plenty of different pairs');
    assert.deepEqual(colors.dustColors(5), colors.dustColors(5), 'same seed, same pair');
  } finally { await server.close(); }
});

test('a pinned hue keeps the ground on that hue', async () => {
  const { server, colors } = await load();
  try {
    for (const hue of [0, 120, 240]) {
      const { ground } = colors.dustColors(3, hue);
      const [r, g, b] = colors.hexToRgb(ground);
      const dominant = ['r', 'g', 'b'][[r, g, b].indexOf(Math.max(r, g, b))];
      assert.equal(dominant, hue === 0 ? 'r' : hue === 120 ? 'g' : 'b');
    }
  } finally { await server.close(); }
});
