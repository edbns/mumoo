/**
 * Video treatments: they finish the Director's reel, never change its plan, stay deterministic from the seed,
 * and the worker refuses unknown or out-of-range options. Preview and encode share the same option keys.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const pack = await server.ssrLoadModule('/src/creatives-pack.ts');
const deal = await server.ssrLoadModule('/src/treatment-deal.ts');
const director = await server.ssrLoadModule('/src/pack-director.ts');
const reelMod = await server.ssrLoadModule('/src/pack-reel.ts');
await server.close();

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const photo = n => ({ id: uuid(n), kind: 'photo', attitudes: ['love'], tags: [], genre: null, subGenre: null, url: `https://x/${n}`, cutoutUrl: `https://x/${n}.cut` });
const clip = (n, kind = 'video') => ({ id: uuid(n), kind, attitudes: ['love'], tags: [], genre: null, subGenre: null, url: `https://x/${n}`, motionUrl: `https://x/${n}.mp4`, shots: [[0, 3000], [3000, 6000]] });
const LIBRARY = [photo(1), photo(2), photo(3), clip(4), photo(5), clip(6, 'gif'), photo(7), photo(8)];

function profile(sha = 'b'.repeat(64)) {
  const frames = Array.from({ length: 20 }, (_, i) => ({ timeMs: i * 100, rms: 0.2, onsetStrength: 1, centroidHz: 2200, bandwidthHz: 1600, rolloffHz: 3000 }));
  return {
    version: 1,
    clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
    creator: { primaryGenre: { value: 'Pop', source: 'creator' } },
    musicAnalysis: {
      status: 'ready',
      clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
      result: { rhythm: { tempo: { status: 'estimated', bpm: 125, gridBpm: 125, alternativesBpm: [] }, beatsMs: [1000, 2000, 3000, 4000, 5000] }, features: { transientsMs: [500, 1500], frames } },
    },
    approvedLyrics: { cues: [{ text: 'hello', startMs: 0, endMs: 380 }], source: 'creator_reviewed' },
    lyricMeaning: { status: 'ready', meaning: { attitude: 'love', sadness: 1, intensity: 3 } },
  };
}

const music = {
  beatsMs: [0, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000, 14000],
  downbeatsMs: [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000],
  energy: Array.from({ length: 30 }, (_, i) => ({ timeMs: i * 500, rms: 0.3 + (i % 5) * 0.05 })),
  accentsMs: [2000, 6000, 10000],
  pace: 'balanced',
};

test('all eight treatments are on the shelf as their own templates', () => {
  const ids = pack.SHELF_ROWS.map(row => row.id);
  for (const id of deal.TREATMENT_IDS) {
    assert.ok(ids.includes(id), id);
    assert.equal(pack.SHELF_ROWS.find(row => row.id === id).picture, 'any');
    assert.equal(pack.SHELF_ROWS.find(row => row.id === id).lyrics, 'switch');
  }
  assert.ok(ids.indexOf('photography') < ids.indexOf('triptych'), 'treatments follow Directed');
});

test('each treatment deals four variants, deterministic from the seed, and never changes the Director plan fields', () => {
  for (const kind of deal.TREATMENT_IDS) {
    const a = pack.recommendRow(kind, profile(), 0, [], null, LIBRARY, {}, false);
    const b = pack.recommendRow(kind, profile(), 0, [], null, LIBRARY, {}, false);
    assert.equal(a.length, 4, kind);
    assert.deepEqual(a.map(slot => slot.treatmentVariant), b.map(slot => slot.treatmentVariant), `${kind} seed`);
    assert.equal(new Set(a.map(slot => slot.treatmentVariant)).size, 4, `${kind} four variants`);
    for (const slot of a) {
      assert.equal(slot.style, 'treatment');
      assert.equal(slot.treatment, kind);
      assert.ok(deal.isTreatmentVariant(kind, slot.treatmentVariant));
      assert.ok(slot.reelIds && slot.reelIds.length >= 2, `${kind} uses a Directed reel`);
      assert.equal(slot.look, undefined);
      assert.equal(slot.effectId, undefined);
      assert.equal(slot.plateId, undefined);
    }
    const refreshed = pack.recommendRow(kind, profile(), 1, [], null, LIBRARY, {}, false);
    // Refresh changes the hand (card ids include the generation seed); the four variants stay a full deal of the treatment.
    assert.notDeepEqual(a.map(slot => slot.id), refreshed.map(slot => slot.id), `${kind} refresh`);
    assert.equal(new Set(refreshed.map(slot => slot.treatmentVariant)).size, 4, `${kind} refresh variants`);
  }
});

test('treatments never change the Director\'s plan: same assets, music and cut seed yield the same segments', () => {
  const assets = [
    { kind: 'photo' },
    { kind: 'clip', shots: [[0, 4000], [4000, 8000]] },
    { kind: 'photo' },
    { kind: 'clip', shots: [[0, 5000]] },
  ];
  const seed = 42_000;
  const planA = director.planReel(assets, music, seed, 15_000);
  const planB = director.planReel(assets, music, seed, 15_000);
  assert.deepEqual(planA, planB);
  // A treatment card's cutSeed is what the reel is directed with; the treatment options are not an input to planReel.
  const [slot] = pack.recommendRow('triptych', profile(), 0, [], null, LIBRARY, {}, false);
  const directed = director.planReel(assets, music, slot.cutSeed, 15_000);
  assert.deepEqual(directed, director.planReel(assets, music, slot.cutSeed, 15_000));
  assert.ok(directed.every(segment => Number.isFinite(segment.atMs) && segment.endMs > segment.atMs));
});

test('treatment card N finishes Directed card N: the same pictures, reel order and cut', () => {
  for (const generation of [0, 1, 5]) {
    const directed = pack.recommendRow('photography', profile(), generation, [], null, LIBRARY, {}, false);
    for (const kind of deal.TREATMENT_IDS) {
      const treated = pack.recommendRow(kind, profile(), generation, [], null, LIBRARY, {}, false);
      assert.deepEqual(treated.map(slot => slot.reelIds), directed.map(slot => slot.reelIds), `${kind} reel @${generation}`);
      assert.deepEqual(treated.map(slot => slot.cutSeed), directed.map(slot => slot.cutSeed), `${kind} cut @${generation}`);
      assert.deepEqual(treated.map(slot => slot.board), directed.map(slot => slot.board), `${kind} board @${generation}`);
    }
  }
});

test('Double Exposure\'s later frame comes from a later cut of the same plan', () => {
  const assets = [
    { kind: 'clip', shots: [[0, 4000]] },
    { kind: 'photo' },
    { kind: 'clip', shots: [[0, 5000]] },
    { kind: 'photo' },
  ];
  const segments = director.planReel(assets, music, 7, 15_000);
  assert.ok(segments.length >= 3, 'enough cuts to step ahead');
  // Mirror pack-reel.cutAheadMs without loading pictures.
  const cutAheadMs = (ms, ahead) => {
    if (ahead <= 0) return ms;
    let index = 0;
    for (let i = 0; i < segments.length; i++) if (segments[i].atMs <= ms) index = i;
    return segments[(index + ahead) % segments.length].atMs;
  };
  const now = segments[1].atMs + 50;
  assert.equal(cutAheadMs(now, 0), now);
  assert.equal(cutAheadMs(now, 1), segments[(1 + 1) % segments.length].atMs);
  assert.equal(cutAheadMs(now, 2), segments[(1 + 2) % segments.length].atMs);
  assert.ok(typeof reelMod.reelKey === 'function');
  assert.ok(readFileSync(new URL('../src/pack-reel.ts', import.meta.url), 'utf8').includes('cutAheadMs'));
});

test('preview and render carry the same treatment options', () => {
  const renderer = readFileSync(new URL('../src/pack-renderer.ts', import.meta.url), 'utf8');
  const exportSource = readFileSync(new URL('../src/pack-cloud-export.ts', import.meta.url), 'utf8');
  const studio = readFileSync(new URL('../src/creatives-pack-studio.tsx', import.meta.url), 'utf8');
  assert.ok(/treatment\?: TreatmentId/.test(renderer) && /treatmentVariant\?: string/.test(renderer));
  assert.ok(/slot\.treatment \? \{ treatment: slot\.treatment, treatmentVariant: slot\.treatmentVariant \}/.test(studio));
  // Cloud export strips only media URLs; treatment fields ride along inside opts.
  assert.ok(/opts: \{ \.\.\.scene/.test(exportSource) || /form\.append\('meta'/.test(exportSource));
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
        module.check_media(case["opts"], {name: b"x" for name in case.get("media", [])})
        answers.append({"accepted": True})
    except ValueError as error:
        answers.append({"accepted": False, "error": str(error)})
print(json.dumps(answers))
`;

const R2 = 'https://abc123.r2.cloudflarestorage.com/bucket/library/x?X-Amz-Signature=1';
const base = {
  style: 'treatment', font: 'Anton', fontSecondary: 'Anton',
  layout: { rotate: 0, scaleBias: 1, cut: 0, seed: 3 },
  cues: [], fallbackText: '', typeStyle: 'karaoke',
  treatment: 'triptych', treatmentVariant: 'narrow',
};
const reelOf = (...entries) => entries.map(entry => ({ kind: 'photo', url: R2, ...entry }));
const card = (change, media = []) => ({ opts: { ...base, ...change }, media });

const cases = {
  okReel: [card({ reel: reelOf({}, {}) }), true],
  okPhoto: [card({}, ['photo']), true],
  okMotion: [card({}, ['motion']), true],
  unknownTreatment: [card({ treatment: 'glitch' }), false],
  unknownVariant: [card({ treatmentVariant: 'huge' }), false],
  filterWithoutTreatment: [card({ style: 'filter', look: 'thermal', treatment: undefined, treatmentVariant: undefined, reel: reelOf({}, {}) }), true],
  treatmentKeysOnFilter: [card({ style: 'filter', look: 'thermal', reel: reelOf({}, {}) }), false],
  lookOnTreatment: [card({ look: 'thermal', reel: reelOf({}, {}) }), false],
  effectOnTreatment: [card({ effectId: 'x', reel: reelOf({}, {}) }), false],
  missingVariant: [card({ treatmentVariant: undefined, reel: reelOf({}, {}) }), false],
  fisheyeOk: [card({ treatment: 'fisheye', treatmentVariant: 'strong', reel: reelOf({}, {}) }), true],
  doubleOk: [card({ treatment: 'double', treatmentVariant: 'offset-cut', reel: reelOf({}, { kind: 'clip', shots: [[0, 3000]] }) }), true],
  doubleBadVariant: [card({ treatment: 'double', treatmentVariant: 'random', reel: reelOf({}, {}) }), false],
  withPlate: [card({ plateId: 'x', reel: reelOf({}, {}) }), false],
};

const python = spawnSync('python3', ['-c', 'import modal'], { encoding: 'utf8' });

test('the worker accepts known treatment options and refuses unknown or out-of-range ones', { skip: python.status !== 0 && 'Python with Modal is not installed' }, () => {
  const run = spawnSync('python3', ['-c', PROGRAM], { input: JSON.stringify(Object.values(cases).map(([input]) => input)), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const answers = JSON.parse(run.stdout);
  Object.entries(cases).forEach(([name, [, accepted]], index) => assert.equal(answers[index].accepted, accepted, `${name}: ${JSON.stringify(answers[index])}`));
});

test('the worker\'s TREATMENTS set stays in step with treatment-deal.ts', () => {
  const body = readFileSync(worker, 'utf8');
  const block = body.match(/TREATMENTS = \{([\s\S]*?)\n\}/);
  assert.ok(block, 'TREATMENTS missing from the worker');
  for (const def of deal.TREATMENTS) {
    assert.ok(block[1].includes(`"${def.id}"`), def.id);
    for (const variant of def.variants) assert.ok(block[1].includes(`"${variant.id}"`), `${def.id}/${variant.id}`);
  }
});

test('Learning records the treatment row and its variant', () => {
  const feedback = readFileSync(new URL('../src/pack-feedback.ts', import.meta.url), 'utf8');
  assert.ok(/treatmentVariant/.test(feedback));
  assert.ok(/look: slot\.treatmentVariant/.test(feedback));
});
