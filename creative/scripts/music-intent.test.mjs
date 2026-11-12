import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';

const fixture = kind => JSON.parse(readFileSync(new URL(`./fixtures/analysis/${kind}.json`, import.meta.url), 'utf8'));

function frames({ centroid, n = 150 }) {
  return Array.from({ length: n }, (_, i) => ({
    timeMs: i * 100,
    rms: 0.2,
    onsetStrength: 1,
    centroidHz: centroid,
    bandwidthHz: centroid,
    rolloffHz: centroid + 500,
  }));
}

function song({ bpm, onsets, mode = null, margin = 0, flatness = null, centroid = 1800 }) {
  return {
    rhythm: { tempo: { status: 'estimated', bpm, gridBpm: bpm, alternativesBpm: [] }, beatsMs: [] },
    features: { transientsMs: Array.from({ length: onsets }, (_, i) => i * 100), frames: frames({ centroid }) },
    ...(mode ? { tonalityV1: { version: 1, status: 'available', key: 'C', mode, correlation: 0.6, majorMinorMargin: margin } } : {}),
    ...(flatness === null ? {} : { timbreV1: { version: 1, flatnessMean: flatness, flatnessMedian: flatness / 4 } }),
  };
}

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  return { server, ...(await server.ssrLoadModule('/src/music-intent.ts')) };
}

const haveFixtures = existsSync(new URL('./fixtures/analysis/techno.json', import.meta.url));

test('real songs no longer all read Aggressive/Industrial', { skip: !haveFixtures && 'analysis fixtures are local only' }, async () => {
  const { server, deriveMusicIntent } = await load();
  try {
    const vibes = Object.fromEntries(['reggaeton', 'deephouse', 'slaphouse', 'afrohouse', 'techno']
      .map(kind => [kind, deriveMusicIntent(fixture(kind))]));
    assert.equal(vibes.reggaeton.vibe, 'Uplifting/Energetic');
    assert.equal(vibes.slaphouse.vibe, 'Uplifting/Energetic');
    assert.equal(vibes.afrohouse.vibe, 'Uplifting/Energetic');
    assert.equal(vibes.deephouse.vibe, 'Uplifting/Energetic');
    assert.equal(vibes.techno.vibe, 'Aggressive/Industrial');
    assert.equal(vibes.techno.method, 'dsp-drive-v2');
    assert.equal(vibes.techno.mode, 'minor');
    assert.ok(vibes.techno.drive > vibes.reggaeton.drive, 'fast four-on-the-floor drives harder than dembow');
    assert.equal(vibes.afrohouse.bpm, null, 'no tempo is invented for display');
    assert.ok(vibes.afrohouse.drive > 0.5, 'beat spacing still gives afro house its pace');
    assert.equal(vibes.techno.cutRate, 'high');
    assert.equal(vibes.reggaeton.cutRate, 'medium');
  } finally { await server.close(); }
});

test('drive, key colour and grit pick the four vibes', async () => {
  const { server, deriveMusicIntent } = await load();
  try {
    const mellow = deriveMusicIntent(song({ bpm: 72, onsets: 10, mode: 'major', margin: 0.06, flatness: 0.0004 }));
    assert.equal(mellow.vibe, 'Ambient/Mellow');
    assert.equal(mellow.cutRate, 'low');

    const brooding = deriveMusicIntent(song({ bpm: 72, onsets: 10, mode: 'minor', margin: -0.1, flatness: 0.0004 }));
    assert.equal(brooding.vibe, 'Dark/Cinematic');

    const minorMid = deriveMusicIntent(song({ bpm: 86, onsets: 45, mode: 'minor', margin: -0.09, flatness: 0.0006 }));
    assert.equal(minorMid.vibe, 'Dark/Cinematic', 'a slow minor song with a steady pulse broods');

    const happy = deriveMusicIntent(song({ bpm: 124, onsets: 90, mode: 'major', margin: 0.05, flatness: 0.0009 }));
    assert.equal(happy.vibe, 'Uplifting/Energetic');
    assert.ok(happy.searchBias.some(s => /danc|crowd|night|city/i.test(s)));

    const gritty = deriveMusicIntent(song({ bpm: 140, onsets: 95, mode: 'major', margin: 0.04, flatness: 0.003 }));
    assert.equal(gritty.vibe, 'Aggressive/Industrial', 'distorted and fast is aggressive whatever the key');
    assert.ok(gritty.searchBias.every(s => !/danc|party|club|crowd celebration/i.test(s)));

    const cleanSlow = deriveMusicIntent(song({ bpm: 80, onsets: 20, flatness: 0.003 }));
    assert.notEqual(cleanSlow.vibe, 'Aggressive/Industrial', 'grit alone without drive is not aggressive');

    assert.equal(deriveMusicIntent({ ...happy, features: { transientsMs: [], frames: frames({ centroid: 1000, n: 2 }) } }), null);
  } finally { await server.close(); }
});

test('older analyses without key or flatness still vary by drive', async () => {
  const { server, deriveMusicIntent } = await load();
  try {
    const intent = deriveMusicIntent(song({ bpm: 143, onsets: 97 }));
    assert.equal(intent.mode, null);
    assert.equal(intent.flatness, null);
    assert.equal(intent.vibe, 'Uplifting/Energetic');
    assert.equal(deriveMusicIntent(song({ bpm: 70, onsets: 8 })).vibe, 'Ambient/Mellow');
  } finally { await server.close(); }
});
