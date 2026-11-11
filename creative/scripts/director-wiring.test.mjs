import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { REEL_MAX, reelFrom, reelIds } from '../netlify/lib/reel.mjs';

/** The Director's reel: which cards are edited, from what, and what the cloud accepts. */

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const pack = await server.ssrLoadModule('/src/creatives-pack.ts');
const reel = await server.ssrLoadModule('/src/pack-reel.ts');
await server.close();

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const photo = n => ({ id: uuid(n), kind: 'photo', attitudes: ['love'], tags: [], genre: null, subGenre: null, url: `https://x/${n}`, cutoutUrl: `https://x/${n}.cut` });
const clip = (n, kind = 'video') => ({ id: uuid(n), kind, attitudes: ['love'], tags: [], genre: null, subGenre: null, url: `https://x/${n}`, motionUrl: `https://x/${n}.mp4`, shots: [[0, 3000], [3000, 6000]] });

function profile(sha = 'b'.repeat(64)) {
  const frames = Array.from({ length: 20 }, (_, i) => ({ timeMs: i * 100, rms: 0.2, onsetStrength: 1, centroidHz: 2200, bandwidthHz: 1600, rolloffHz: 3000 }));
  return {
    version: 1,
    clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
    creator: { primaryGenre: { value: 'Pop', source: 'creator' } },
    musicAnalysis: {
      status: 'ready',
      clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
      result: { rhythm: { tempo: { status: 'estimated', bpm: 125, gridBpm: 125, alternativesBpm: [] }, beatsMs: [1000, 2000] }, features: { transientsMs: [500, 1500], frames } },
    },
    approvedLyrics: { cues: [{ text: 'hello', startMs: 0, endMs: 380 }], source: 'creator_reviewed' },
    lyricMeaning: { status: 'ready', meaning: { attitude: 'love', sadness: 1, intensity: 3 } },
  };
}

const LIBRARY = [photo(1), photo(2), photo(3), clip(4), photo(5), clip(6, 'gif'), photo(7), photo(8)];
const REEL_ROWS = ['photography', 'thermal', 'halftone', 'dither', 'glow', 'streaks', 'ascii', 'depth'];

test('Directed, the looks, Depth and Riso are edited reels of two or more library pictures', () => {
  for (const row of [...REEL_ROWS, 'riso']) {
    const slots = pack.recommendRow(row, profile(), 0, [], null, LIBRARY, {}, false);
    assert.ok(slots.length > 0, row);
    for (const slot of slots) {
      assert.ok(slot.reelIds && slot.reelIds.length >= 2 && slot.reelIds.length <= REEL_MAX, `${row}: ${slot.reelIds}`);
      assert.equal(new Set(slot.reelIds).size, slot.reelIds.length, 'no picture twice in a reel');
      assert.ok(slot.reelIds.every(id => LIBRARY.some(item => item.id === id)));
      assert.equal(slot.libraryId, undefined);
      assert.equal(slot.plateId, undefined);
      assert.equal(slot.effectId, undefined);
    }
  }
});

test('each card of a row opens on a different picture, and the cards are told apart', () => {
  for (const row of ['photography', 'thermal', 'riso']) {
    const slots = pack.recommendRow(row, profile(), 0, [], null, LIBRARY, {}, false);
    assert.equal(new Set(slots.map(slot => slot.id)).size, slots.length, row);
    // Riso has only the two clips of the library to open on.
    assert.equal(new Set(slots.map(slot => slot.reelIds[0])).size, row === 'riso' ? 2 : slots.length, `${row} opens a different way on each card`);
  }
});

test('a reel is never made of stills alone when the library has a clip, and Riso is made of clips', () => {
  const stillsFirst = [photo(1), photo(2), photo(3), photo(5), photo(7), photo(8), clip(4)];
  for (const row of ['photography', 'thermal']) {
    const [slot] = pack.recommendRow(row, profile(), 0, [], null, stillsFirst, {}, false);
    assert.ok(slot.reelIds.includes(uuid(4)), row);
  }
  const [riso] = pack.recommendRow('riso', profile(), 0, [], null, LIBRARY, {}, false);
  assert.ok(riso.reelIds.every(id => [uuid(4), uuid(6)].includes(id)));
});

test('with fewer than two pictures, or the person’s own, a card is not a reel', () => {
  const one = pack.recommendRow('photography', profile(), 0, [], null, [photo(1)], {}, false);
  assert.ok(one.every(slot => !slot.reelIds && slot.libraryId === uuid(1)));
  assert.ok(pack.recommendRow('riso', profile(), 0, [], null, [photo(1), photo(2)], {}, false).every(slot => !slot.reelIds), 'Riso edits clips only');
  for (const row of ['photography', 'thermal']) {
    assert.ok(pack.recommendRow(row, profile(), 0, [], null, LIBRARY, {}, true).every(slot => !slot.reelIds), `${row}: their own picture is drawn instead`);
  }
});

