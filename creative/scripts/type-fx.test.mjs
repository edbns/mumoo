import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' });
  return {
    server,
    fx: await server.ssrLoadModule('/src/lyric-fx.ts'),
    type: await server.ssrLoadModule('/src/pack-type.ts'),
    pack: await server.ssrLoadModule('/src/creatives-pack.ts'),
    catalog: await server.ssrLoadModule('/src/font-catalog.ts'),
  };
}

const FRAME_MS = 1000 / 30;
const piece = (over = {}) => ({
  ms: 5000, ageMs: 1500, exitMs: null, index: 1, count: 5, ordinal: 3, word: 1, line: 0, size: 150, seed: 4242,
  beat: 0, beatIndex: 3, energy: 0.6, active: false, buzz: false, ...over,
});
const ages = Array.from({ length: 70 }, (_, i) => Math.round(-100 + i * FRAME_MS));

test('motion is a pure function of its inputs: same input, same frame, in any order, with no clock or dice behind it', async () => {
  const { server, fx } = await load();
  try {
    const source = readFileSync('src/lyric-fx.ts', 'utf8');
    assert.ok(!/Math\.random|Date\.now|performance\.now/.test(source));
    for (const style of fx.FX_STYLES) {
      const forward = ages.map(ageMs => fx.FX[style](piece({ ageMs, ms: 3000 + ageMs, beat: ageMs > 0 ? 0.5 : 0 })));
      const backward = [...ages].reverse().map(ageMs => fx.FX[style](piece({ ageMs, ms: 3000 + ageMs, beat: ageMs > 0 ? 0.5 : 0 }))).reverse();
      assert.deepEqual(forward, backward, style);
      assert.deepEqual(fx.FX[style](piece({ seed: 9 })), fx.FX[style](piece({ seed: 9 })));
    }
    assert.equal(fx.hash01(7, 1, 2, 3), fx.hash01(7, 1, 2, 3));
    assert.notEqual(fx.hash01(7, 1, 2, 3), fx.hash01(8, 1, 2, 3));
  } finally { await server.close(); }
});

test('every motion comes to rest on the plain word, and nothing shows before its word is sung', async () => {
  const { server, fx } = await load();
  try {
    for (const style of fx.FX_STYLES) {
      const rest = fx.FX[style](piece({ ageMs: 2500, ms: 7500 }));
      assert.equal(rest.alpha, 1, `${style} is not solid at rest`);
      assert.ok(rest.sx > 0.97 && rest.sx < 1.06 && rest.sy > 0.97 && rest.sy < 1.06, `${style} rests at ${rest.sx}×${rest.sy}`);
      assert.ok(Math.abs(rest.rot) < 0.05, `${style} rests tilted by ${rest.rot}`);
      assert.ok(Math.abs(rest.x) <= 0.1 * 150 && Math.abs(rest.y) <= 0.1 * 150, `${style} rests off its place`);
      const ink = rest.layers.filter(layer => layer.tone === 'ink' && layer.alpha === 1);
      assert.ok(ink.length >= 1, `${style} has no solid ink layer`);
      for (const layer of ink) assert.ok(Math.abs(layer.dx) < 1e-9 && Math.abs(layer.dy) < 1e-9, `${style} layer rests off its place`);
      // Not sung yet: invisible (the wave keeps the upcoming words as a quiet ghost).
      const before = fx.FX[style](piece({ ageMs: -300 }));
      if (style === 'wave') assert.ok(before.alpha > 0 && before.alpha < 0.5);
      else assert.equal(before.alpha, 0, `${style} shows an unsung word`);
    }
    // The single-word styles let the word they replace leave completely within the time the painter allows.
    for (const style of ['zoom', 'echo']) {
      assert.ok(fx.FX[style](piece({ exitMs: fx.EXIT_MS })).alpha <= 0.01, `${style} is still there after ${fx.EXIT_MS} ms`);
      assert.ok(fx.FX[style](piece({ exitMs: 10 })).alpha > 0.5, `${style} left at once`);
    }
  } finally { await server.close(); }
});

test('the beat moves things but never flashes them: opacity does not depend on it', async () => {
  const { server, fx } = await load();
  try {
    for (const style of fx.FX_STYLES) {
      for (const ageMs of ages) {
        const quiet = fx.FX[style](piece({ ageMs, beat: 0 }));
        const loud = fx.FX[style](piece({ ageMs, beat: 1, energy: 1 }));
        assert.equal(quiet.alpha, loud.alpha, `${style} at ${ageMs} ms fades with the beat`);
      }
    }
  } finally { await server.close(); }
});

