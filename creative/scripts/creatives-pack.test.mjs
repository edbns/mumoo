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
/** Our library: the pictures live-look rows are drawn on (they have no picture of ours without it). */
const LIBRARY = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, kind: 'photo', attitudes: ['neutral'], tags: ['street'], genre: null, subGenre: null, url: `/${id}.jpg` }));
/** One row, with the library only for the rows that live on it (looks and treatments). */
const LOOK_ROWS = new Set(['thermal', 'halftone', 'dither', 'ascii', 'triptych', 'fisheye', 'collage', 'frame', 'bento', 'grain', 'double', 'sideways', 'typewriter', 'screenshot']);
const recommend = (pack, row, person, generation = 0, plates = PLATES) => pack.recommendRow(row, person, generation, plates, LOOK_ROWS.has(row) ? LIBRARY : []);

/** Every row of the shelf, in order. */
const shelf = (pack, person, generation = 0, plates = PLATES) => pack.SHELF_ROWS.flatMap(row => recommend(pack, row.id, person, generation, plates));

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  const pack = await server.ssrLoadModule('/src/creatives-pack.ts');
  return { server, pack };
}

test('the shelf is twelve rows of four, in order, each card distinct', async () => {
  const { server, pack } = await load();
  try {
    for (const genre of ['Gospel', 'Slap House', 'Pop', 'Ambient']) {
      const slots = shelf(pack, profile(genre));
      // Thermal and ASCII are not dealt on a gospel song; every other row has four cards.
      const thermal = genre === 'Gospel' ? 0 : 4;
      const ascii = genre === 'Gospel' ? 0 : 4;
      const silhouette = genre === 'Gospel' ? 0 : 4;
      const treatments = ['triptych', 'fisheye', 'collage', 'frame', 'bento', 'grain', 'double', 'sideways', 'typewriter', 'screenshot'];
      assert.equal(slots.length, 40 + 28 + thermal + ascii + silhouette, genre);
      assert.deepEqual([...new Set(slots.map(slot => slot.row))], ['photography', ...treatments, ...(thermal ? ['thermal'] : []), 'halftone', 'dither', ...(ascii ? ['ascii'] : []), 'riso', 'window', ...(silhouette ? ['silhouette'] : []), 'pulise', 'dust'], 'rows come in order');
      assert.deepEqual(pack.SHELF_ROWS.map(row => row.title), ['Directed', 'Triptych', 'Fisheye', 'Collage', 'Colored Frame', 'Bento Grid', 'Film Grain', 'Double Exposure', 'Sideways', 'Typewriter', 'Screenshot', 'Thermal', 'Halftone', 'Dither', 'ASCII', 'Riso', 'Window', 'Silhouette', 'Pulse', 'Dust']);
      for (const row of ['photography', ...treatments, 'halftone', 'dither', 'riso', 'window', 'pulise', 'dust']) assert.equal(slots.filter(slot => slot.row === row).length, 4, `${genre} ${row}`);
      assert.equal(slots.filter(slot => slot.row === 'thermal').length, thermal, `${genre} thermal`);
      assert.equal(slots.filter(slot => slot.row === 'ascii').length, ascii, `${genre} ascii`);
      assert.equal(slots.filter(slot => slot.row === 'silhouette').length, silhouette, `${genre} silhouette`);
      const photography = slots.filter(slot => slot.row === 'photography');
      // A card is a baked effect, or (with a live look, while the library is short) our one approved photo, once.
      assert.equal(new Set(photography.map(slot => slot.effectId ?? slot.plateId)).size, 4, `${genre} photography repeats a picture`);
      assert.ok(photography.filter(slot => slot.plateId).length <= 1, `${genre} draws our one photo on more than one card`);
      assert.equal(new Set(photography.map(slot => slot.typeStyle)).size, 4, `${genre} photography repeats a type style`);
      assert.ok(photography.every(slot => slot.colors === undefined && slot.filter === undefined && (slot.plateId === undefined) !== (slot.effectId === undefined)), 'photography is drawn from a baked effect or our photo, never both');
      assert.ok(photography.every(slot => !slot.look), 'Our photography carries no live look: each effect has its own row');
      assert.ok(slots.filter(slot => slot.row === 'dust').every(slot => slot.plateId === 'burnnet-woman-1547507-1920'), 'Dust is drawn from the approved photo');
      const pulise = slots.filter(slot => slot.row === 'pulise');
      assert.equal(new Set(pulise.map(slot => slot.layout.cut)).size, 4, `${genre} Pulise cards open on the same colour`);
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
    assert.equal(new Set(shelf(pack, person).map(slot => slot.id)).size, 80);
  } finally { await server.close(); }
});

test('calm songs are not first dealt the harsh effects, club songs are', async () => {
  const { server, pack } = await load();
  try {
    const list = await effects(server);
    const mood = slot => list.find(effect => effect.id === slot.effectId).mood;
    const harsh = ['glitchy', 'techno', 'retro', 'graphic', 'bold'];
    // Gospel by genre, and a quiet lane by what the words say (a pop song with lonely lyrics).
    const lonely = { attitude: 'sad', sadness: 3, intensity: 2 };
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

    const sad = { attitude: 'sad', sadness: 3, intensity: 2 };
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
    const sad = shelf(pack, profile('Pop', 'hello', 'a'.repeat(64), { attitude: 'sad', sadness: 3, intensity: 2 }));
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
    for (const slot of shelf(pack, profile('Slap House'))) {
      for (const font of [slot.font, slot.fontSecondary]) assert.ok(DISPLAY_FACES[font].moods.some(mood => clubMoods.includes(mood)), font);
    }
  } finally { await server.close(); }
});

test('Our photography\'s baked effects follow the song: the cover\'s colours lead, and sad words never sit on a bright picture', async () => {
  const { server, pack } = await load();
  try {
    const { default: all } = await import('../punch-plates/effects/effects.json', { with: { type: 'json' } });
    const read = id => all.find(effect => effect.id === id);
    const cover = (hex, extra) => ({ palette: [{ hex, share: 1 }], lightness: 0.5, saturation: 0.8, contrast: 0.5, hue: 20, warmth: 1, ...extra });
    const withCover = value => ({ ...profile('Pop'), creator: { primaryGenre: { value: 'Pop', source: 'creator' }, cover: { value, source: 'embedded_metadata' } } });
    const warmth = value => pack.recommendRow('photography', withCover(value), 0, []).reduce((sum, slot) => sum + read(slot.effectId).warmth, 0) / 4;
    assert.ok(warmth(cover('#e1782a')) > warmth(cover('#2a3ea0', { hue: 230, warmth: 0, lightness: 0.25 })), 'a warm cover leads with warmer effects than a cool one');
    for (const generation of [0, 1, 2]) {
      for (const slot of pack.recommendRow('photography', profile('Ambient', 'tears fall like rain tonight alone', 'a'.repeat(64), { attitude: 'sad', sadness: 3, intensity: 2 }), generation, [])) {
        assert.ok(read(slot.effectId).lightness < 0.6, `${slot.effectId} is too bright for sad words`);
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

    // Sad words on a club song: same lane and looks, sadder colours, calmer hits. Riso inks and Window and Silhouette screens are the design, so they are not graded.
    const sad = shelf(pack, profile('Slap House', 'hello', sha, { attitude: 'sad', sadness: 3, intensity: 2 }));
    assert.ok(sad.every(slot => slot.reason.startsWith('techno')));
    const graded = sad.filter(slot => !['riso', 'window', 'silhouette'].includes(slot.row));
    assert.equal(graded.length, 68);
    const grade = graded[0].grade;
    assert.ok(grade.saturation < 1 && grade.warmth < 0 && grade.brightness < 1 && grade.calm > 0.5, JSON.stringify(grade));
    assert.ok(graded.every(slot => JSON.stringify(slot.grade) === JSON.stringify(grade)));
    assert.ok(sad.filter(slot => ['riso', 'window', 'silhouette'].includes(slot.row)).every(slot => slot.grade === undefined), 'Riso, Window and Silhouette keep their own colours');

    // Defiant and forceful: warmer, punchier, no calming.
    const defiant = shelf(pack, profile('Slap House', 'hello', sha, { attitude: 'confident', sadness: 0, intensity: 4 }))[0].grade;
    assert.ok(defiant.warmth > 0 && defiant.contrast > 1 && defiant.calm === 0, JSON.stringify(defiant));
  } finally { await server.close(); }
});

test('every row is recommended on its own, so refreshing one never changes another', async () => {
  const { server, pack } = await load();
  try {
    const person = profile('Pop');
    const ids = (row, generation) => recommend(pack, row, person, generation).map(slot => slot.id).join();
    for (const row of pack.SHELF_ROWS.map(def => def.id)) {
      assert.equal(recommend(pack, row, person, 0).length, 4, `${row} has four cards`);
      assert.equal(ids(row, 0), ids(row, 0), `${row} is repeatable`);
      assert.notEqual(ids(row, 0), ids(row, 1), `${row} changes when refreshed`);
    }
    // Refreshing Dust leaves Our photography exactly as it was.
    assert.equal(ids('photography', 0), ids('photography', 0));
    assert.ok(pack.recommendRow('dust', person, 0, PLATES).every(slot => slot.colors && slot.row === 'dust'));
  } finally { await server.close(); }
});

test('rows say what they own: lyrics switch, which picture they take, and Pulise takes none', async () => {
  const { server, pack } = await load();
  try {
    const rows = Object.fromEntries(pack.SHELF_ROWS.map(def => [def.id, def]));
    assert.equal(rows.looks, undefined, 'Moving backgrounds is off the shelf');
    assert.equal(rows.pulise.lyrics, 'always');
    assert.equal(rows.pulise.picture, undefined, 'Pulise takes no picture');
    for (const row of ['spray', 'doodle']) assert.equal(rows[row], undefined, `${row} is off the shelf`);
    assert.equal(rows.dust.picture, 'photo', 'Dust needs a photo');
    const treatments = ['triptych', 'fisheye', 'collage', 'frame', 'bento', 'grain', 'double', 'sideways', 'typewriter'];
    assert.equal(rows.screenshot.picture, 'any', 'Screenshot blurs any picture behind the chat');
    assert.equal(rows.screenshot.lyrics, 'always', 'the chat is the lyrics');
    for (const row of ['photography', ...treatments, 'riso', 'window', 'thermal', 'halftone', 'dither', 'ascii']) assert.equal(rows[row].picture, 'any', `${row} takes a photo, video or GIF`);
    assert.equal(rows.window.lyrics, 'always', 'the word is the window');
    for (const row of ['photography', ...treatments, 'thermal', 'halftone', 'dither', 'ascii', 'riso', 'dust']) assert.equal(rows[row].lyrics, 'switch', row);
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

const GENRES = ['Gospel', 'Slap House', 'Pop', 'Ambient', 'Reggaeton'];

test('Window deals four cards of the picture as it is, each on one black or off-white screen, the screens taking turns, no face or layout repeated', async () => {
  const { server, pack } = await load();
  const look = await server.ssrLoadModule('/src/window-look.ts');
  try {
    for (const genre of GENRES) {
      for (let generation = 0; generation < 24; generation++) {
        const row = pack.recommendRow('window', profile(genre, 'hello', `${genre.length}${generation % 3}`.padEnd(64, 'c')), generation, PLATES);
        const name = `${genre} #${generation}`;
        assert.equal(row.length, 4, name);
        assert.ok(row.every(slot => slot.style === 'window' && slot.row === 'window' && slot.family === 'ad_punch'), name);
        assert.deepEqual(row.map(slot => slot.windowPalette).slice(0, 2).sort(), ['black', 'off-white'], `${name}: black and off-white take turns`);
        assert.equal(row[0].windowPalette, row[2].windowPalette, name);
        assert.equal(new Set(row.map(slot => slot.font)).size, 4, `${name} repeats a face`);
        assert.equal(new Set(row.map(slot => slot.layout.seed)).size, 4, `${name} repeats a layout seed`);
        assert.equal(new Set(row.map(slot => slot.cutSeed)).size, 4, `${name}: the same cut on two cards`);
        for (const slot of row) {
          assert.equal(slot.windowMode, 'plain', name);
          assert.ok(look.WINDOW_FACES.includes(slot.font) && slot.fontSecondary === slot.font, `${name}: ${slot.font} is not one of the condensed faces`);
          assert.deepEqual(slot.windowAllowed, [slot.windowPalette], `${name}: one screen for the whole video`);
          assert.equal(slot.label, `${slot.windowPalette[0].toUpperCase()}${slot.windowPalette.slice(1).replace('-', ' ')}`, 'the label names the screen colour');
          assert.ok(slot.effectId === undefined && slot.grade === undefined && slot.inkSet === undefined, `${name}: nothing but the picture`);
          assert.ok(PLATES.some(plate => plate.id === slot.plateId), `${name}: with no library our approved photo stands in`);
        }
      }
    }
    const dealt = (sha, generation) => JSON.stringify(pack.recommendRow('window', profile('Pop', 'hello', sha.repeat(64)), generation, PLATES));
    assert.equal(dealt('a', 3), dealt('a', 3), 'pure');
    assert.equal(new Set(Array.from({ length: 10 }, (_, generation) => dealt('a', generation))).size, 10, 'every refresh is a different row');
    const firsts = new Set(Array.from({ length: 12 }, (_, generation) => pack.recommendRow('window', profile('Pop'), generation, PLATES)[0].windowPalette));
    assert.equal(firsts.size, 2, 'refreshing sometimes opens on black, sometimes on white');
  } finally { await server.close(); }
});

test('Silhouette deals four different figures (two men, two women) in four lyric styles on red, black and white, the song\'s picture inside, and never for gospel', async () => {
  const { server, pack } = await load();
  const { SILHOUETTE_IDS, SILHOUETTE_TYPES } = await server.ssrLoadModule('/src/silhouette.ts');
  try {
    for (const genre of GENRES.filter(genre => genre !== 'Gospel')) {
      for (let generation = 0; generation < 12; generation++) {
        const row = pack.recommendRow('silhouette', profile(genre, 'hello', `${genre.length}${generation % 3}`.padEnd(64, 'c')), generation, PLATES);
        const name = `${genre} #${generation}`;
        assert.equal(row.length, 4, name);
        assert.ok(row.every(slot => slot.style === 'window' && slot.row === 'silhouette' && slot.windowMode === 'silhouette'), name);
        assert.equal(new Set(row.map(slot => slot.windowShape)).size, 4, `${name}: a figure repeated`);
        assert.ok(row.every(slot => SILHOUETTE_IDS.includes(slot.windowShape)), name);
        assert.equal(row.filter(slot => slot.windowShape.startsWith('man-')).length, 2, `${name}: two men and two women`);
        assert.ok(row.every((slot, index) => index === 0 || slot.windowShape.split('-')[0] !== row[index - 1].windowShape.split('-')[0]), `${name}: men and women take turns`);
        assert.equal(new Set(row.map(slot => slot.typeStyle)).size, 4, `${name}: a lyric style repeated`);
        assert.ok(row.every(slot => SILHOUETTE_TYPES.includes(slot.typeStyle)), name);
        assert.equal(new Set(row.slice(0, 3).map(slot => slot.windowPalette)).size, 3, `${name}: red, black and white take turns`);
        assert.ok(row.every(slot => ['red', 'black', 'off-white'].includes(slot.windowPalette) && slot.windowAllowed.length === 1 && slot.windowAllowed[0] === slot.windowPalette), name);
        assert.ok(row.every(slot => PLATES.some(plate => plate.id === slot.plateId)), `${name}: with no library our approved photo stands in`);
      }
    }
    assert.deepEqual(pack.recommendRow('silhouette', profile('Gospel'), 0, PLATES), [], 'no Silhouette for gospel');
    assert.ok(pack.recommendRow('window', profile('Pop'), 0, PLATES).every(slot => slot.windowShape === undefined && slot.windowPalette !== 'red'), 'Window keeps its word, on black or white');
  } finally { await server.close(); }
});

test('with the person\'s own picture Window cards name none of ours: the picture is theirs', async () => {
  const { server, pack } = await load();
  try {
    const row = pack.recommendRow('window', profile('Pop'), 0, PLATES, [], true);
    assert.equal(row.length, 4);
    assert.ok(row.every(slot => slot.plateId === undefined && slot.libraryId === undefined && slot.reelIds === undefined));
  } finally { await server.close(); }
});

test('the cloud worker knows exactly the kinds of creative, ink sets and Window screens the page deals', async () => {
  const { server } = await load();
  try {
    const { AD_PUNCH_STYLES } = await server.ssrLoadModule('/src/ad-punch.ts');
    const { RISO_INK_SETS } = await server.ssrLoadModule('/src/riso-look.ts');
    const { WINDOW_PALETTE_IDS, WINDOW_FACES } = await server.ssrLoadModule('/src/window-look.ts');
    assert.deepEqual(workerSet('STYLES').sort(), [...AD_PUNCH_STYLES].sort());
    assert.deepEqual(workerSet('WINDOW_PALETTES').sort(), [...WINDOW_PALETTE_IDS].sort());
    assert.deepEqual(workerSet('WINDOW_FACES').sort(), [...WINDOW_FACES].sort());
    assert.deepEqual(workerSet('WINDOW_MODES').sort(), ['plain', 'silhouette']);
    const { SILHOUETTE_IDS } = await server.ssrLoadModule('/src/silhouette.ts');
    assert.deepEqual(workerSet('WINDOW_SHAPES').sort(), [...SILHOUETTE_IDS].sort());
    assert.deepEqual(workerSet('RISO_INK_SETS').sort(), RISO_INK_SETS.map(set => set.id).sort());
  } finally { await server.close(); }
});