test('Dust and Window keep drawing one picture', () => {
  for (const row of ['dust', 'window']) {
    assert.ok(pack.recommendRow(row, profile(), 0, [], null, LIBRARY, {}, false).every(slot => !slot.reelIds), row);
  }
});

test('Refresh deals the director other pictures, and the same song gets the same reels', () => {
  // A library bigger than the pool of eight: otherwise every deal would hold the same eight pictures.
  const big = [...LIBRARY, ...Array.from({ length: 16 }, (_, i) => photo(20 + i)), clip(40), clip(41)];
  const reels = generation => pack.recommendRow('photography', profile(), generation, [], null, big, {}, false).map(slot => slot.reelIds.join());
  assert.deepEqual(reels(0), reels(0));
  assert.notDeepEqual(reels(0), reels(1));
});

test('the cloud’s links carry no id, so each picture is still told apart (by its link, not its signature)', () => {
  const link = (name, signature) => `https://acc.r2.cloudflarestorage.com/bucket/library/${name}?X-Amz-Signature=${signature}`;
  const keys = [reel.reelKey({ kind: 'photo', url: link('a', 1) }), reel.reelKey({ kind: 'clip', url: link('b', 1) }), reel.reelKey({ kind: 'photo', url: link('c', 1) })];
  assert.equal(new Set(keys).size, 3, 'three links, three pictures: never one picture shown for all of them');
  assert.equal(reel.reelKey({ kind: 'photo', url: link('a', 1) }), reel.reelKey({ kind: 'photo', url: link('a', 2) }), 'a renewed link is the same picture');
  assert.notEqual(reel.reelKey({ id: 'a', kind: 'photo', url: link('a', 1) }), reel.reelKey({ id: 'a', kind: 'photo', url: link('a', 1), cutoutUrl: link('a.cut', 1) }), 'a photo with its cut-out is kept apart from one without');
});

/* ---------- the server ---------- */

test('the server takes a reel of two to eight library ids for Our photography and Riso only', () => {
  const ids = [uuid(1), uuid(2), uuid(3)];
  const reel = ids.map(id => ({ id, kind: 'photo' }));
  assert.deepEqual(reelIds({ style: 'filter', reel }), { ids, depth: false });
  assert.deepEqual(reelIds({ style: 'riso', reel }), { ids, depth: false });
  assert.deepEqual(reelIds({ style: 'filter', look: 'depthfog', reel }), { ids, depth: true }, 'Depth is a reel too: of photos with their cut-outs');
  assert.ok(reelIds({ style: 'dust', reel }).refused);
  assert.ok(reelIds({ style: 'filter', reel: reel.slice(0, 1) }).refused);
  assert.ok(reelIds({ style: 'filter', reel: Array.from({ length: REEL_MAX + 1 }, (_, i) => ({ id: uuid(i + 1) })) }).refused);
  assert.ok(reelIds({ style: 'filter', reel: [...reel, reel[0]] }).refused, 'no picture twice');
  assert.ok(reelIds({ style: 'filter', reel: [{ id: 'not-an-id' }, { id: uuid(1) }] }).refused);
  assert.ok(reelIds({ style: 'filter', reel, plateId: 'x' }).refused, 'a reel is the only picture');
  assert.ok(reelIds({ style: 'filter', reel, motionUrl: 'https://evil/x.mp4' }).refused);
});

test('what goes to the worker is what the library said, never what the page said', () => {
  const sent = reelFrom([{ kind: 'photo', url: 'https://a/1' }, { kind: 'clip', url: 'https://a/2', shots: [[0, 100]] }]);
  assert.deepEqual(sent, [{ kind: 'photo', url: 'https://a/1' }, { kind: 'clip', url: 'https://a/2', shots: [[0, 100]] }]);
});

/* ---------- the worker ---------- */

