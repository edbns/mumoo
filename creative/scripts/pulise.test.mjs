import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  return {
    server,
    pulise: await server.ssrLoadModule('/src/pack-pulise.ts'),
    motion: await server.ssrLoadModule('/src/lyric-motion.ts'),
    palettes: await server.ssrLoadModule('/src/pulise-palettes.ts'),
    look: await server.ssrLoadModule('/src/pulise-look.ts'),
  };
}

/** A steady song at this tempo: a beat every `gap`, a downbeat every fourth, always loud enough to count as a surge. */
function steadySong(bpm) {
  const gap = 60000 / bpm;
  const beatsMs = Array.from({ length: 120 }, (_, i) => Math.round(i * gap));
  return { beatsMs, downbeatsMs: beatsMs.filter((_, i) => i % 4 === 0), energy: [] };
}

/** What is on screen at `ms`: the colours (field and type) and which cut it is, using the same functions the scene does. */
function screenAt({ pulise, motion, palettes }, music, ms, neon = 'acid') {
  const { beatIndex, beatGapMs } = motion.impactSignals(music, ms);
  const cut = pulise.puliseCuts(beatIndex, beatGapMs);
  const span = pulise.cutSpan(music.beatsMs, beatIndex, beatGapMs, ms);
  const strong = pulise.strongCut(music, span.startMs, span.lengthMs);
  const shown = palettes.puliseColours(neon, cut, span.ageMs, span.lengthMs, strong);
  return { cut, ...shown, flashing: shown.field !== palettes.puliseCut(neon, cut).field };
}

/** Field colour changes (cuts and flashes alike) in the busiest second, and distinct cuts in the busiest second. */
function busiestSecond(mods, music) {
  const changes = [];
  const cuts = [];
  let flashes = 0;
  let previous = screenAt(mods, music, 8000);
  for (let ms = 8005; ms < 24000; ms += 5) {
    const now = screenAt(mods, music, ms);
    if (now.field !== previous.field) changes.push(ms);
    if (now.cut !== previous.cut) cuts.push(ms);
    if (now.flashing) flashes += 1;
    previous = now;
  }
  const worst = times => Math.max(...times.map(start => times.filter(at => at >= start && at < start + 1000).length));
  return { changes: worst(changes), cuts: worst(cuts), flashes };
}

test('Pulise cuts on every beat and never more than three times a second', async () => {
  const { server, ...mods } = await load();
  try {
    assert.equal(mods.pulise.puliseCuts(7, 0), 7);
    for (const bpm of [60, 90, 125, 150, 170, 176, 177, 200, 220, 240]) {
      const { cuts } = busiestSecond(mods, steadySong(bpm));
      assert.ok(cuts <= 3, `${bpm} BPM cuts ${cuts} times in a second`);
    }
  } finally { await server.close(); }
});

test('flashes and cuts together stay within three flashes a second at every tempo', async () => {
  const { server, ...mods } = await load();
  try {
    for (const bpm of [60, 90, 110, 125, 140, 150, 160, 170, 176, 177, 200, 220, 240]) {
      // Every colour change on screen counts: a flash is two of them (in and out), so six changes are three flashes.
      const { changes, flashes } = busiestSecond(mods, steadySong(bpm));
      assert.ok(changes <= 6, `${bpm} BPM changes colour ${changes} times in a second`);
      if (bpm <= 140) assert.ok(flashes > 0, `${bpm} BPM: strong beats flash`);
      if (bpm >= 160 && bpm <= 176) assert.equal(flashes, 0, `${bpm} BPM: cuts too short to flash`);
    }
  } finally { await server.close(); }
});

test('a flash swaps field and type for a moment at the start of a strong cut, and nowhere else', async () => {
  const { server, palettes } = await load();
  try {
    const plain = palettes.puliseCut('signal', 3);
    const flash = palettes.puliseColours('signal', 3, 20, 500, true);
    assert.equal(flash.field, plain.ink);
    assert.equal(flash.ink, plain.field);
    assert.deepEqual(palettes.puliseColours('signal', 3, 20, 500, false), plain, 'calm beats do not flash');
    assert.deepEqual(palettes.puliseColours('signal', 3, palettes.FLASH_MS, 500, true), plain, 'it settles at once');
    assert.deepEqual(palettes.puliseColours('signal', 3, 20, palettes.MIN_FLASH_CUT_MS - 1, true), plain, 'short cuts never flash');
    assert.deepEqual(palettes.puliseColours('signal', 3, -5, 500, true), plain, 'nothing flashes before its cut begins');
  } finally { await server.close(); }
});

test('a cut knows when it began and how long it lasts, even when fast songs halve the cuts', async () => {
  const { server, pulise } = await load();
  try {
    const beats = [100, 500, 900, 1300];
    assert.deepEqual(pulise.cutSpan(beats, 2, 400, 950), { startMs: 500, ageMs: 450, lengthMs: 400 });
    assert.deepEqual(pulise.cutSpan(beats, 0, 0, 40), { startMs: 0, ageMs: 40, lengthMs: 0 });
    const fast = [100, 400, 700, 1000];
    assert.deepEqual(pulise.cutSpan(fast, 3, 300, 800), { startMs: 400, ageMs: 400, lengthMs: 600 });
  } finally { await server.close(); }
});