test('nothing flickers more than twice, and flickers are far enough apart that a second never holds more than three flashes', async () => {
  const { server, fx } = await load();
  try {
    const dips = alphas => alphas.reduce((count, alpha, i) => count + (alpha < 0.6 && i > 0 && alphas[i - 1] >= 0.6 ? 1 : 0), 0);
    const series = (style, buzz) => Array.from({ length: 90 }, (_, i) => fx.FX[style](piece({ ageMs: i * FRAME_MS, buzz })).alpha);
    for (const style of fx.FX_STYLES) assert.equal(dips(series(style, style === 'flicker')) <= 2, true, style);
    for (const style of fx.FX_STYLES.filter(name => name !== 'flicker')) assert.equal(dips(series(style, true)), 0, `${style} dips`);
    assert.equal(dips(series('flicker', true)), 2, 'a flickering word flickers twice');
    assert.equal(dips(series('flicker', false)), 0, 'the others only fade in');

    // A lyric with a word every 120 ms: count every dip of every word in each second.
    const starts = Array.from({ length: 120 }, (_, i) => i * 120);
    const buzzing = [...fx.buzzingWords(starts)];
    assert.ok(buzzing.length >= 2);
    const events = buzzing.flatMap(index => {
      const flicker = Array.from({ length: 30 }, (_, i) => fx.FX.flicker(piece({ ageMs: i * FRAME_MS, buzz: true })).alpha);
      return flicker.flatMap((alpha, i) => (alpha < 0.6 && flicker[i - 1] >= 0.6 ? [starts[index] + i * FRAME_MS] : []));
    });
    for (const at of events) assert.ok(events.filter(other => other >= at && other < at + 1000).length <= 3, `more than three flashes from ${at} ms`);
    for (let i = 1; i < buzzing.length; i++) assert.ok(starts[buzzing[i]] - starts[buzzing[i - 1]] >= fx.BUZZ_GAP_MS);
    assert.deepEqual([...fx.buzzingWords([])], []);
    assert.ok(fx.BUZZ_DIM >= 0.25, 'a dip, never a blackout');
  } finally { await server.close(); }
});

test('letters move one after another, words each their own way, and a card\'s seed decides its dice', async () => {
  const { server, fx } = await load();
  try {
    for (const style of fx.FX_STYLES.filter(name => fx.FX_TRAITS[name].unit === 'letter' && name !== 'wave')) {
      const [first, second, third] = [0, 1, 2].map(index => JSON.stringify(fx.FX[style](piece({ ageMs: 150, index }))));
      assert.ok(new Set([first, second, third]).size === 3, `${style} moves its letters together`);
    }
    const scatter = seed => JSON.stringify(fx.FX.scatter(piece({ ageMs: 120, seed })));
    assert.equal(scatter(11), scatter(11));
    assert.notEqual(scatter(11), scatter(12), 'two cards scatter alike');
    const boil = word => JSON.stringify(fx.FX.jitter(piece({ word, ms: 5000 })));
    assert.notEqual(boil(1), boil(2), 'two words wobble alike');
    assert.notEqual(JSON.stringify(fx.FX.jitter(piece({ ms: 5000 }))), JSON.stringify(fx.FX.jitter(piece({ ms: 5200 }))), 'the boil never moves');
  } finally { await server.close(); }
});

const LANE_SONGS = [
  ['Gospel', 'praise the lord'],
  ['Slap House', 'hello'],
  ['Pop', 'hello', { attitude: 'heartbroken', sadness: 3, intensity: 2 }],
  ['Pop', 'hello', { attitude: 'angry', sadness: 0, intensity: 5 }],
  ['Pop', 'hello', { attitude: 'joyful', sadness: 0, intensity: 4 }],
  ['Pop', 'hello'],
];

function profile(genre, lyrics, meaning, sha = 'a'.repeat(64)) {
  const frames = Array.from({ length: 20 }, (_, i) => ({ timeMs: i * 100, rms: 0.2, onsetStrength: 1, centroidHz: 2200, bandwidthHz: 1600, rolloffHz: 3000 }));
  const cues = lyrics.split(' ').map((text, i) => ({ text, startMs: i * 400, endMs: i * 400 + 380 }));
  return {
    version: 1,
    clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
    creator: { primaryGenre: { value: genre, source: 'creator' } },
    musicAnalysis: {
      status: 'ready',
      clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
      result: { rhythm: { tempo: { status: 'estimated', bpm: 125, gridBpm: 125, alternativesBpm: [] }, beatsMs: [1000, 2000] }, features: { transientsMs: [500, 1500], frames } },
    },
    approvedLyrics: { cues, source: 'creator_reviewed' },
    ...(meaning && { lyricMeaning: { status: 'ready', meaning } }),
  };
}

const PLATES = [{ id: 'burnnet-woman-1547507-1920', cutout: true }];
const ROWS = ['photography', 'looks', 'riso', 'spray', 'pulise', 'dust'];

/** Every row of every refresh of a song, with the lane it was dealt in. */
function refreshes(pack, song, count = 12) {
  const person = profile(...song);
  return Array.from({ length: count }, (_, generation) => ROWS.map(row => pack.recommendRow(row, person, generation, PLATES)));
}