const worker = fileURLToPath(new URL('../../audio-intelligence/modal_creatives_encode_staging.py', import.meta.url));
const PROGRAM = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("worker", ${JSON.stringify(worker)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
answers = []
for case in json.load(sys.stdin):
    try:
        module.parse_meta(json.dumps({"opts": case["opts"]}))
        module.check_media(case["opts"], {name: b"x" for name in case["media"]})
        answers.append({"accepted": True})
    except ValueError as error:
        answers.append({"accepted": False, "error": str(error)})
print(json.dumps(answers))
`;
const R2 = 'https://abc123.r2.cloudflarestorage.com/bucket/library/x?X-Amz-Signature=1';
const filter = { style: 'filter', font: 'Anton', fontSecondary: 'Anton', layout: { rotate: 0, scaleBias: 1, cut: 0, seed: 3 }, cues: [], fallbackText: '', typeStyle: 'karaoke', look: 'thermal' };
const reelOf = (...entries) => entries.map(entry => ({ kind: 'photo', url: R2, ...entry }));
const card = (change, media = []) => ({ opts: { ...filter, ...change }, media });
const riso = { style: 'riso', inkSet: 'pink-blue', layout: { rotate: 0, scaleBias: 1, cut: 0, seed: 3 } };

const cases = {
  filterReel: [card({ reel: reelOf({}, { kind: 'clip', shots: [[0, 3000], [3000, 6000]] }) }), true],
  rotatingLook: [card({ look: 'halftone', reel: reelOf({}, {}, {}) }), true],
  risoReel: [card({ ...riso, look: undefined, reel: reelOf({ kind: 'clip' }, { kind: 'clip' }) }), true],
  oneOnly: [card({ reel: reelOf({}) }), false],
  nine: [card({ reel: reelOf({}, {}, {}, {}, {}, {}, {}, {}, {}) }), false],
  eight: [card({ reel: reelOf({}, {}, {}, {}, {}, {}, {}, {}) }), true],
  notALink: [card({ reel: reelOf({}, { url: 'javascript:alert(1)' }) }), false],
  httpLink: [card({ reel: reelOf({}, { url: R2.replace('https', 'http') }) }), false],
  anotherHost: [card({ reel: reelOf({}, { url: 'https://evil.example.com/a.mp4' }) }), false],
  lookalikeHost: [card({ reel: reelOf({}, { url: 'https://r2.cloudflarestorage.com.evil.com/a' }) }), false],
  credentials: [card({ reel: reelOf({}, { url: 'https://u:p@abc.r2.cloudflarestorage.com/a' }) }), false],
  unknownKind: [card({ reel: reelOf({}, { kind: 'audio' }) }), false],
  extraKey: [card({ reel: reelOf({}, { path: '/etc/passwd' }) }), false],
  shotsOnAPhoto: [card({ reel: reelOf({}, { shots: [[0, 100]] }) }), false],
  badShots: [card({ reel: reelOf({}, { kind: 'clip', shots: [[100, 0]] }) }), false],
  withMedia: [card({ reel: reelOf({}, {}) }, ['photo']), false],
  withPlate: [card({ plateId: 'x', reel: reelOf({}, {}) }), false],
  withEffect: [card({ look: undefined, effectId: 'x', reel: reelOf({}, {}) }), false],
  depth: [card({ look: 'depthfog', reel: reelOf({ cutoutUrl: R2 }, { cutoutUrl: R2 }) }), true],
  depthWithoutCutouts: [card({ look: 'depthfog', reel: reelOf({}, {}) }), false],
  depthWithAClip: [card({ look: 'depthfog', reel: reelOf({ cutoutUrl: R2 }, { kind: 'clip', cutoutUrl: R2 }) }), false],
  depthCutoutOnAnotherHost: [card({ look: 'depthfog', reel: reelOf({ cutoutUrl: R2 }, { cutoutUrl: 'https://evil.example.com/c.png' }) }), false],
  cutoutsOnAPlainLook: [card({ reel: reelOf({ cutoutUrl: R2 }, {}) }), false],
  onDust: [card({ style: 'dust', look: undefined, reel: reelOf({}, {}) }), false],
};

const python = spawnSync('python3', ['-c', 'import modal'], { encoding: 'utf8' });

test('the worker takes a reel of fetched library links and refuses every mistake', { skip: python.status !== 0 && 'Python with Modal is not installed' }, () => {
  const run = spawnSync('python3', ['-c', PROGRAM], { input: JSON.stringify(Object.values(cases).map(([input]) => input)), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const answers = JSON.parse(run.stdout);
  Object.entries(cases).forEach(([name, [, accepted]], index) => assert.equal(answers[index].accepted, accepted, `${name}: ${JSON.stringify(answers[index])}`));
});

test('the palette and the look’s range are read from the picture on screen, not from the first one of the reel', async () => {
  const { readFileSync } = await import('node:fs');
  const palette = readFileSync(new URL('../src/pack-palette.ts', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/pack-reel.ts', import.meta.url), 'utf8');
  assert.ok(/references\.get\(texture\)/.test(palette) && /reference\?\.key/.test(palette), 'the palette is cached per picture of a reel');
  assert.ok(/references\.set\(texture, \{ key: reelKey\(sources\[segment\.asset\]\)/.test(source), 'every frame says which picture it shows');
  assert.ok(/SUBJECT_MAX/.test(source), 'a cut-out that covers almost all of the picture, or none, is not put in front of the look');
});
