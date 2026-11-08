import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

function frames({ centroid, bandwidth, n = 20 }) {
  return Array.from({ length: n }, (_, i) => ({
    timeMs: i * 100,
    rms: 0.2,
    onsetStrength: 1,
    centroidHz: centroid,
    bandwidthHz: bandwidth,
    rolloffHz: centroid + 500,
  }));
}

test('DSP Intent maps brightness and noisiness into four vibes', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  try {
    const { deriveMusicIntent } = await server.ssrLoadModule('/src/music-intent.ts');
    const base = {
      rhythm: { tempo: { status: 'estimated', bpm: 124, gridBpm: 124, alternativesBpm: [] }, beatsMs: [], },
      features: { transientsMs: Array.from({ length: 70 }, (_, i) => i * 200), frames: [] },
    };
    const up = deriveMusicIntent({ ...base, features: { ...base.features, frames: frames({ centroid: 2400, bandwidth: 800 }) } });
    assert.equal(up.vibe, 'Uplifting/Energetic');
    assert.equal(up.method, 'dsp-timbre-v1');
    assert.equal(up.bpm, 124);
    assert.ok(up.searchBias.some(s => /danc|crowd|night|city/i.test(s)));

    const aggressive = deriveMusicIntent({ ...base, features: { ...base.features, frames: frames({ centroid: 2600, bandwidth: 2800 }) } });
    assert.equal(aggressive.vibe, 'Aggressive/Industrial');
    assert.ok(aggressive.searchBias.every(s => !/danc|party|club|crowd celebration/i.test(s)));
    assert.ok(aggressive.searchBias.some(s => /factory|sparks|concrete|welding|subway|industrial/i.test(s)));

    const mellow = deriveMusicIntent({ ...base, features: { ...base.features, frames: frames({ centroid: 900, bandwidth: 400 }) } });
    assert.equal(mellow.vibe, 'Ambient/Mellow');

    const dark = deriveMusicIntent({ ...base, features: { ...base.features, frames: frames({ centroid: 900, bandwidth: 1200 }) } });
    assert.equal(dark.vibe, 'Dark/Cinematic');

    assert.equal(deriveMusicIntent({ ...base, features: { ...base.features, frames: frames({ centroid: 1000, bandwidth: 500, n: 2 }) } }), null);
  } finally { await server.close(); }
});
