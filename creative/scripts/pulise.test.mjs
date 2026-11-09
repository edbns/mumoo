import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  const mods = {
    pulise: await server.ssrLoadModule('/src/pack-pulise.ts'),
    motion: await server.ssrLoadModule('/src/lyric-motion.ts'),
    palettes: await server.ssrLoadModule('/src/pulise-palettes.ts'),
    pops: await server.ssrLoadModule('/src/pulise-pops.ts'),
    look: await server.ssrLoadModule('/src/pulise-look.ts'),
    ground: await server.ssrLoadModule('/src/pulise-ground.ts'),
    stickers: await server.ssrLoadModule('/src/pulise-stickers.ts'),
  };
  return { server, ...mods };
}

const LANES = ['party', 'techno', 'dark', 'quiet', 'gospel', 'general'];

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

test('a cut knows when it began, even when fast songs halve the cuts', async () => {
  const { server, pulise } = await load();
  try {
    const beats = [100, 500, 900, 1300];
    assert.deepEqual(pulise.cutSpan(beats, 2, 400, 950), { startMs: 500, ageMs: 450, lengthMs: 400 });
    assert.deepEqual(pulise.cutSpan(beats, 0, 0, 40), { startMs: 0, ageMs: 40, lengthMs: 0 });
    const fast = [100, 400, 700, 1000];
    assert.deepEqual(pulise.cutSpan(fast, 3, 300, 800), { startMs: 400, ageMs: 400, lengthMs: 600 });
  } finally { await server.close(); }
});

test('every neon palette keeps the word readable on every cut, and every cut differs from the last', async () => {
  const { server, palettes } = await load();
  try {
    assert.ok(palettes.NEON_IDS.length >= 16, 'plenty of neon');
    for (const id of palettes.NEON_IDS) {
      const sequence = palettes.puliseSequence(id);
      sequence.forEach((phase, index) => {
        assert.ok(palettes.contrast(phase.ink, phase.field) >= 3, `${id} #${index} word on field`);
        assert.ok(palettes.contrast(phase.ink, phase.alt) >= 2.5, `${id} #${index} word on pattern`);
        assert.notEqual(phase.alt, phase.field, `${id} #${index} pattern is visible`);
        assert.notEqual(phase.field, sequence[(index + 1) % sequence.length].field, `${id} #${index} cuts to a new colour`);
        const { bodies, hues } = palettes.stickerColors(id, phase);
        assert.ok(bodies.length >= 1, `${id} #${index} has colours for a sticker`);
        assert.ok(hues.length >= 2, `${id} #${index} has accent colours`);
        assert.ok(bodies.every(color => color !== phase.field && color !== phase.ink), `${id} #${index} sticker colour`);
      });
      assert.ok(new Set(sequence.map(phase => phase.field)).size >= 4, `${id} cuts through several colours`);
    }
    assert.equal(palettes.puliseCut('acid', 6).field, palettes.puliseCut('acid', 0).field, 'the sequence repeats');
  } finally { await server.close(); }
});

test('every lane has enough neon and sticker choice that four cards and a refresh all differ', async () => {
  const { server, look, ground } = await load();
  try {
    for (const lane of LANES) {
      assert.ok(look.neonsForLane(lane).length >= 7, `${lane} palettes`);
      const seen = new Set();
      for (let generation = 0; generation < 12; generation++) {
        const row = look.puliseLooks(lane, `song:${generation}:${lane}:pulise`, 4);
        assert.equal(new Set(row.map(card => card.neon)).size, 4, `${lane} #${generation} repeats a palette`);
        assert.equal(new Set(row.map(card => card.ground)).size, 4, `${lane} #${generation} repeats a ground`);
        assert.equal(new Set(row.map(card => card.seed)).size, 4, `${lane} #${generation} repeats a pop seed`);
        for (const card of row) {
          assert.ok(card.stickers.length >= 3 && new Set(card.stickers).size === card.stickers.length, `${lane} stickers`);
          assert.ok(card.density > 0 && card.density <= 1);
          seen.add(card.neon);
        }
      }
      assert.ok(seen.size >= Math.min(7, look.neonsForLane(lane).length), `${lane} shows only ${seen.size} palettes over 12 refreshes`);
    }
    const checkers = new Set();
    for (let generation = 0; generation < 12; generation++) for (const card of look.puliseLooks('party', `g${generation}`, 4)) checkers.add(card.ground);
    assert.deepEqual([...checkers].sort(), [...ground.GROUND_IDS].sort(), 'every ground (checkerboard included) is dealt');
  } finally { await server.close(); }
});

