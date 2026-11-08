import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  return { server, pulise: await server.ssrLoadModule('/src/pack-pulise.ts'), motion: await server.ssrLoadModule('/src/lyric-motion.ts') };
}

/** Distinct cuts the field shows over one second of a song at this tempo. */
function cutsPerSecond({ pulise, motion }, bpm) {
  const gap = 60000 / bpm;
  const music = { beatsMs: Array.from({ length: 80 }, (_, i) => Math.round(i * gap)), energy: [] };
  const seen = new Set();
  for (let ms = 10000; ms < 11000; ms += 10) {
    const { beatIndex, beatGapMs } = motion.impactSignals(music, ms);
    seen.add(pulise.puliseCuts(beatIndex, beatGapMs));
  }
  return seen.size;
}

test('Pulise cuts on every beat and never more than three times a second', async () => {
  const { server, ...mods } = await load();
  try {
    assert.equal(mods.pulise.puliseCuts(7, 0), 7);
    for (const bpm of [90, 125, 150, 170]) assert.ok(cutsPerSecond(mods, bpm) <= 4, `${bpm} BPM`);
    for (const bpm of [200, 220]) assert.ok(cutsPerSecond(mods, bpm) <= 4, `${bpm} BPM halved`);
    assert.ok(cutsPerSecond(mods, 220) < Math.ceil((220 / 60) + 1), 'fast songs are halved');
  } finally { await server.close(); }
});