test('the four cards of a row differ in face and in motion, on every refresh, in every mood', async () => {
  const { server, pack, catalog, type } = await load();
  try {
    const lanes = new Set();
    for (const song of LANE_SONGS) {
      for (const [generation, rows] of refreshes(pack, song).entries()) {
        for (const slots of rows) {
          const where = `${song[0]} ${slots[0].row} #${generation}`;
          lanes.add(slots[0].reason.split(' · ')[0]);
          assert.equal(slots.length, 4, where);
          assert.equal(new Set(slots.map(slot => slot.font)).size, 4, `${where} repeats a face: ${slots.map(slot => slot.font)}`);
          for (const slot of slots) {
            assert.notEqual(slot.font, slot.fontSecondary, `${where}: a card pairs a face with itself`);
            assert.ok(slot.font in catalog.DISPLAY_FACES && slot.fontSecondary in catalog.DISPLAY_FACES);
          }
          if (slots[0].typeStyle) assert.equal(new Set(slots.map(slot => slot.typeStyle)).size, 4, `${where} repeats a type style: ${slots.map(slot => slot.typeStyle)}`);
        }
      }
    }
    assert.deepEqual([...lanes].sort(), ['dark', 'general', 'gospel', 'party', 'quiet', 'techno'], 'every mood was exercised');
    assert.ok(type.TYPE_STYLES.length >= 20);
  } finally { await server.close(); }
});

test('every type style gets a face that can do it: letter motion never gets a script, outlines and dust get thick strokes', async () => {
  const { server, pack, catalog, type } = await load();
  try {
    for (const song of LANE_SONGS) {
      for (const rows of refreshes(pack, song)) {
        for (const slots of rows) {
          for (const slot of slots) {
            const faces = [slot.font, slot.fontSecondary].map(font => catalog.DISPLAY_FACES[font]);
            if (slot.typeStyle) {
              const needs = type.typeNeeds(slot.typeStyle);
              if (needs.includes('letters')) assert.ok(faces.every(face => !face.joined), `${slot.typeStyle} got joined letters`);
              if (needs.includes('heavy')) assert.ok(faces.every(face => face.heavy), `${slot.typeStyle} got a thin face`);
            }
            if (['dust', 'pulise', 'riso'].includes(slot.row)) assert.ok(faces.every(face => face.heavy && face.letters === 'upper'), `${slot.row} got ${slot.font}`);
            if (slot.row === 'spray') assert.ok(faces.every(face => face.heavy), `spray got ${slot.font}`);
          }
        }
      }
    }
  } finally { await server.close(); }
});

test('refreshing brings different motion: each mood rotates through most of its type styles', async () => {
  const { server, pack, type } = await load();
  try {
    for (const [lane, allowed] of Object.entries(pack.TYPE_ALLOW)) {
      assert.ok(allowed.every(style => type.TYPE_STYLES.includes(style)), lane);
    }
    assert.ok(pack.TYPE_ALLOW.general.length === type.TYPE_STYLES.length);
    const seen = new Map();
    for (const song of LANE_SONGS) {
      for (const rows of refreshes(pack, song, 16)) {
        for (const slot of rows.flat()) {
          if (!slot.typeStyle) continue;
          const lane = slot.reason.split(' · ')[0];
          seen.set(lane, new Set([...(seen.get(lane) ?? []), slot.typeStyle]));
        }
      }
    }
    for (const [lane, styles] of seen) {
      const allowed = pack.TYPE_ALLOW[lane] ?? [];
      assert.ok(styles.size >= Math.min(allowed.length, 8), `${lane}: 16 refreshes showed ${styles.size} of ${allowed.length} type styles`);
    }
    // The moods keep their character: calm music never slams, club music never whispers.
    for (const style of ['stack', 'outline', 'glitch', 'stretch', 'split', 'bounce', 'rotate', 'scatter', 'zoom', 'echo', 'flicker', 'tilt']) {
      for (const lane of ['gospel', 'quiet']) assert.ok(!pack.TYPE_ALLOW[lane].includes(style), `${lane} allows ${style}`);
    }
    for (const style of ['minimal', 'editorial']) for (const lane of ['party', 'techno']) assert.ok(!pack.TYPE_ALLOW[lane].includes(style), `${lane} allows ${style}`);
  } finally { await server.close(); }
});

test('Dust, Pulise, Riso and Spray keep their own look: the fonts are all that varies between cards, their motion and colours are the template\'s own', async () => {
  const { server, pack } = await load();
  try {
    for (const song of LANE_SONGS) {
      const person = profile(...song);
      for (const generation of [0, 3, 7]) {
        for (const row of ['dust', 'pulise', 'riso', 'spray']) {
          const slots = pack.recommendRow(row, person, generation, PLATES);
          for (const slot of slots) {
            assert.deepEqual(Object.keys(slot.layout).sort(), ['cut', 'rotate', 'scaleBias', 'seed'], `${row} carries a look the template does not have`);
            assert.equal(slot.typeStyle, undefined, `${row} carries a lyric type style`);
          }
        }
        const dust = pack.recommendRow('dust', person, generation, PLATES);
        assert.equal(new Set(dust.map(slot => JSON.stringify(slot.colors))).size, 4, 'four colour pairs');
      }
    }
  } finally { await server.close(); }
});