test('a strong beat comes from the music alone: a downbeat in the cut or a surge of loudness', async () => {
  const { server, pulise } = await load();
  try {
    const flat = Array.from({ length: 300 }, (_, i) => ({ timeMs: i * 10, rms: 0.2 }));
    const music = { beatsMs: [500, 1000, 1500, 2000], downbeatsMs: [1000], energy: flat };
    assert.equal(pulise.strongCut(null, 1000, 500), false);
    assert.equal(pulise.strongCut(music, 1000, 500), true, 'downbeat');
    assert.equal(pulise.strongCut(music, 1500, 500), false, 'steady and off the downbeat');
    assert.equal(pulise.strongCut({ ...music, downbeatsMs: [] }, 1000, 500), false);
    const surge = flat.map(point => point.timeMs >= 1500 ? { ...point, rms: 0.5 } : point);
    assert.equal(pulise.strongCut({ ...music, energy: surge }, 1500, 500), true, 'a loud hit');
    assert.equal(pulise.strongCut({ ...music, downbeatsMs: undefined, energy: [] }, 1500, 500), false, 'no data, no flash');
  } finally { await server.close(); }
});

test('every colour on screen is a strong neon (or the black it glows on), and the type always stands out', async () => {
  const { server, palettes } = await load();
  try {
    // The rule itself: pastel, pale, white and washed-out colours fail it.
    for (const weak of ['#ffffff', '#fbfdff', '#ff71ce', '#b967ff', '#ffd0d4', '#ffb3b3', '#c8f7c5', '#fff6fb', '#ff8c8c', '#7affd9', '#cc3344', '#cc99ff']) {
      assert.equal(palettes.isNeon(weak), false, `${weak} is not neon`);
    }
    for (const color of Object.values(palettes.NEON_COLORS)) {
      const { saturation, brightness } = palettes.strength(color);
      assert.ok(saturation >= 0.85 && brightness >= 0.95, `${color} saturation ${saturation.toFixed(2)} brightness ${brightness.toFixed(2)}`);
    }
    assert.ok(palettes.NEON_IDS.length >= 40, 'plenty of sets to deal from');
    const hueSets = new Set();
    for (const id of palettes.NEON_IDS) {
      const neons = palettes.neonColors(id);
      assert.ok(neons.every(palettes.isNeon), `${id} holds only strong neon`);
      assert.equal(new Set(neons).size, 4, `${id} four different neons`);
      hueSets.add([...neons].sort().join());
      for (let cut = 0; cut < palettes.CUTS_PER_ROUND * 3; cut++) {
        const phase = palettes.puliseCut(id, cut);
        const flash = palettes.puliseColours(id, cut, 10, 600, true);
        for (const shown of [phase, flash]) {
          for (const color of [shown.field, shown.ink]) assert.ok(palettes.isNeon(color) || color === palettes.VOID, `${id} #${cut} shows ${color}`);
          assert.ok(palettes.contrast(shown.ink, shown.field) >= palettes.READABLE, `${id} #${cut} type ${shown.ink} on ${shown.field}`);
        }
        assert.notEqual(phase.field, palettes.puliseCut(id, cut + 1).field, `${id} #${cut} cuts to a new colour`);
      }
      assert.ok(new Set(Array.from({ length: palettes.CUTS_PER_ROUND }, (_, cut) => palettes.puliseCut(id, cut).field)).size >= 4, `${id} cuts through several colours`);
    }
    assert.equal(hueSets.size, palettes.NEON_IDS.length, 'no two sets are the same four neons');
    assert.equal(palettes.puliseCut('acid', 6).field, palettes.puliseCut('acid', 0).field, 'the round repeats');
  } finally { await server.close(); }
});

test('four cards in a row differ, every refresh brings other sets, and the same seed always gives the same row', async () => {
  const { server, look, palettes } = await load();
  try {
    const seen = new Set();
    const rows = new Set();
    for (let generation = 0; generation < 40; generation++) {
      const row = look.puliseLooks(`song:${generation}:pulise`, 4);
      assert.equal(new Set(row.map(card => card.neon)).size, 4, `#${generation} repeats a set`);
      for (const card of row) seen.add(card.neon);
      rows.add(row.map(card => card.neon).join());
    }
    assert.equal(rows.size, 40, 'every refresh deals a different row');
    assert.ok(seen.size >= palettes.NEON_IDS.length * 0.8, `40 refreshes showed only ${seen.size} sets`);
    const key = row => JSON.stringify(row);
    assert.equal(key(look.puliseLooks('a', 4)), key(look.puliseLooks('a', 4)));
    assert.notEqual(key(look.puliseLooks('a', 4)), key(look.puliseLooks('b', 4)));
  } finally { await server.close(); }
});

test('no lyric text or meaning reaches a pulise card, so none can reach the cloud with it', async () => {
  const { server, look, palettes } = await load();
  try {
    const song = look.puliseLooks('seed', 4);
    const wire = JSON.stringify(song);
    for (const secret of ['hello', 'love', 'meaning', 'attitude']) assert.ok(!wire.includes(secret), secret);
    for (const card of song) {
      assert.deepEqual(Object.keys(card), ['neon']);
      assert.ok(palettes.NEON_IDS.includes(card.neon));
    }
  } finally { await server.close(); }
});

test('the cloud worker accepts exactly the neon sets the page knows', async () => {
  const { server, palettes } = await load();
  try {
    const worker = readFileSync(new URL('../../audio-intelligence/modal_creatives_encode_staging.py', import.meta.url), 'utf8');
    const listed = [...worker.match(/PULISE_NEONS = \{([^}]*)\}/)[1].matchAll(/"(\w+)"/g)].map(match => match[1]).sort();
    assert.deepEqual(listed, [...palettes.NEON_IDS].sort());
  } finally { await server.close(); }
});