test('looks are deterministic: the same seed gives the same row, another seed another row', async () => {
  const { server, look } = await load();
  try {
    const key = row => JSON.stringify(row);
    assert.equal(key(look.puliseLooks('techno', 'a', 4)), key(look.puliseLooks('techno', 'a', 4)));
    assert.notEqual(key(look.puliseLooks('techno', 'a', 4)), key(look.puliseLooks('techno', 'b', 4)));
  } finally { await server.close(); }
});

test('stickers pop from the song alone: deterministic, in the card\'s own set, on the cut and gone before the next', async () => {
  const { server, pops, look } = await load();
  try {
    const card = { neon: 'acid', ground: 'checker', stickers: ['lips', 'monster', 'eye', 'star'], seed: 4242, density: 1 };
    const at = (cut, energy, age, length = 430) => pops.popsAt(card, cut, energy, age, length);
    assert.equal(JSON.stringify(at(5, 0.9, 120)), JSON.stringify(at(5, 0.9, 120)), 'a frame is a pure function of its inputs');
    assert.deepEqual(at(5, 0.9, 120, 0), [], 'nothing pops before the song has a beat to cut on');

    let shown = 0;
    for (let cut = 0; cut < 60; cut++) {
      const first = at(cut, 0.9, 60);
      assert.ok(first.length <= 3, 'at most three at once');
      assert.equal(new Set(first.map(pop => pop.id)).size, first.length, 'no sticker twice in one cut');
      for (const pop of first) {
        shown++;
        assert.ok(card.stickers.includes(pop.id), pop.id);
        assert.ok(pop.radius > 0 && pop.y + pop.radius <= 1340 + 1, 'clear of the context line');
      }
      assert.deepEqual(at(cut, 0.9, 430), [], `cut ${cut} still has stickers when it ends`);
      assert.deepEqual(at(cut, 0.9, -1), [], 'stickers only appear once their cut has begun');
    }
    assert.ok(shown > 40, `a busy card shows stickers on most cuts (${shown} in 60)`);

    // The scale is zero as it appears, overshoots on the way in, and is zero again when it goes.
    const pop = at(1, 1, 0).concat(at(2, 1, 0), at(3, 1, 0), at(4, 1, 0))[0];
    assert.ok(pop, 'a sticker at the start of a cut');
    assert.ok(pops.popScale({ ...pop, ageMs: 0 }) < 1e-9, 'starts at nothing');
    assert.ok(pops.popScale({ ...pop, ageMs: 105 }) > 1, 'overshoots');
    assert.ok(Math.abs(pops.popScale({ ...pop, ageMs: 150 }) - 1) < 0.01, 'settles');
    assert.equal(pops.popScale({ ...pop, ageMs: pop.lifeMs }), 0);

    // Mood is from how the song sounds: calm lanes are sparse, party is busy, and louder moments add stickers.
    const count = (lane, energy) => {
      const [first] = look.puliseLooks(lane, 'mood', 1);
      let total = 0;
      for (let cut = 0; cut < 400; cut++) total += pops.popsAt(first, cut, energy, 60, 430).length;
      return total;
    };
    assert.ok(count('quiet', 0.9) < count('party', 0.9) * 0.6, 'quiet is sparser than party');
    assert.ok(count('party', 0.95) > count('party', 0.4), 'loud moments bring more stickers');
  } finally { await server.close(); }
});

test('no lyric text or meaning reaches a pulise card, so none can reach the cloud with it', async () => {
  const { server, look } = await load();
  try {
    const song = look.puliseLooks('party', 'seed', 4);
    const wire = JSON.stringify(song);
    for (const secret of ['hello', 'love', 'meaning', 'attitude']) assert.ok(!wire.includes(secret), secret);
    for (const card of song) assert.deepEqual(Object.keys(card).sort(), ['density', 'ground', 'neon', 'seed', 'stickers']);
  } finally { await server.close(); }
});

test('the cloud worker accepts exactly the palettes, grounds and stickers the page knows', async () => {
  const { server, palettes, ground, stickers } = await load();
  try {
    const worker = readFileSync(new URL('../../audio-intelligence/modal_creatives_encode_staging.py', import.meta.url), 'utf8');
    const listed = name => [...worker.match(new RegExp(`${name} = \\{([^}]*)\\}`))[1].matchAll(/"(\w+)"/g)].map(match => match[1]).sort();
    assert.deepEqual(listed('PULISE_NEONS'), [...palettes.NEON_IDS].sort());
    assert.deepEqual(listed('PULISE_GROUNDS'), [...ground.GROUND_IDS].sort());
    assert.deepEqual(listed('PULISE_STICKERS'), [...stickers.STICKER_IDS].sort());
  } finally { await server.close(); }
});
