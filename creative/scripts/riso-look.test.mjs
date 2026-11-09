import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  return { server, look: await server.ssrLoadModule('/src/riso-look.ts') };
}

test('every ink set has its own id, two inks, and an unknown id is an error', async () => {
  const { server, look } = await load();
  try {
    assert.equal(look.RISO_INK_SETS.length, 4);
    assert.equal(new Set(look.RISO_INK_SETS.map(set => set.id)).size, 4, 'every set has its own id');
    for (const set of look.RISO_INK_SETS) {
      assert.ok(set.inks.length >= 2 && set.inks.every(ink => /^#[0-9a-f]{6}$/.test(ink)));
      assert.equal(look.risoInkSetById(set.id), set);
    }
    assert.throws(() => look.risoInkSetById('not-a-set'), /not-a-set/, 'an unknown set is an error, not a stand-in');
  } finally { await server.close(); }
});

test('a word is stamped in the same place every time, inside the limits', async () => {
  const { server, look } = await load();
  try {
    for (let index = 0; index < 200; index++) {
      const place = look.placeWord(7, index, 2);
      assert.deepEqual(place, look.placeWord(7, index, 2), 'same seed and index, same place');
      assert.ok(place.size >= look.WORD_SIZE_MIN && place.size <= look.WORD_SIZE_MAX);
      assert.ok(Math.abs(place.rotation) <= (25 * Math.PI) / 180 + 1e-9);
      assert.ok(place.u >= 0 && place.u < 1 && place.v >= 0 && place.v <= 1);
      assert.ok(place.ink === 0 || place.ink === 1);
    }
    assert.notDeepEqual(look.placeWord(7, 3, 2), look.placeWord(8, 3, 2), 'another seed scatters differently');
  } finally { await server.close(); }
});

test('the page is wiped after a phrase and every four bars, and holds at most fourteen words', async () => {
  const { server, look } = await load();
  try {
    const cues = Array.from({ length: 40 }, (_, i) => ({ text: 'x', startMs: i * 200, endMs: i * 200 + 150 }));
    cues.push({ text: 'y', startMs: 9000, endMs: 9100 });
    const downbeats = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000];
    const breaks = look.pageBreaks(cues, downbeats);
    assert.deepEqual(breaks, [4000, 7950, 8000]);
    assert.equal(look.pageAt(cues, breaks, 3900).words.length, look.MAX_WORDS, 'a long page keeps the newest fourteen');
    const after = look.pageAt(cues, breaks, 4100);
    assert.ok(after.words.every(index => cues[index].startMs >= 4000), 'a wiped page starts empty');
    assert.ok(after.wiping && after.wiping.progress < 1, 'the old page is still being wiped');
    assert.equal(look.pageAt(cues, breaks, 4000 + look.WIPE_MS).wiping, null, 'the wipe is over');
  } finally { await server.close(); }
});

test('the layers slip on a beat harder on a downbeat, and settle back', async () => {
  const { server, look } = await load();
  try {
    const beats = [0, 500, 1000, 1500];
    const downbeats = [0, 1500];
    // How far the layer is from where it would sit with no beats at all.
    const slip = (ms, ink) => {
      const [x, y] = look.misregistration(3, ink, ms, beats, downbeats);
      const [restX, restY] = look.misregistration(3, ink, ms, [], []);
      return Math.hypot(x - restX, y - restY);
    };
    assert.ok(slip(1530, 0) > slip(1030, 0), 'a downbeat throws the layer further than a plain beat');
    assert.ok(slip(1530, 0) > slip(1900, 0), 'it settles back');
    assert.deepEqual(look.misregistration(3, 1, 1530, beats, downbeats), look.misregistration(3, 1, 1530, beats, downbeats), 'a pure function of the clock');
  } finally { await server.close(); }
});
