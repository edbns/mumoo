import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';

function profile(genre = 'House', lyrics = 'hello', sha = 'a'.repeat(64), meaning) {
  const frames = Array.from({ length: 20 }, (_, i) => ({
    timeMs: i * 100, rms: 0.2, onsetStrength: 1, centroidHz: 2200, bandwidthHz: 1600, rolloffHz: 3000,
  }));
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

const WORKER = readFileSync(new URL('../../audio-intelligence/modal_creatives_encode_staging.py', import.meta.url), 'utf8');
/** The quoted words inside the worker's `NAME = { ... }`. */
const workerSet = name => [...WORKER.match(new RegExp(`^${name} = \\{([^}]*)\\}`, 'm'))[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);

const PLATES = [{ id: 'burnnet-woman-1547507-1920', cutout: true }];
/** Every row of the shelf, in order. */
const shelf = (pack, person, generation = 0, plates = PLATES) => pack.SHELF_ROWS.flatMap(row => pack.recommendRow(row.id, person, generation, plates));
/** Moving backgrounds: not on the shelf, but still dealt. */
const looks = (pack, person, generation = 0) => pack.recommendRow('looks', person, generation, PLATES);

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  const pack = await server.ssrLoadModule('/src/creatives-pack.ts');
  return { server, pack };
}

test('the shelf is seven rows of four, in order, each card distinct', async () => {
  const { server, pack } = await load();
  try {
    for (const genre of ['Gospel', 'Slap House', 'Pop', 'Ambient']) {
      const slots = shelf(pack, profile(genre));
      assert.equal(slots.length, 28, genre);
      assert.deepEqual([...new Set(slots.map(slot => slot.row))], ['photography', 'riso', 'spray', 'window', 'doodle', 'pulise', 'dust'], 'rows come in order');
      assert.deepEqual(pack.SHELF_ROWS.map(row => row.title), ['Our photography', 'Riso', 'Spray', 'Window', 'Doodle', 'Pulise', 'Dust']);
      for (const row of ['photography', 'riso', 'spray', 'window', 'doodle', 'pulise', 'dust']) assert.equal(slots.filter(slot => slot.row === row).length, 4, `${genre} ${row}`);
      const photography = slots.filter(slot => slot.row === 'photography');
      // A card is a baked effect, or (with a live look, while the library is short) our one approved photo, once.
      assert.equal(new Set(photography.map(slot => slot.effectId ?? slot.plateId)).size, 4, `${genre} photography repeats a picture`);
      assert.ok(photography.filter(slot => slot.plateId).length <= 1, `${genre} draws our one photo on more than one card`);
      assert.equal(new Set(photography.map(slot => slot.typeStyle)).size, 4, `${genre} photography repeats a type style`);
      assert.ok(photography.every(slot => slot.colors === undefined && slot.filter === undefined && (slot.plateId === undefined) !== (slot.effectId === undefined)), 'photography is drawn from a baked effect or our photo, never both');
      assert.ok(photography.filter(slot => slot.plateId).every(slot => slot.look), 'our photo is dealt to a card only to carry a live look');
      assert.ok(slots.filter(slot => slot.row === 'dust').every(slot => slot.plateId === 'burnnet-woman-1547507-1920'), 'Dust is drawn from the approved photo');
      const pulise = slots.filter(slot => slot.row === 'pulise');
      assert.equal(new Set(pulise.map(slot => slot.layout.cut)).size, 4, `${genre} Pulise cards open on the same colour`);
      const pairs = new Set(looks(pack, profile(genre)).map(slot => `${slot.bankId}:${slot.typeStyle}`));
      assert.equal(pairs.size, 4, `${genre} Moving backgrounds repeats a background+type pair`);
      assert.equal(new Set(slots.map(slot => slot.id)).size, slots.length, `${genre} repeats an id`);
    }
  } finally { await server.close(); }
});

test('Dust only uses approved photos that have a cut-out, and waits for the person\'s own when there are none', async () => {
  const { server, pack } = await load();
  try {
    const person = profile('Pop');
    const plates = [{ id: 'no-mask', cutout: false }, { id: 'with-mask', cutout: true }];
    assert.ok(pack.recommendRow('dust', person, 0, plates).every(slot => slot.plateId === 'with-mask'));
    assert.ok(pack.recommendRow('dust', person, 0, [{ id: 'no-mask', cutout: false }]).every(slot => slot.plateId === undefined));
    assert.equal(pack.recommendRow('photography', person, 0, []).length, 4, 'photography needs no approved photo of ours');
  } finally { await server.close(); }
});

/** The baked effects the app can deal, as measured when they were baked. */
async function effects(server) {
  const { default: list } = await server.ssrLoadModule('/punch-plates/effects/effects.json');
  return list;
}

test('every baked effect has its picture, and Our photography deals four different ones', async () => {
  const { server, pack } = await load();
  try {
    const list = await effects(server);
    assert.equal(list.length, 37);
    for (const effect of list) {
      assert.match(effect.id, /^[a-z0-9][a-z0-9-]{0,60}$/);
      assert.ok(existsSync(new URL(`../punch-plates/effects/${effect.id}.jpg`, import.meta.url)), `${effect.id}.jpg is missing`);
      assert.equal(effect.file, `${effect.id}.jpg`);
    }
    const ids = new Set(list.map(effect => effect.id));
    for (const genre of ['Gospel', 'Ambient', 'House', 'Pop']) {
      for (let generation = 0; generation < 12; generation++) {
        const row = pack.recommendRow('photography', profile(genre), generation, []);
        const dealt = row.map(slot => slot.effectId);
        assert.equal(new Set(dealt).size, 4, `${genre} #${generation} repeats an effect`);
        assert.ok(dealt.every(id => ids.has(id)), `${genre} #${generation} deals an effect that does not exist`);
        const collections = row.map(slot => list.find(effect => effect.id === slot.effectId).collection);
        if (generation < 5) assert.equal(new Set(collections).size, 4, `${genre} #${generation} deals one collection twice`);
        row.forEach(slot => assert.equal(slot.label, list.find(effect => effect.id === slot.effectId).title, 'the label is the effect\'s title'));
      }
    }
  } finally { await server.close(); }
});

test('a refresh deals four effects the earlier ones did not, and the deal is seeded', async () => {
  const { server, pack } = await load();
  try {
    const row = (person, generation) => pack.recommendRow('photography', person, generation, []);
    const person = profile('Pop');
    const first = [];
    for (let generation = 0; generation < 5; generation++) first.push(...row(person, generation).map(slot => slot.effectId));
    assert.equal(new Set(first).size, 20, 'five refreshes in a row never repeat an effect');
    assert.deepEqual(row(person, 3).map(slot => slot.id), row(person, 3).map(slot => slot.id), 'the same song and refresh deal the same cards, with the same ids');
    assert.notDeepEqual(row(person, 0).map(slot => slot.effectId), row(profile('Pop', 'hello', 'b'.repeat(64)), 0).map(slot => slot.effectId), 'another song is dealt other effects');
    assert.equal(new Set(shelf(pack, person).map(slot => slot.id)).size, 28);
  } finally { await server.close(); }
});

test('calm songs are not first dealt the harsh effects, club songs are', async () => {
  const { server, pack } = await load();
  try {
    const list = await effects(server);
    const mood = slot => list.find(effect => effect.id === slot.effectId).mood;
    const harsh = ['glitchy', 'techno', 'retro', 'graphic', 'bold'];
    // Gospel by genre, and a quiet lane by what the words say (a pop song with lonely lyrics).
    const lonely = { attitude: 'lonely', sadness: 3, intensity: 2 };
    for (const [genre, sha, meaning] of [['Gospel', 'a'], ['Gospel', 'b'], ['Pop', 'a', lonely], ['Pop', 'c', lonely]]) {
      const person = profile(genre, 'hello', sha.repeat(64), meaning);
      for (let generation = 0; generation < 3; generation++) {
        for (const slot of pack.recommendRow('photography', person, generation, [])) assert.ok(!harsh.includes(mood(slot)), `${genre} #${generation} was dealt ${slot.effectId}`);
      }
    }
    let loud = 0;
    for (const sha of 'abcdef') loud += pack.recommendRow('photography', profile('Techno', 'hello', sha.repeat(64)), 0, []).filter(slot => harsh.includes(mood(slot))).length;
    assert.ok(loud >= 18, `club songs lead with the harsh looks, got ${loud} of 24`);
  } finally { await server.close(); }
});

test('the cover colours lead the effects, and sad words never sit on a bright one', async () => {
  const { server, pack } = await load();
  try {
    const list = await effects(server);
    const read = slot => list.find(effect => effect.id === slot.effectId);
    const cover = (hex, extra) => ({ palette: [{ hex, share: 1 }], lightness: 0.5, saturation: 0.8, contrast: 0.5, hue: 20, warmth: 1, ...extra });
    const withCover = value => ({ ...profile('Pop'), creator: { primaryGenre: { value: 'Pop', source: 'creator' }, cover: { value, source: 'embedded_metadata' } } });
    const warmth = value => pack.recommendRow('photography', withCover(value), 0, []).reduce((n, slot) => n + read(slot).warmth, 0) / 4;
    assert.ok(warmth(cover('#e1782a')) > warmth(cover('#2a3ea0', { hue: 230, warmth: 0, lightness: 0.25 })) + 0.15, 'a warm cover is dealt warmer effects than a cool one');

    const sad = { attitude: 'lonely', sadness: 3, intensity: 2 };
    for (let generation = 0; generation < 9; generation++) {
      for (const slot of pack.recommendRow('photography', profile('Pop', 'tears fall like rain tonight alone', 'a'.repeat(64), sad), generation, [])) assert.ok(read(slot).lightness < 0.6, `${slot.effectId} is too bright for sad words`);
    }
  } finally { await server.close(); }
});

test('the brain matches type to mood (gospel is never stack/outline, club never minimal)', async () => {
  const { server, pack } = await load();
  try {
    // Calm music never slams, club music never whispers; the full lists are checked in type-fx.test.mjs.
    const loud = ['stack', 'outline', 'glitch', 'stretch', 'split', 'bounce', 'rotate', 'scatter', 'zoom', 'echo', 'flicker', 'tilt'];
    const gospel = shelf(pack, profile('Gospel')).filter(slot => slot.typeStyle);
    for (const slot of gospel) assert.ok(!loud.includes(slot.typeStyle), slot.typeStyle);
    const club = shelf(pack, profile('Slap House')).filter(slot => slot.typeStyle);
    for (const slot of club) assert.ok(!['minimal', 'editorial'].includes(slot.typeStyle), slot.typeStyle);
  } finally { await server.close(); }
});

test('lyrics steer the lane when genre does not lock it', async () => {
  const { server, pack } = await load();
  try {
    const spiritual = { attitude: 'spiritual', sadness: 0, intensity: 3 };
    const faith = shelf(pack, profile('Pop', 'praise the lord', 'a'.repeat(64), spiritual));
    assert.ok(faith[0].reason.startsWith('gospel'), faith[0].reason);
    const sad = shelf(pack, profile('Pop', 'hello', 'a'.repeat(64), { attitude: 'heartbroken', sadness: 3, intensity: 2 }));
    assert.ok(sad[0].reason.startsWith('quiet'), sad[0].reason);
    // Genre lock wins over lyrics.
    const club = shelf(pack, profile('Techno', 'praise the lord', 'a'.repeat(64), spiritual));
    assert.ok(club[0].reason.startsWith('techno'), club[0].reason);
  } finally { await server.close(); }
});

test('seeded: stable for same input, different across generations and songs', async () => {
  const { server, pack } = await load();
  try {
    const key = slots => slots.map(slot => slot.id).join('|');
    const a = shelf(pack, profile('Pop'), 0);
    assert.equal(key(a), key(shelf(pack, profile('Pop'), 0)));
    assert.notEqual(key(a), key(shelf(pack, profile('Pop'), 1)));
    assert.notEqual(key(a), key(shelf(pack, profile('Pop', 'hello', 'b'.repeat(64)), 0)));
  } finally { await server.close(); }
});

test('club songs keep club fonts', async () => {
  const { server, pack } = await load();
  try {
    const { DISPLAY_FACES } = await server.ssrLoadModule('/src/font-catalog.ts');
    const clubMoods = ['brutal', 'techno', 'pixel', 'graffiti'];
    // Doodle writes in its own hand (a marker), whatever the song is.
    for (const slot of shelf(pack, profile('Slap House')).filter(item => item.row !== 'doodle')) {
      for (const font of [slot.font, slot.fontSecondary]) assert.ok(DISPLAY_FACES[font].moods.some(mood => clubMoods.includes(mood)), font);
    }
  } finally { await server.close(); }
});

test('sad lyrics never land on a bright background', async () => {
  const { server, pack } = await load();
  try {
    const bank = (await import('../src/look-lab/bank.json', { with: { type: 'json' } })).default;
    const tone = new Map(bank.map(item => [item.slug, item.tone]));
    for (const gen of [0, 1, 2]) {
      for (const slot of looks(pack, profile('Ambient', 'tears fall like rain tonight alone', 'a'.repeat(64), { attitude: 'lonely', sadness: 3, intensity: 2 }), gen)) {
        assert.equal(tone.get(slot.bankId), 'deep', slot.bankId);
      }
    }
  } finally { await server.close(); }
});

test('the cover decides which backgrounds lead: warm cover → warm looks, cool cover → cool looks', async () => {
  const { server, pack } = await load();
  try {
    const { default: bank } = await server.ssrLoadModule('/src/look-lab/bank.json');
    const read = slug => bank.find(look => look.slug === slug).read;
    const cover = (hex, extra) => ({ palette: [{ hex, share: 1 }], lightness: 0.5, saturation: 0.8, contrast: 0.5, hue: 20, warmth: 1, ...extra });
    const withCover = value => ({ ...profile('Pop'), creator: { primaryGenre: { value: 'Pop', source: 'creator' }, cover: { value, source: 'embedded_metadata' } } });
    const lead = value => looks(pack, withCover(value)).slice(0, 3).map(slot => read(slot.bankId));

    const warm = lead(cover('#e1782a'));
    const cool = lead(cover('#2a3ea0', { hue: 230, warmth: 0, lightness: 0.25 }));
    assert.ok(warm.every(look => look.warmth > 0.6), 'warm cover leads with warm backgrounds');
    assert.ok(cool.every(look => look.warmth < 0.4), 'cool cover leads with cool backgrounds');

    // No cover: nothing changes, still a full pack.
    assert.equal(shelf(pack, profile('Pop')).length, 28, 'still a full shelf');
  } finally { await server.close(); }
});

test('club songs get cards that look different: one per effect, at most two per colour family', async () => {
  const { server, pack } = await load();
  try {
    const { default: bank } = await server.ssrLoadModule('/src/look-lab/bank.json');
    const { colorFamily, effectFamily } = await server.ssrLoadModule('/src/look-fit.ts');
    const look = slug => bank.find(item => item.slug === slug);
    for (const genre of ['House', 'Techno', 'Slap House', 'EDM']) {
      for (let generation = 0; generation < 12; generation++) {
        const cards = looks(pack, profile(genre, 'hello', 'b'.repeat(64)), generation);
        const backgrounds = cards.map(slot => look(slot.bankId));
        const effects = backgrounds.map(item => effectFamily(item.slug));
        assert.equal(new Set(effects).size, effects.length, `${genre} #${generation} repeats an effect: ${effects}`);
        const families = backgrounds.map(item => colorFamily(item.read));
        const counts = families.reduce((all, name) => ({ ...all, [name]: (all[name] ?? 0) + 1 }), {});
        assert.ok(Math.max(...Object.values(counts)) <= 2, `${genre} #${generation} leans on one colour: ${JSON.stringify(counts)}`);
        assert.ok(new Set(families).size >= 3, `${genre} #${generation} has too few colour families: ${families}`);
      }
    }
  } finally { await server.close(); }
});

test('the lyrics grade the colours and calm the beat without changing the look', async () => {
  const { server, pack } = await load();
  try {
    const sha = 'a'.repeat(64);
    const plain = shelf(pack, profile('Slap House', 'hello', sha));
    // Words that say nothing change nothing.
    assert.ok(plain.every(slot => !slot.grade));
    const neutral = shelf(pack, profile('Slap House', 'hello', sha, { attitude: 'neutral', sadness: 0, intensity: 3 }));
    assert.deepEqual(neutral.map(slot => slot.id), plain.map(slot => slot.id));
    assert.ok(neutral.every(slot => !slot.grade));

    // Sad words on a club song: same lane and looks, sadder colours, calmer hits. Riso inks, Spray paints, Window screens and the Doodle paper are the design, so they are not graded.
    const sad = shelf(pack, profile('Slap House', 'hello', sha, { attitude: 'heartbroken', sadness: 3, intensity: 2 }));
    assert.ok(sad.every(slot => slot.reason.startsWith('techno')));
    const graded = sad.filter(slot => !['riso', 'spray', 'window', 'doodle'].includes(slot.row));
    assert.equal(graded.length, 12);
    const grade = graded[0].grade;
    assert.ok(grade.saturation < 1 && grade.warmth < 0 && grade.brightness < 1 && grade.calm > 0.5, JSON.stringify(grade));
    assert.ok(graded.every(slot => JSON.stringify(slot.grade) === JSON.stringify(grade)));
    assert.ok(sad.filter(slot => ['riso', 'spray', 'window', 'doodle'].includes(slot.row)).every(slot => slot.grade === undefined), 'Riso, Spray, Window and Doodle keep their own colours');

    // Defiant and forceful: warmer, punchier, no calming.
    const defiant = shelf(pack, profile('Slap House', 'hello', sha, { attitude: 'defiant', sadness: 0, intensity: 4 }))[0].grade;
    assert.ok(defiant.warmth > 0 && defiant.contrast > 1 && defiant.calm === 0, JSON.stringify(defiant));
  } finally { await server.close(); }
});

test('the attitude of the words picks backgrounds that look like it', async () => {
  const { server, pack } = await load();
  try {
    const { default: bank } = await server.ssrLoadModule('/src/look-lab/bank.json');
    const fit = await server.ssrLoadModule('/src/look-fit.ts');
    const read = slug => bank.find(look => look.slug === slug).read;
    const mean = (slots, key) => slots.reduce((n, slot) => n + read(slot.bankId)[key], 0) / slots.length;
    const sha = 'c'.repeat(64);
    const song = meaning => looks(pack, profile('Pop', 'hello', sha, meaning));

    // Words with no particular feel leave the recommendation exactly as the sound made it.
    assert.deepEqual(song({ attitude: 'neutral', sadness: 0, intensity: 3 }).map(slot => slot.id), song(undefined).map(slot => slot.id));

    // Tender words lead with lighter, warmer pictures than angry ones; sad ones go darker and cooler still.
    const tender = song({ attitude: 'tender', sadness: 0, intensity: 2 });
    const angry = song({ attitude: 'angry', sadness: 0, intensity: 5 });
    const lonely = song({ attitude: 'lonely', sadness: 3, intensity: 1 });
    assert.ok(mean(tender, 'lightness') > mean(angry, 'lightness') + 0.1, 'tender is lighter than angry');
    assert.ok(mean(lonely, 'warmth') < mean(tender, 'warmth'), 'lonely is cooler than tender');

    // The fit itself: a defiant song suits a dark, saturated, warm look better than a pale grey one.
    const defiant = { attitude: 'defiant', sadness: 0, intensity: 4 };
    assert.ok(fit.attitudeFit(defiant, read('neon-flow-5')) > fit.attitudeFit(defiant, read('lit-rays-5')) + 0.2);
    // More sadness always asks for a darker, cooler picture, never a brighter one.
    const dark = fit.attitudeFit({ ...defiant, sadness: 3 }, read('shifted-swirls-9')) - fit.attitudeFit({ ...defiant, sadness: 0 }, read('shifted-swirls-9'));
    assert.ok(dark > 0, 'a very dark look fits better as sadness grows');
  } finally { await server.close(); }
});

test('every row is recommended on its own, so refreshing one never changes another', async () => {
  const { server, pack } = await load();
  try {
    const person = profile('Pop');
    const ids = (row, generation) => pack.recommendRow(row, person, generation, PLATES).map(slot => slot.id).join();
    for (const row of pack.SHELF_ROWS.map(def => def.id)) {
      assert.equal(pack.recommendRow(row, person, 0, PLATES).length, 4, `${row} has four cards`);
      assert.equal(ids(row, 0), ids(row, 0), `${row} is repeatable`);
      assert.notEqual(ids(row, 0), ids(row, 1), `${row} changes when refreshed`);
    }
    // Refreshing Dust leaves Our photography exactly as it was.
    assert.equal(ids('photography', 0), ids('photography', 0));
    assert.ok(pack.recommendRow('dust', person, 0, PLATES).every(slot => slot.colors && slot.row === 'dust'));
  } finally { await server.close(); }
});

test('rows say what they own: lyrics switch, upload kind, and Pulise and Spray take no upload', async () => {
  const { server, pack } = await load();
  try {
    const rows = Object.fromEntries(pack.SHELF_ROWS.map(def => [def.id, def]));
    assert.equal(rows.looks, undefined, 'Moving backgrounds is off the shelf');
    for (const row of ['pulise', 'spray']) {
      assert.equal(rows[row].lyrics, 'always', row);
      assert.equal(rows[row].upload, undefined, `${row} takes no upload`);
    }
    assert.equal(rows.dust.upload, 'dust');
    assert.equal(rows.riso.upload, 'riso');
    assert.equal(rows.photography.upload, 'filter');
    assert.equal(rows.window.upload, 'window');
    assert.equal(rows.window.lyrics, 'always', 'the word is the window');
    for (const row of ['photography', 'riso', 'dust']) assert.equal(rows[row].lyrics, 'switch', row);
  } finally { await server.close(); }
});

test('Riso deals four ink sets and four heavy faces, the same photo as Dust, and every refresh deals them again', async () => {
  const { server, pack } = await load();
  try {
    const { RISO_INK_SETS } = await server.ssrLoadModule('/src/riso-look.ts');
    const ids = RISO_INK_SETS.map(set => set.id);
    for (const genre of ['Gospel', 'Slap House', 'Pop', 'Ambient']) {
      const orders = new Set();
      for (let generation = 0; generation < 8; generation++) {
        const row = pack.recommendRow('riso', profile(genre), generation, PLATES);
        assert.equal(new Set(row.map(slot => slot.inkSet)).size, 4, `${genre} #${generation} repeats an ink set`);
        assert.ok(row.every(slot => ids.includes(slot.inkSet) && slot.style === 'riso' && slot.row === 'riso'));
        assert.equal(new Set(row.map(slot => slot.layout.seed)).size, 4, `${genre} #${generation} repeats a layout seed`);
        assert.ok(row.every(slot => slot.plateId === 'burnnet-woman-1547507-1920' && slot.typeStyle === undefined && slot.colors === undefined));
        row.forEach(slot => assert.equal(slot.label.toLowerCase(), RISO_INK_SETS.find(set => set.id === slot.inkSet).name, 'the label names the inks'));
        orders.add(row.map(slot => slot.inkSet).join());
      }
      assert.ok(orders.size >= 4, `${genre}: refreshing deals the ink sets in new orders`);
    }
    const none = pack.recommendRow('riso', profile('Pop'), 0, [{ id: 'no-mask', cutout: false }]);
    assert.ok(none.every(slot => slot.plateId === undefined), 'with no approved cut-out the card waits for the person\'s own photo');
  } finally { await server.close(); }
});

test('Spray deals four of its six walls and four heavy faces, and every refresh deals them again', async () => {
  const { server, pack } = await load();
  try {
    const { SPRAY_PALETTES } = await server.ssrLoadModule('/src/spray-look.ts');
    const ids = SPRAY_PALETTES.map(palette => palette.id);
    for (const genre of ['Gospel', 'Slap House', 'Pop', 'Ambient']) {
      const seen = new Set();
      for (let generation = 0; generation < 12; generation++) {
        const row = pack.recommendRow('spray', profile(genre), generation, PLATES);
        assert.equal(new Set(row.map(slot => slot.sprayPalette)).size, 4, `${genre} #${generation} repeats a wall`);
        assert.ok(row.every(slot => ids.includes(slot.sprayPalette) && slot.style === 'spray' && slot.row === 'spray'));
        assert.equal(new Set(row.map(slot => slot.layout.seed)).size, 4, `${genre} #${generation} repeats a layout seed`);
        assert.ok(row.every(slot => slot.plateId === undefined && slot.effectId === undefined && slot.typeStyle === undefined));
        row.forEach(slot => seen.add(slot.sprayPalette));
      }
      assert.equal(seen.size, 6, `${genre}: over twelve refreshes every wall is dealt`);
    }
  } finally { await server.close(); }
});

const WOMAN = 'burnnet-woman-1547507-1920';
const MODES = ['person', 'plain', 'effect', 'bank'];
/** The one picture a Window card is drawn from, as a key: its kind and which. */
const sourceOf = slot => `${slot.windowMode}:${slot.plateId ?? slot.effectId ?? slot.bankId ?? 'own'}`;

async function loadWindow() {
  const { server, pack } = await load();
  const deal = await server.ssrLoadModule('/src/window-deal.ts');
  const look = await server.ssrLoadModule('/src/window-look.ts');
  const { default: readings } = await server.ssrLoadModule('/src/window-readings.json');
  const { default: effects } = await server.ssrLoadModule('/punch-plates/effects/effects.json');
  const { default: bank } = await server.ssrLoadModule('/src/look-lab/bank.json');
  return { server, pack, deal, look, readings, effects, bank };
}

const GENRES = ['Gospel', 'Slap House', 'Pop', 'Ambient', 'Reggaeton'];
/** Every row dealt over several songs and refreshes, with the plates it was dealt from. */
function* windowRows(pack, plates, generations = 24) {
  for (const genre of GENRES) {
    for (let generation = 0; generation < generations; generation++) yield { genre, generation, row: pack.recommendRow('window', profile(genre, 'hello', `${genre.length}${generation % 3}`.padEnd(64, 'c')), generation, plates) };
  }
}

test('Window deals four distinct cards: no picture, screen, face or layout repeated, every screen one that reads against its picture', async () => {
  const { server, pack, look, readings } = await loadWindow();
  try {
    for (const { genre, generation, row } of windowRows(pack, PLATES)) {
      const name = `${genre} #${generation}`;
      assert.equal(row.length, 4, name);
      assert.ok(row.every(slot => slot.style === 'window' && slot.row === 'window' && slot.family === 'ad_punch'), name);
      assert.equal(new Set(row.map(slot => sourceOf(slot))).size, 4, `${name} repeats a picture`);
      assert.equal(new Set(row.map(slot => slot.windowPalette)).size, 4, `${name} repeats a screen`);
      assert.equal(new Set(row.map(slot => slot.font)).size, 4, `${name} repeats a face`);
      assert.equal(new Set(row.map(slot => slot.layout.seed)).size, 4, `${name} repeats a layout seed`);
      assert.equal(new Set(row.map(slot => slot.id)).size, 4, `${name} repeats an id`);
      for (const slot of row) {
        assert.ok(look.WINDOW_FACES.includes(slot.font) && slot.fontSecondary === slot.font, `${name}: ${slot.font} is not one of the condensed faces`);
        assert.ok(slot.windowAllowed.every(id => look.WINDOW_PALETTE_IDS.includes(id)) && slot.windowAllowed.includes(slot.windowPalette), name);
        assert.equal(slot.label, `${slot.windowPalette[0].toUpperCase()}${slot.windowPalette.slice(1).replace('-', ' ')}`, 'the label names the screen colour');
        assert.ok(slot.typeStyle === undefined && slot.colors === undefined && slot.grade === undefined && slot.inkSet === undefined && slot.cutSeed === undefined, `${name}: nothing but Window's own fields`);
        const key = slot.windowMode === 'effect' ? `effect:${slot.effectId}` : slot.windowMode === 'bank' ? `bank:${slot.bankId}` : `plate:${slot.plateId}`;
        const reading = readings[key];
        assert.deepEqual(slot.windowAllowed, slot.windowMode === 'person' ? reading.person : reading.plain, `${name}: ${key} is dealt the screens that read against it`);
      }
    }
  } finally { await server.close(); }
});

test('Window is a pure function of the seed: the same song and refresh deal the same cards, another refresh or song deals others', async () => {
  const { server, pack } = await loadWindow();
  try {
    const dealt = (genre, sha, generation) => JSON.stringify(pack.recommendRow('window', profile(genre, 'hello', sha.repeat(64)), generation, PLATES));
    assert.equal(dealt('Pop', 'a', 3), dealt('Pop', 'a', 3));
    assert.equal(dealt('Pop', 'a', 3), JSON.stringify(pack.recommendRow('window', profile('Pop', 'hello', 'a'.repeat(64)), 3, [...PLATES])));
    const refreshes = new Set(Array.from({ length: 10 }, (_, generation) => dealt('Pop', 'a', generation)));
    assert.equal(refreshes.size, 10, 'every refresh is a different row');
    assert.notEqual(dealt('Pop', 'a', 0), dealt('Pop', 'b', 0));
  } finally { await server.close(); }
});

test('Window mixes the kinds of picture by the seed: every kind turns up over a few refreshes, in changing mixes, and her photo at most once as person and once plain', async () => {
  const { server, pack } = await loadWindow();
  try {
    for (const genre of GENRES) {
      const seen = new Set();
      const mixes = new Set();
      for (let generation = 0; generation < 12; generation++) {
        const row = pack.recommendRow('window', profile(genre), generation, PLATES);
        const modes = row.map(slot => slot.windowMode);
        modes.forEach(mode => seen.add(mode));
        mixes.add([...modes].sort().join());
        assert.ok(modes.filter(mode => mode === 'person').length <= 1 && modes.filter(mode => mode === 'plain').length <= 1, `${genre} #${generation} shows her photo twice the same way: ${modes}`);
      }
      assert.deepEqual([...seen].sort(), [...MODES].sort(), `${genre}: over twelve refreshes every kind is dealt`);
      assert.ok(mixes.size >= 3, `${genre}: refreshing changes the mix of kinds (${[...mixes].join(' | ')})`);
    }
  } finally { await server.close(); }
});

test('Window never deals an illegal combination: her in front only of her own cut-out photo, effects and backgrounds only plain, only effects that suit a window', async () => {
  const { server, pack, deal, effects, bank } = await loadWindow();
  try {
    const collection = id => effects.find(effect => effect.id === id).collection;
    const lightness = id => effects.find(effect => effect.id === id).lightness;
    // Our photos: with a cut-out, without one, none.
    const sets = [PLATES, [{ id: WOMAN, cutout: false }], []];
    for (const plates of sets) {
      for (const { genre, generation, row } of windowRows(pack, plates, 30)) {
        const name = `${genre} #${generation} with ${plates.length} photos`;
        assert.equal(row.length, 4, name);
        for (const slot of row) {
          const sources = [slot.plateId, slot.effectId, slot.bankId].filter(Boolean);
          assert.equal(sources.length, 1, `${name}: ${slot.windowMode} card has ${sources.length} pictures`);
          if (slot.windowMode === 'person') assert.ok(plates.some(plate => plate.id === slot.plateId && plate.cutout), `${name}: person without a cut-out`);
          if (slot.windowMode === 'plain') assert.ok(slot.plateId && plates.some(plate => plate.id === slot.plateId), name);
          if (slot.windowMode === 'effect') {
            assert.ok(slot.effectId && deal.WINDOW_EFFECT_IDS.includes(slot.effectId), name);
            assert.ok(!['Glass Facets', 'Shuffle Sort', 'Quantized', 'Pixel Reveal'].includes(collection(slot.effectId)), `${name}: ${slot.effectId} moves the picture about`);
            assert.ok(lightness(slot.effectId) < 0.75, `${name}: ${slot.effectId} is washed out`);
            assert.ok(!['impression-trail-3', 'impression-trail-7', 'tinted-lenses-2'].includes(slot.effectId), `${name}: ${slot.effectId} is bright green`);
          }
          if (slot.windowMode === 'bank') assert.ok(bank.some(look => look.slug === slot.bankId), name);
          assert.ok(MODES.includes(slot.windowMode), name);
        }
        if (!plates.some(plate => plate.cutout)) assert.ok(row.every(slot => slot.windowMode !== 'person'), `${name}: nobody stands in front without a cut-out`);
        if (!plates.length) assert.ok(row.every(slot => ['effect', 'bank'].includes(slot.windowMode)), `${name}: with no photos only our effects and backgrounds are dealt`);
      }
    }
    // The excluded kinds really are the ones named, and there is plenty left to deal.
    for (const id of ['glass-facets-1', 'glass-facets-2', 'shuffle-sort-1', 'quantized-1', 'pixel-reveal-1', 'pixel-reveal-2', 'impression-trail-9', 'impression-trail-2']) assert.ok(!deal.WINDOW_EFFECT_IDS.includes(id), id);
    assert.ok(deal.WINDOW_EFFECT_IDS.length >= 20 && deal.WINDOW_BANK_IDS.length === 20, `${deal.WINDOW_EFFECT_IDS.length} effects, ${deal.WINDOW_BANK_IDS.length} backgrounds`);
  } finally { await server.close(); }
});

test('Window leaves out a picture nobody has read, and refuses a person nobody stands in, and a picture no screen reads against', async () => {
  const { server, deal } = await loadWindow();
  try {
    for (let seed = 0; seed < 30; seed++) {
      const cards = deal.dealWindow(`s${seed}`, [{ id: 'not-read-yet', cutout: true }], null);
      assert.equal(cards.length, 4);
      assert.ok(cards.every(card => card.plateId !== 'not-read-yet'), 'a photo nobody has read is left out of the deal, never a guess and never a crash');
    }
    assert.throws(() => deal.dealWindow('s', [], { reading: { plain: [], person: null }, clip: false }), /no screens/);
    assert.throws(() => deal.dealWindow('s', [], { reading: { plain: ['black'], person: [] }, clip: false }), /no screens/);
  } finally { await server.close(); }
});

test('with the person\'s own picture all four Window cards use it: a photo alternates her in front and plain, a photo with nobody in it and a clip are plain, a clip is cut differently for each card', async () => {
  const { server, pack, look } = await loadWindow();
  try {
    const ids = look.WINDOW_PALETTE_IDS;
    const plain = ids.filter((_, index) => index % 2 === 0);
    const person = ids.filter((_, index) => index % 3 !== 1);
    const own = { photo: { reading: { plain, person }, clip: false }, nobody: { reading: { plain, person: null }, clip: false }, clip: { reading: { plain, person: null }, clip: true } };
    for (const genre of GENRES) {
      for (let generation = 0; generation < 8; generation++) {
        const deal = kind => pack.recommendRow('window', profile(genre), generation, PLATES, own[kind]);
        for (const kind of Object.keys(own)) {
          const row = deal(kind);
          const name = `${genre} #${generation} ${kind}`;
          assert.equal(row.length, 4, name);
          assert.ok(row.every(slot => slot.plateId === undefined && slot.effectId === undefined && slot.bankId === undefined), `${name}: the person's picture replaces ours`);
          assert.equal(new Set(row.map(slot => slot.font)).size, 4, `${name} repeats a face`);
          assert.equal(new Set(row.map(slot => slot.windowPalette)).size, 4, `${name} repeats a screen`);
          for (const slot of row) assert.ok((slot.windowMode === 'person' ? person : plain).includes(slot.windowPalette) && slot.windowAllowed.every(id => (slot.windowMode === 'person' ? person : plain).includes(id)), `${name}: a screen that does not read`);
          if (kind === 'photo') {
            const modes = row.map(slot => slot.windowMode);
            assert.ok(modes[0] !== modes[1] && modes[0] === modes[2] && modes[1] === modes[3] && modes.every(mode => ['person', 'plain'].includes(mode)), `${name}: ${modes}`);
          } else assert.ok(row.every(slot => slot.windowMode === 'plain'), `${name}: no person in front`);
          if (kind === 'clip') assert.equal(new Set(row.map(slot => slot.cutSeed)).size, 4, `${name}: the same cut on two cards`);
          else assert.ok(row.every(slot => slot.cutSeed === undefined), name);
        }
        assert.deepEqual(deal('photo'), deal('photo'), 'pure');
      }
    }
    const firsts = new Set(Array.from({ length: 12 }, (_, generation) => pack.recommendRow('window', profile('Pop'), generation, PLATES, own.photo)[0].windowMode));
    assert.equal(firsts.size, 2, 'refreshing sometimes opens on her in front, sometimes plain');
  } finally { await server.close(); }
});

test('the cloud worker knows exactly the kinds of creative, ink sets, walls and Window screens the page deals', async () => {
  const { server } = await load();
  try {
    const { AD_PUNCH_STYLES } = await server.ssrLoadModule('/src/ad-punch.ts');
    const { RISO_INK_SETS } = await server.ssrLoadModule('/src/riso-look.ts');
    const { SPRAY_PALETTES } = await server.ssrLoadModule('/src/spray-look.ts');
    const { WINDOW_PALETTE_IDS, WINDOW_FACES } = await server.ssrLoadModule('/src/window-look.ts');
    assert.deepEqual(workerSet('STYLES').sort(), [...AD_PUNCH_STYLES].sort());
    assert.deepEqual(workerSet('WINDOW_PALETTES').sort(), [...WINDOW_PALETTE_IDS].sort());
    assert.deepEqual(workerSet('WINDOW_FACES').sort(), [...WINDOW_FACES].sort());
    assert.deepEqual(workerSet('WINDOW_MODES').sort(), ['bank', 'effect', 'person', 'plain']);
    assert.deepEqual(workerSet('RISO_INK_SETS').sort(), RISO_INK_SETS.map(set => set.id).sort());
    assert.deepEqual(workerSet('SPRAY_PALETTES').sort(), SPRAY_PALETTES.map(palette => palette.id).sort());
  } finally { await server.close(); }
});
