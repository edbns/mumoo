import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  return {
    server,
    look: await server.ssrLoadModule('/src/spray-look.ts'),
    grains: await server.ssrLoadModule('/src/spray-grains.ts'),
    colors: await server.ssrLoadModule('/src/dust-colors.ts'),
  };
}

/** A song of `count` cues `gap` ms apart (every third one held long), with a beat every 500 ms and a bar every 2000 ms. */
function song(count, gap = 200) {
  const cues = Array.from({ length: count }, (_, i) => ({ text: `word${i}`, startMs: i * gap, endMs: i * gap + (i % 3 === 0 && gap >= 400 ? 390 : 150) }));
  const beatsMs = Array.from({ length: 40 }, (_, i) => i * 500);
  const downbeatsMs = Array.from({ length: 8 }, (_, i) => i * 2000);
  return { cues, beatsMs, downbeatsMs };
}

test('every wall is a clean ground with two or three paints that stand out from it', async () => {
  const { server, look, colors } = await load();
  try {
    assert.equal(look.SPRAY_PALETTES.length, 6);
    const kinds = { dark: 0, light: 0 };
    for (const { ground, sprays } of look.SPRAY_PALETTES) {
      assert.ok(sprays.length >= 2 && sprays.length <= 3, 'two or three paints');
      for (const color of [...ground, ...sprays]) assert.match(color, /^#[0-9a-f]{6}$/);
      // The ground is smooth: its two ends are the same colour but for the faintest fade.
      const [top, bottom] = ground.map(color => [1, 3, 5].map(at => parseInt(color.slice(at, at + 2), 16)));
      assert.ok(top.every((level, at) => Math.abs(level - bottom[at]) <= 24), 'a very soft fade');
      for (const spray of sprays) for (const end of ground) assert.ok(colors.contrast(spray, end) >= 3, `${spray} on ${end} reads`);
      const light = colors.luminance(ground[0]);
      assert.ok(light < 0.06 || light > 0.3, 'a dark wall or a light one, not a grey in between');
      kinds[light < 0.06 ? 'dark' : 'light']++;
    }
    assert.ok(kinds.dark >= 2 && kinds.light >= 2, 'both dark and light walls');
    assert.equal(new Set(look.SPRAY_PALETTES.map(palette => palette.id)).size, 6, 'every wall has its own id');
    for (const palette of look.SPRAY_PALETTES) assert.equal(look.sprayPaletteById(palette.id), palette);
    assert.throws(() => look.sprayPaletteById('not-a-wall'), /not-a-wall/, 'an unknown wall is an error, not a stand-in');
  } finally { await server.close(); }
});

test('a word is sprayed in the same place every time, inside the limits, in a different paint from the one before it', async () => {
  const { server, look } = await load();
  try {
    for (let index = 0; index < 120; index++) {
      const place = look.placeWord(7, index, 3);
      assert.deepEqual(place, look.placeWord(7, index, 3), 'same seed and index, same place');
      assert.ok(Math.abs(place.rotation) <= (20 * Math.PI) / 180 + 1e-9, 'within 20 degrees');
      assert.ok(place.u >= 0 && place.u < 1 && place.v >= 0 && place.v < 1);
      assert.ok(place.ink >= 0 && place.ink < 3);
      if (index) assert.notEqual(place.ink, look.placeWord(7, index - 1, 3).ink, 'a word never takes the paint of the one before');
      const [x, y] = look.wordCentre(place, 900, 260);
      assert.ok(x - 450 >= look.SAFE_X - 80 && x + 450 <= 1080 - look.SAFE_X + 80, 'inside the sides of the frame');
      assert.ok(y >= look.PLACE_TOP && y <= look.PLACE_BOTTOM, 'above the platform buttons');
    }
    assert.notDeepEqual(look.placeWord(7, 3, 3), look.placeWord(8, 3, 3), 'another seed scatters differently');
  } finally { await server.close(); }
});

test('the wall is wiped after a phrase and every four bars, and holds at most ten words and one fading out', async () => {
  const { server, look } = await load();
  try {
    const { cues, downbeatsMs } = song(40);
    cues.push({ text: 'y', startMs: 9000, endMs: 9100 });
    const breaks = look.pageBreaks(cues, downbeatsMs);
    assert.deepEqual(breaks, [8000, 7950 + look.PHRASE_HOLD_MS], 'four bars in, and after the phrase a moment after its last word');
    assert.equal(look.pageAt(cues, breaks, 3900).words.length, look.MAX_WORDS + 1, 'a long wall keeps the newest ten and the one fading out');
    const after = look.pageAt(cues, breaks, 8100);
    assert.deepEqual(after.words, [], 'a wiped wall starts empty');
    assert.ok(after.wiping && after.wiping.progress < 1, 'the old wall is still being wiped');
    assert.ok(after.wiping.words.every(index => cues[index].startMs < 8000));
    assert.equal(look.pageAt(cues, breaks, 7950 + look.PHRASE_HOLD_MS + look.WIPE_MS).wiping, null, 'the wipe is over');
    assert.ok(look.wipeEdge(0) <= -look.WIPE_BAND + 1e-9 && look.wipeEdge(1) >= 1920 + 0.3 * 1080 + look.WIPE_BAND, 'the sweep starts clear of the frame and ends past all of it');
  } finally { await server.close(); }
});

test('the newest word is solid and the biggest, older ones fade and shrink, and ranks slide instead of jumping', async () => {
  const { server, look } = await load();
  try {
    assert.equal(look.wordAlpha(0), 1);
    assert.equal(look.wordScale(0), 1);
    for (let rank = 0; rank < look.MAX_WORDS; rank++) {
      assert.ok(look.wordAlpha(rank + 1) < look.wordAlpha(rank), 'each older word is fainter');
      assert.ok(look.wordScale(rank + 1) < look.wordScale(rank), 'and smaller');
    }
    assert.equal(look.wordAlpha(look.MAX_WORDS), 0, 'the oldest has faded out');
    const { cues } = song(6);
    const words = [2, 3, 4, 5];
    assert.deepEqual(look.wordRanks(cues, words, cues[5].startMs + look.RANK_EASE_MS), [3, 2, 1, 0], 'settled');
    assert.deepEqual(look.wordRanks(cues, words, cues[5].startMs), [2, 1, 0, 0], 'just as the newest comes, the others have not moved yet');
    const mid = look.wordRanks(cues, words, cues[5].startMs + look.RANK_EASE_MS / 2);
    assert.ok(mid[0] > 2 && mid[0] < 3 && mid[3] === 0);
  } finally { await server.close(); }
});

test('a beat hits the newest word, a downbeat harder, and the hit dies away', async () => {
  const { server, look } = await load();
  try {
    const beats = [0, 500, 1000, 1500];
    const downbeats = [0, 1500];
    const kick = ms => look.hitKick(look.hitAt(ms, beats, downbeats));
    assert.equal(look.hitAt(-1, beats, downbeats), null, 'nothing before the first beat');
    assert.ok(kick(1520) > kick(1020), 'a downbeat hits harder than a plain beat');
    assert.ok(kick(1520) > kick(1900), 'it dies away');
    assert.ok(kick(1900) < 0.01);
  } finally { await server.close(); }
});

test('what happens to a word is decided by the cues and the beats alone', async () => {
  const { server, look } = await load();
  try {
    const { cues, beatsMs, downbeatsMs } = song(40, 400);
    const plan = index => look.planWord(5, index, cues, beatsMs, downbeatsMs, 3);
    let marks = 0;
    let scribbles = 0;
    for (let index = 0; index < cues.length; index++) {
      assert.deepEqual(plan(index), plan(index), 'a pure function');
      const { sweepMs, puffsMs, splatsMs, drips, mark, scribble, ink, accent } = plan(index);
      assert.ok(sweepMs >= 250 && sweepMs <= 400, 'the nozzle takes 250–400 ms');
      assert.notEqual(ink, accent, 'a mark or scribble is in another paint');
      assert.ok([...puffsMs, ...splatsMs].every(at => at >= 0 && at < 2400), 'beats only hit a word while it is the newest');
      assert.ok(puffsMs.every(at => !downbeatsMs.includes(cues[index].startMs + at)), 'a plain beat puffs, a downbeat splatters');
      assert.ok(drips.every(({ atMs, count }) => atMs >= 0 && count >= 1 && count <= 3));
      if (mark) marks++;
      if (scribble) {
        scribbles++;
        assert.equal(scribble.atMs, cues[index + 3].startMs - cues[index].startMs, 'a word is crossed out when the third word after it is sprayed');
        assert.equal(mark, null, 'a word is marked or crossed out, not both');
      }
    }
    assert.ok(marks > 0 && scribbles > 0, 'both happen now and then');
    assert.ok(marks < cues.length / 2 && scribbles < cues.length / 2, 'but not to every word');
    assert.equal(plan(cues.length - 1).scribble, null, 'the last words have nothing after them to be crossed out by');
  } finally { await server.close(); }
});

test('a drip runs, slows and stops for good', async () => {
  const { server, look } = await load();
  try {
    assert.equal(look.dripReach(-50), 0, 'nothing before it starts');
    assert.equal(look.dripReach(0), 0);
    let before = 0;
    for (let ms = 0; ms <= look.DRIP_MS; ms += 20) {
      const reach = look.dripReach(ms);
      assert.ok(reach >= before, 'it only runs down');
      before = reach;
    }
    assert.equal(look.dripReach(look.DRIP_MS), 1, 'it reaches its length');
    assert.equal(look.dripReach(look.DRIP_MS * 5), 1, 'and stays there');
    assert.ok(look.dripReach(look.DRIP_MS / 2) > 0.5, 'most of the run is early: it slows as it goes');
  } finally { await server.close(); }
});

/** A stencil of a solid block `w` × `h` with a 24 px border. */
function block(w, h, pad = 24) {
  const width = w + pad * 2;
  const height = h + pad * 2;
  const alpha = new Uint8Array(width * height);
  for (let y = pad; y < pad + h; y++) alpha.fill(255, y * width + pad, y * width + pad + w);
  return { width, height, pad, alpha };
}

test('a word is made of soft grains, speckle and drips from its lowest edge, the same every time', async () => {
  const { server, look, grains } = await load();
  try {
    const cues = [{ text: 'block', startMs: 0, endMs: 300 }, { text: 'next', startMs: 100, endMs: 400 }];
    const plan = { ...look.planWord(3, 0, cues, [], [], 3), puffsMs: [450], splatsMs: [900], drips: [{ atMs: 900, count: 3 }], mark: null, scribble: null };
    const mask = block(300, 100);
    const { grains: data, drips } = grains.sprayWord(mask, plan);
    assert.deepEqual(grains.sprayWord(mask, plan).grains, data, 'the same word, the same grains');
    assert.deepEqual(grains.sprayWord(mask, plan).drips, drips);
    assert.equal(data.length % grains.GRAIN_FLOATS, 0);

    const grain = n => ({ x: data[n * 10], y: data[n * 10 + 1], radius: data[n * 10 + 2], alpha: data[n * 10 + 3], arrives: data[n * 10 + 4], flight: data[n * 10 + 5], soft: data[n * 10 + 8], ink: data[n * 10 + 9] });
    const all = Array.from({ length: data.length / grains.GRAIN_FLOATS }, (_, n) => grain(n));
    assert.ok(all.length > 2000, 'thousands of grains');
    assert.ok(all.every(g => g.alpha > 0 && g.alpha <= 1 && g.radius > 0 && g.arrives >= 0));
    const body = all.filter(g => g.flight === 0);
    assert.ok(body.every(g => g.arrives <= plan.sweepMs + 80), 'the letters are on within the sweep');
    assert.ok(body.some(g => g.arrives < plan.sweepMs * 0.2) && body.some(g => g.arrives > plan.sweepMs * 0.8), 'and arrive over the whole sweep, not at once');
    const lefts = body.filter(g => g.x < -100);
    const rights = body.filter(g => g.x > 100);
    const mean = list => list.reduce((sum, g) => sum + g.arrives, 0) / list.length;
    assert.ok(mean(lefts) < mean(rights), 'the nozzle sweeps left to right');
    assert.ok(all.some(g => g.soft >= 0.9 && g.radius > 10), 'a soft halo');
    assert.ok(all.some(g => g.soft === 0 && g.radius < 3), 'tiny hard speckle');
    assert.ok(all.filter(g => g.flight > 0).every(g => g.arrives === 450 || g.arrives === 900), 'flung droplets leave on the beat');
    assert.ok(all.some(g => g.arrives === 450) && all.some(g => g.arrives === 900), 'a puff and a splatter');

    const drip = n => Array.from({ length: grains.DRIP_FLOATS }, (_, k) => drips[n * grains.DRIP_FLOATS + k]);
    assert.ok(drips.length / grains.DRIP_FLOATS >= 1 && drips.length / grains.DRIP_FLOATS <= 3);
    for (let n = 0; n < drips.length / grains.DRIP_FLOATS; n++) {
      const [x, y, width, length, starts] = drip(n);
      assert.ok(Math.abs(x) <= 150, 'under the letters');
      assert.ok(y >= 50 - 6 && y <= 50, 'leaving the lowest edge of the ink');
      assert.ok(width > 0 && length > 40, 'a thin run with some length');
      assert.ok(starts >= 900, 'on the downbeat');
    }
  } finally { await server.close(); }
});
