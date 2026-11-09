import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { planCuts, sourceMsAt } = await server.ssrLoadModule('/src/pack-cuts.ts');
await server.close();

const BEATS = Array.from({ length: 30 }, (_, i) => 500 + i * 480); // 125 bpm
const SHOTS = [[0, 4000], [4000, 5500], [5500, 12000], [12000, 14000]];

test('the same inputs make the same edit', () => {
  assert.deepEqual(planCuts(SHOTS, BEATS, 41, 15000), planCuts(SHOTS, BEATS, 41, 15000));
});

test('the four cards of a row are cut four different ways', () => {
  const edits = [0, 1, 2, 3].map(index => JSON.stringify(planCuts(SHOTS, BEATS, 1000 * 4 + index, 15000)));
  assert.equal(new Set(edits).size, 4);
});

test('cuts land on beats, never closer than a third of a second', () => {
  for (const seed of [0, 1, 2, 3, 7]) {
    const cuts = planCuts(SHOTS, BEATS, seed, 15000);
    assert.equal(cuts[0].atMs, 0);
    for (const [i, cut] of cuts.entries()) {
      if (i > 0) assert.ok(BEATS.includes(cut.atMs), `cut at ${cut.atMs}`);
      if (i > 0) assert.ok(cut.atMs - cuts[i - 1].atMs >= 350);
    }
  }
});

test('every moment of the song comes from inside the video', () => {
  for (const seed of [0, 1, 2, 3]) {
    const cuts = planCuts(SHOTS, BEATS, seed, 15000);
    for (let ms = 0; ms < 15000; ms += 33) {
      const at = sourceMsAt(cuts, ms);
      assert.ok(at >= 0 && at < 14000, `${at}`);
    }
  }
});

test('a piece plays at natural speed from where it starts', () => {
  const cuts = planCuts(SHOTS, BEATS, 5, 15000);
  const cut = cuts[1];
  const at = sourceMsAt(cuts, cut.atMs);
  assert.equal(at, cut.fromMs);
  assert.equal(sourceMsAt(cuts, cut.atMs + 100), cut.startMs + ((cut.fromMs - cut.startMs + 100) % (cut.endMs - cut.startMs)));
});

test('a GIF that is one shot is still cut into several pieces', () => {
  const cuts = planCuts([[0, 6000]], BEATS, 2, 15000);
  const pieces = new Set(cuts.map(cut => `${cut.startMs}-${cut.endMs}`));
  assert.ok(pieces.size >= 4);
});

test('no beats still cuts, once a second', () => {
  assert.equal(planCuts(SHOTS, [], 0, 15000).length, 15);
});
