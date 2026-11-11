import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const deal = await server.ssrLoadModule('/src/live-look-deal.ts');
const ramp = await server.ssrLoadModule('/src/live-look-ramp.ts');
const pack = await server.ssrLoadModule('/src/creatives-pack.ts');
await server.close();

const workerPath = fileURLToPath(new URL('../../audio-intelligence/modal_creatives_encode_staging.py', import.meta.url));
const WORKER = readFileSync(workerPath, 'utf8');
const LANES = ['party', 'quiet', 'gospel', 'techno', 'dark', 'general'];

const FAMILIES = ['thermal', 'halftone', 'dither', 'glow', 'streaks', 'ascii', 'depth'];
const familyOf = id => deal.LIVE_LOOKS.find(entry => entry.id === id).family;

test('every card of a row carries a look of its effect that the lane welcomes, never the same on neighbours', () => {
  for (const family of FAMILIES) {
    for (const lane of ['quiet', 'dark', 'techno', 'party', 'general']) {
      for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
        const looks = deal.dealLooks(lane, seed, 4, family);
        assert.equal(looks.length, 4);
        assert.ok(looks.every(look => look && familyOf(look) === family && deal.LIVE_LOOKS.find(entry => entry.id === look).lanes.includes(lane)), `${family}/${lane}/${seed}: ${looks}`);
        assert.ok(looks.every((look, index) => index === 0 || look !== looks[index - 1]), 'never the same look side by side');
        assert.ok(new Set(looks).size >= 2, 'never one look four times');
        if (family === 'streaks') {
          assert.equal(new Set(looks.map(look => ramp.streaksGeometry(look))).size, 4, `streaks/${lane}/${seed} deals four geometries: ${looks}`);
        }
      }
    }
    assert.ok(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(seed => deal.dealLooks('dark', seed, 4, family).join())).size >= 4, `${family}: a new seed (Refresh) deals different looks on different cards`);
    assert.deepEqual(deal.dealLooks('dark', 's', 4, family), deal.dealLooks('dark', 's', 4, family), 'the same song always gets the same deal');
  }
});

test('every effect has many colourings in every lane, so Refresh keeps showing new ones', () => {
  for (const family of FAMILIES) {
    for (const lane of ['quiet', 'dark', 'techno', 'party', 'general']) {
      // Thermal deals only what reads as a heat camera (iron, rainbow) or a hot one (lava): three, not a rack of colours.
      const many = family === 'thermal' ? 3 : 6;
      assert.ok(deal.LIVE_LOOKS.filter(look => look.family === family && look.lanes.includes(lane) && (family !== 'thermal' || ['thermal', 'rainbow', 'lava'].includes(look.id))).length >= many, `${family} welcomes at least ${many} colourings in ${lane}`);
      const seen = new Set();
      for (let refresh = 0; refresh < 6; refresh++) deal.dealLooks(lane, `song:${refresh}`, 4, family).forEach(look => seen.add(look));
      assert.ok(seen.size >= many, `${family}/${lane}: six refreshes showed ${seen.size} different looks`);
    }
  }
});

test('Thermal, Streaks, ASCII and Depth are not dealt on a gospel song; Halftone, Dither and Glow are', () => {
  assert.deepEqual(deal.dealLooks('gospel', 'seed', 4, 'thermal'), [null, null, null, null]);
  assert.deepEqual(deal.dealLooks('gospel', 'seed', 4, 'streaks'), [null, null, null, null]);
  assert.deepEqual(deal.dealLooks('gospel', 'seed', 4, 'ascii'), [null, null, null, null]);
  assert.deepEqual(deal.dealLooks('gospel', 'seed', 4, 'depth'), [null, null, null, null]);
  assert.ok(deal.dealLooks('gospel', 'seed', 4, 'halftone').every(look => look && familyOf(look) === 'halftone'));
  assert.ok(deal.dealLooks('gospel', 'seed', 4, 'dither').every(look => look && familyOf(look) === 'dither'));
  assert.ok(deal.dealLooks('gospel', 'seed', 4, 'glow').every(look => look && familyOf(look) === 'glow'));
});

test('every look has a title and welcomes only real lanes', () => {
  assert.ok(deal.LIVE_LOOKS.length >= 1);
  for (const look of deal.LIVE_LOOKS) {
    assert.ok(look.title && look.lanes.length, look.id);
    assert.ok(look.lanes.every(lane => LANES.includes(lane)), look.id);
    assert.equal(deal.liveLookTitle(look.id), look.title);
  }
  assert.equal(new Set(deal.LIVE_LOOK_IDS).size, deal.LIVE_LOOK_IDS.length);
});

test('thermal reads cold shade as cold and warm skin as hot, over the picture\'s own range', () => {
  const dark = ramp.lookPixel('thermal', 10, 10, 40, [0.25, 0.8]);
  const light = ramp.lookPixel('thermal', 250, 220, 200, [0.25, 0.8]);
  assert.ok(dark[2] > dark[0] && dark[0] < 60, `cold is blue-ish: ${dark}`);
  assert.ok(light[0] > 240 && light[1] > 240, `hot is yellow-white: ${light}`);
  // A pale picture still shows the whole ramp: its own darkest part is as cold as a dark picture's.
  const palest = ramp.lookPixel('thermal', 200, 200, 200, [0.78, 0.98]);
  assert.ok(ramp.heatSource(240, 190, 160) > ramp.heatSource(240, 240, 240), 'skin reads hotter than a white wall');
  assert.ok(ramp.heatSource(40, 60, 120) < ramp.heatSource(120, 120, 120), 'blue shade reads colder than grey');
  assert.ok(palest[0] < 80, `the darkest part of a pale picture is cold: ${palest}`);
  // A flat picture is not blown up into noise.
  const a = ramp.lookPixel('thermal', 120, 120, 120, [0.47, 0.47]);
  const b = ramp.lookPixel('thermal', 125, 125, 125, [0.47, 0.47]);
  assert.ok(Math.abs(a[0] - b[0]) < 25, 'a small step in a flat picture is a small step in colour');
  for (const value of [...dark, ...light, ...palest]) assert.ok(value >= 0 && value <= 255);
});

test('halftone prints dark as mostly ink and light as mostly paper, in the picture\'s own colour', () => {
  const dark = ramp.lookPixel('halftone', 20, 20, 25, [0, 1]);
  const light = ramp.lookPixel('halftone', 240, 240, 235, [0, 1]);
  assert.ok(dark[0] < 60 && dark[1] < 60, `dark is ink: ${dark}`);
  assert.ok(light[0] > 215 && light[1] > 200 && light[2] > 180, `light is cream paper: ${light}`);
  const red = ramp.lookPixel('halftone', 200, 40, 40, [0, 1]);
  assert.ok(red[0] > red[1] * 1.5 && red[0] > red[2] * 1.5, `a red picture prints red ink: ${red}`);
  assert.ok(ramp.halftoneCover('halftone', 0, 0, 0) === 1 && ramp.halftoneCover('halftone', 255, 255, 255) === 0);
  for (const value of [...dark, ...light, ...red]) assert.ok(value >= 0 && value <= 255);
});

test('every halftone is its own ink and paper: flat inks stay one colour, a dark paper reverses light and dark', () => {
  const halftones = deal.LIVE_LOOKS.filter(look => look.family === 'halftone').map(look => look.id);
  assert.ok(halftones.length >= 30, 'many inks and papers');
  assert.deepEqual([...halftones].sort(), Object.keys(ramp.HALFTONE_STYLES).sort(), 'every halftone has a style, and every style a place in the list');
  // Black and white: black on white, nothing else.
  const bwDark = ramp.lookPixel('halftonebw', 10, 10, 10, [0, 1]);
  const bwLight = ramp.lookPixel('halftonebw', 250, 250, 250, [0, 1]);
  assert.ok(bwDark[0] < 40 && bwLight[0] > 230, `black ink on white paper: ${bwDark} ${bwLight}`);
  // A red ink prints red whatever the picture's colour is.
  const redInk = ramp.lookPixel('halftonered', 20, 120, 220, [0, 1]);
  assert.ok(redInk[0] > redInk[2] * 1.3, `a flat red ink does not take the picture's blue: ${redInk}`);
  // On a dark paper a light part of the picture is the ink, and a dark part is the paper.
  const invertLight = ramp.lookPixel('halftoneinvert', 250, 250, 250, [0, 1]);
  const invertDark = ramp.lookPixel('halftoneinvert', 5, 5, 5, [0, 1]);
  assert.ok(invertLight[0] > 200 && invertDark[0] < 40, `white on black: ${invertLight} ${invertDark}`);
  assert.ok(ramp.halftoneCover('halftoneinvert', 255, 255, 255) === 1 && ramp.halftoneCover('halftoneinvert', 0, 0, 0) === 0);
  for (const id of halftones) {
    for (const colour of [[0, 0, 0], [255, 255, 255], [200, 40, 40], [30, 90, 200]]) {
      for (const value of ramp.lookPixel(id, ...colour, [0, 1])) assert.ok(value >= 0 && value <= 255, `${id} ${colour}`);
    }
  }
});

test('halftone prints that use several inks lay them over each other like a press, and other marks than dots exist', () => {
  const style = id => ramp.HALFTONE_STYLES[id];
  // A white picture is blank paper in every print that prints on paper, and a black one is all ink.
  for (const id of ['halftonecmyk', 'halftoneriso', 'halftonesubway', 'halftonesunset', 'halftonecandy']) {
    const white = ramp.lookPixel(id, 255, 255, 255, [0, 1]);
    const paper = style(id).paper.map(value => value * 255);
    assert.ok(white.every((value, i) => Math.abs(value - paper[i]) < 6), `${id}: a white picture shows the paper: ${white}`);
  }
  const black = ramp.lookPixel('halftonecmyk', 0, 0, 0, [0, 1]);
  assert.ok(black.every(value => value < 70), `CMYK: black is dark ink: ${black}`);
  // The four process inks each answer to their own colour: a cyan picture has cyan ink and no magenta or yellow.
  const cyanPicture = ramp.lookPixel('halftonecmyk', 0, 200, 255, [0, 1]);
  assert.ok(cyanPicture[2] > cyanPicture[0] && cyanPicture[2] > 150, `a cyan picture prints blue-green: ${cyanPicture}`);
  // Where two inks meet they make a third: Riso's pink over blue is darker than either alone.
  const rich = ramp.lookPixel('halftoneriso', 60, 60, 60, [0, 1]);
  assert.ok(rich[0] < 235 && rich[2] < 235, `overlapping inks darken: ${rich}`);
  // Glowing inks brighten where they meet on a dark card.
  const glow = ramp.lookPixel('halftoneuv', 255, 255, 255, [0, 1]);
  assert.ok(glow[2] > 150 && glow[0] < 255, `UV inks glow on indigo: ${glow}`);
  // Marks other than round dots, and a print whose dots are all one size.
  const shapes = new Set(Object.values(ramp.HALFTONE_STYLES).flatMap(entry => entry.screens.map(screen => screen.shape ?? 'round')));
  for (const shape of ['round', 'square', 'line', 'wave']) assert.ok(shapes.has(shape), `a print uses ${shape} marks`);
  const hatch = style('halftonehatch').screens;
  assert.equal(new Set(hatch.map(screen => screen.angle)).size, 3, 'crosshatch lays three directions');
  assert.ok(hatch.every((screen, i) => i === 0 || screen.from > hatch[i - 1].from), 'each hatch only joins in darker parts');
  const benday = ramp.HALFTONE_STYLES.halftonebenday.screens[0];
  assert.ok(benday.fixed > 0 && benday.ink === 'poster', 'Ben-Day dots are one size and change colour');
  assert.deepEqual(ramp.lookPixel('halftonebenday', 250, 250, 250, [0, 1]).map(Math.round), ramp.lookPixel('halftonebenday', 255, 255, 255, [0, 1]).map(Math.round), 'light parts of Ben-Day are the same');
  // Every print is a real design: paper, at least one screen, angles in turns, fractions in range.
  for (const [id, entry] of Object.entries(ramp.HALFTONE_STYLES)) {
    assert.ok(entry.screens.length >= 1 && entry.screens.length <= 4, id);
    assert.ok(entry.paper.every(value => value >= 0 && value <= 1), id);
    for (const screen of entry.screens) assert.ok((screen.from ?? 0) >= 0 && (screen.from ?? 0) < 1 && (screen.fixed ?? 0.5) > 0 && (screen.fixed ?? 0.5) < 0.8, id);
  }
});

test('every look the page can deal is one the shader and the palette reader know', () => {
  const shader = readFileSync('src/live-look.ts', 'utf8');
  for (const id of deal.LIVE_LOOK_IDS) {
    assert.match(shader, new RegExp(`\\b${id}:\\s*\\(\\)\\s*=>`), `${id} has a builder`);
    assert.equal(ramp.lookPixel(id, 1, 2, 3, [0, 1]).length, 3, `${id} has a colour function`);
  }
});

test('the worker knows the same looks as the page', () => {
  const body = WORKER.match(/^LIVE_LOOKS = \{([^\n]*)\}/m);
  assert.ok(body, 'LIVE_LOOKS is missing from the worker');
  assert.deepEqual([...body[1].matchAll(/"([^"]+)"/g)].map(match => match[1]).sort(), [...deal.LIVE_LOOK_IDS].sort());
});

function profile(genre, sadness = 1, attitude = 'defiant') {
  const sha = 'c'.repeat(64);
  const frames = Array.from({ length: 20 }, (_, i) => ({ timeMs: i * 100, rms: 0.2, onsetStrength: 1, centroidHz: 2200, bandwidthHz: 1600, rolloffHz: 3000 }));
  return {
    version: 1,
    clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
    creator: { primaryGenre: { value: genre, source: 'creator' } },
    musicAnalysis: {
      status: 'ready',
      clip: { sourceSha256: sha, offsetMs: 0, durationMs: 15000 },
      result: { rhythm: { tempo: { status: 'estimated', bpm: 125, gridBpm: 125, alternativesBpm: [] }, beatsMs: [1000, 2000] }, features: { transientsMs: [500, 1500], frames } },
    },
    approvedLyrics: { cues: [{ text: 'hello', startMs: 0, endMs: 380 }], source: 'creator_reviewed' },
    lyricMeaning: { status: 'ready', meaning: { attitude, sadness, intensity: 3 } },
  };
}

const picture = (id, attitude = 'defiant') => ({ id, kind: 'video', attitudes: [attitude], tags: ['street'], genre: null, subGenre: null, url: `/${id}.jpg`, motionUrl: `/${id}.mp4`, shots: [[0, 1000]] });
const cutoutPicture = (id, attitude = 'defiant') => ({ id, kind: 'photo', attitudes: [attitude], tags: ['street'], genre: null, subGenre: null, url: `/${id}.jpg`, cutoutUrl: `/${id}.cut.png` });

test('dither maps dark to the dark end of its palette and light to the bright end, and own colours stay near the picture', () => {
  const dithers = deal.LIVE_LOOKS.filter(look => look.family === 'dither').map(look => look.id);
  assert.ok(dithers.length >= 12, 'many palettes');
  assert.deepEqual([...dithers].sort(), Object.keys(ramp.DITHER_STYLES).sort(), 'every dither has a style, and every style a place in the list');
  const macDark = ramp.lookPixel('dithermac', 10, 10, 10, [0, 1]);
  const macLight = ramp.lookPixel('dithermac', 250, 250, 250, [0, 1]);
  assert.ok(macDark.every(value => value < 20), `Mac dark is black: ${macDark}`);
  assert.ok(macLight.every(value => value > 240), `Mac light is white: ${macLight}`);
  const gb = ramp.lookPixel('dithergameboy', 250, 250, 250, [0, 1]);
  assert.ok(gb[1] > gb[0] && gb[1] > 100, `Game Boy light is green: ${gb}`);
  const own = ramp.lookPixel('ditherown', 200, 40, 40, [0, 1]);
  assert.ok(own[0] > own[1] * 1.5 && own[0] > own[2] * 1.5, `own colours keep a red picture red: ${own}`);
  for (const id of dithers) {
    for (const colour of [[0, 0, 0], [255, 255, 255], [200, 40, 40], [30, 90, 200]]) {
      for (const value of ramp.lookPixel(id, ...colour, [0, 1])) assert.ok(value >= 0 && value <= 255, `${id} ${colour}`);
    }
  }
});

test('glow grades dark and lifts bright with its tint, without blowing past 255', () => {
  const glows = deal.LIVE_LOOKS.filter(look => look.family === 'glow').map(look => look.id);
  assert.ok(glows.length >= 12, 'many glows');
  assert.deepEqual([...glows].sort(), Object.keys(ramp.GLOW_STYLES).sort(), 'every glow has a style, and every style a place in the list');
  const noirDark = ramp.lookPixel('glownoir', 10, 10, 10, [0, 1]);
  const noirLight = ramp.lookPixel('glownoir', 250, 250, 250, [0, 1]);
  assert.ok(noirDark.every(value => value < 40), `noir dark stays dark: ${noirDark}`);
  assert.ok(noirLight.every(value => value > 180), `noir light blooms: ${noirLight}`);
  const pink = ramp.lookPixel('glowpink', 180, 180, 180, [0, 1]);
  const cyan = ramp.lookPixel('glowcyan', 180, 180, 180, [0, 1]);
  assert.ok(pink[0] > cyan[0] && cyan[1] > pink[1], `pink and cyan neon pull opposite ways: ${pink} vs ${cyan}`);
  const bloom = ramp.lookPixel('glowbloom', 220, 220, 220, [0, 1]);
  assert.ok(bloom.every(value => value > 150 && value <= 255), `soft bloom stays readable: ${bloom}`);
  for (const id of glows) {
    for (const colour of [[0, 0, 0], [255, 255, 255], [200, 40, 40], [30, 90, 200]]) {
      for (const value of ramp.lookPixel(id, ...colour, [0, 1])) assert.ok(value >= 0 && value <= 255, `${id} ${colour}`);
    }
  }
});


test('depth grades far and lifts toward near, without blowing past 255', () => {
  const depths = deal.LIVE_LOOKS.filter(look => look.family === 'depth').map(look => look.id);
  assert.ok(depths.length >= 12, 'many depth colourings');
  assert.deepEqual([...depths].sort(), Object.keys(ramp.DEPTH_STYLES).sort(), 'every depth has a style, and every style a place in the list');
  const fog = ramp.lookPixel('depthfog', 80, 80, 80, [0, 1]);
  assert.ok(fog[2] >= fog[0], `fog pulls cool: ${fog}`);
  const noir = ramp.lookPixel('depthnoir', 200, 100, 50, [0, 1]);
  assert.ok(Math.abs(noir[0] - noir[1]) < 40, `noir far is greyish: ${noir}`);
  const dealt = pack.recommendRow('depth', profile('Techno'), 0, [{ id: 'plate', cutout: true }], null, []);
  assert.equal(dealt.length, 4, 'Depth deals from cut-out plates when the library has none');
  assert.ok(dealt.every(slot => slot.plateId && slot.look && familyOf(slot.look) === 'depth'));
  for (const id of depths) {
    for (const colour of [[0, 0, 0], [255, 255, 255], [200, 40, 40], [30, 90, 200]]) {
      for (const value of ramp.lookPixel(id, ...colour, [0, 1])) assert.ok(value >= 0 && value <= 255, `${id} ${colour}`);
    }
  }
});

test('ascii mixes paper toward ink by brightness, without blowing past 255', () => {
  const asciis = deal.LIVE_LOOKS.filter(look => look.family === 'ascii').map(look => look.id);
  assert.ok(asciis.length >= 12, 'many ascii colourings');
  assert.deepEqual([...asciis].sort(), Object.keys(ramp.ASCII_STYLES).sort(), 'every ascii has a style, and every style a place in the list');
  const dark = ramp.lookPixel('asciigreen', 10, 10, 10, [0, 1]);
  const light = ramp.lookPixel('asciigreen', 250, 250, 250, [0, 1]);
  assert.ok(dark.every(value => value < 40), `green paper stays dark: ${dark}`);
  assert.ok(light[1] > light[0] && light[1] > 120, `green ink lifts bright: ${light}`);
  const typeDark = ramp.lookPixel('asciitype', 20, 20, 20, [0, 1]);
  const typeLight = ramp.lookPixel('asciitype', 240, 240, 240, [0, 1]);
  assert.ok(typeDark[0] < typeLight[0], `typewriter puts more ink on dark: ${typeDark} vs ${typeLight}`);
  const colour = ramp.lookPixel('asciicolour', 220, 40, 40, [0, 1]);
  assert.ok(colour[0] > colour[1] && colour[0] > colour[2], `colour ASCII keeps the picture's hue: ${colour}`);
  const dealt = pack.recommendRow('ascii', profile('Techno'), 0, [], null, [picture('a'), picture('b'), picture('c'), picture('d')]);
  assert.equal(new Set(dealt.map(slot => slot.look)).size, 4, 'an ASCII row deals four different colourings');
  for (const id of asciis) {
    for (const colour of [[0, 0, 0], [255, 255, 255], [200, 40, 40], [30, 90, 200]]) {
      for (const value of ramp.lookPixel(id, ...colour, [0, 1])) assert.ok(value >= 0 && value <= 255, `${id} ${colour}`);
    }
  }
});

test('streaks grade dark and tint bright highlights, without blowing past 255', () => {
  const streaks = deal.LIVE_LOOKS.filter(look => look.family === 'streaks').map(look => look.id);
  assert.ok(streaks.length >= 12, 'many streaks');
  assert.deepEqual([...streaks].sort(), Object.keys(ramp.STREAKS_STYLES).sort(), 'every streak has a style, and every style a place in the list');
  const dark = ramp.lookPixel('streakblue', 10, 10, 10, [0, 1]);
  const light = ramp.lookPixel('streakblue', 250, 250, 250, [0, 1]);
  assert.ok(dark.every(value => value < 45), `streak dark stays dark: ${dark}`);
  assert.ok(light[2] > light[0] && light[2] > 150, `blue streak lifts bright: ${light}`);
  const red = ramp.lookPixel('streakred', 220, 220, 220, [0, 1]);
  const cyan = ramp.lookPixel('streakcyan', 220, 220, 220, [0, 1]);
  assert.ok(red[0] > cyan[0] && cyan[2] > red[2], `different colourings pull opposite ways: ${red} vs ${cyan}`);
  const burn = ramp.lookPixel('streakburn', 200, 200, 200, [0, 1]);
  assert.ok(burn[0] > burn[2], `film burn stays warm: ${burn}`);
  const dealt = pack.recommendRow('streaks', profile('Techno'), 0, [], null, [picture('a'), picture('b'), picture('c'), picture('d')]);
  assert.equal(new Set(dealt.map(slot => slot.look)).size, 4, 'a Streaks row deals four different colourings');
  const geometries = dealt.map(slot => ramp.streaksGeometry(slot.look));
  assert.equal(new Set(geometries).size, 4, `four cards get four streak geometries, not the same filter: ${geometries.join(',')}`);
  for (const id of streaks) {
    for (const colour of [[0, 0, 0], [255, 255, 255], [200, 40, 40], [30, 90, 200]]) {
      for (const value of ramp.lookPixel(id, ...colour, [0, 1])) assert.ok(value >= 0 && value <= 255, `${id} ${colour}`);
    }
  }
});

test('Thermal, Halftone, Dither, Glow, Streaks, ASCII and Depth are rows of their own, drawn on library pictures only, and Our photography carries no look', () => {
  const library = [picture('a'), picture('b'), picture('c'), picture('d')];
  const cutouts = [cutoutPicture('a'), cutoutPicture('b'), cutoutPicture('c'), cutoutPicture('d')];
  for (const family of FAMILIES) {
    const row = pack.recommendRow(family, profile('Techno'), 0, [], null, family === 'depth' ? cutouts : library);
    assert.equal(row.length, 4, `${family}: four library pictures, four cards`);
    // Every look is drawn on a reel the Director edits from the library's pictures (Depth: photos with a cut-out).
    assert.ok(row.every(slot => slot.row === family && slot.style === 'filter' && slot.reelIds?.length >= 2 && !slot.libraryId && !slot.effectId && !slot.plateId), `${family} is drawn on library pictures`);
    assert.ok(row.every(slot => slot.look && familyOf(slot.look) === family), `${family} deals only its own colourings`);
    assert.ok(row.every(slot => slot.label.includes(deal.liveLookTitle(slot.look))), 'the card says which look it is');
    assert.ok(new Set(row.map(slot => slot.look)).size >= 2, `${family} is not one look four times`);
    assert.equal(new Set(row.map(slot => slot.id)).size, 4);
    const pics = family === 'depth' ? cutouts : library;
    const refreshed = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(generation => pack.recommendRow(family, profile('Techno'), generation, [], null, pics).map(slot => slot.look).join()));
    assert.ok(refreshed.size >= 3, `${family}: Refresh deals other looks`);
    assert.deepEqual(pack.recommendRow(family, profile('Techno'), 0, [], null, pics).map(slot => slot.look), row.map(slot => slot.look), 'the same song and refresh deal the same looks');
    assert.deepEqual(pack.recommendRow(family, profile('Techno'), 0), [], `${family} has no picture to draw on without the library, so the row is empty`);
    const sad = pack.recommendRow(family, profile('Pop', 3, 'sad'), 0, [], null, ['a', 'b', 'c', 'd'].map(id => family === 'depth' ? cutoutPicture(id, 'sad') : picture(id, 'sad')));
    assert.ok(sad.length === 4 && sad.every(slot => slot.look), `${family}: a calm song gets looks too`);
  }
  // A picture of the person's own is drawn on all four cards, each in another colouring, with no library picture needed or named.
  for (const family of FAMILIES) {
    const own = pack.recommendRow(family, profile('Techno'), 0, [], null, [], {}, true);
    assert.equal(own.length, 4, `${family}: four cards from one picture of their own`);
    assert.ok(own.every(slot => slot.row === family && slot.style === 'filter' && !slot.libraryId && !slot.effectId && !slot.plateId && slot.look && familyOf(slot.look) === family), `${family} names no picture of ours`);
    assert.equal(new Set(own.map(slot => slot.id)).size, 4);
    assert.ok(new Set(own.map(slot => slot.look)).size >= 2, `${family}: one picture in more than one colouring`);
    assert.notDeepEqual(pack.recommendRow(family, profile('Techno'), 1, [], null, [], {}, true).map(slot => slot.look), own.map(slot => slot.look), `${family}: Refresh deals other colourings of their picture`);
    assert.deepEqual(pack.recommendRow(family, profile('Techno'), 0, [], null, library, {}, true).map(slot => slot.id), own.map(slot => slot.id), 'their picture replaces the library cards');
  }
  assert.deepEqual(pack.SHELF_ROWS.filter(row => ['thermal', 'halftone', 'dither', 'glow', 'streaks', 'ascii', 'depth'].includes(row.id)).map(row => row.picture), ['any', 'any', 'any', 'any', 'any', 'any', 'photo'], 'each look takes the shelf picture (Depth only a photo)');
  const thermalIds = new Set(pack.recommendRow('thermal', profile('Techno'), 0, [], null, library).map(slot => slot.id));
  assert.ok(pack.recommendRow('halftone', profile('Techno'), 0, [], null, library).every(slot => !thermalIds.has(slot.id)), 'the rows never share a card');
  assert.ok(pack.recommendRow('dither', profile('Techno'), 0, [], null, library).every(slot => !thermalIds.has(slot.id)), 'Dither does not share cards with Thermal');
  assert.ok(pack.recommendRow('glow', profile('Techno'), 0, [], null, library).every(slot => !thermalIds.has(slot.id)), 'Glow does not share cards with Thermal');
  assert.ok(pack.recommendRow('streaks', profile('Techno'), 0, [], null, library).every(slot => !thermalIds.has(slot.id)), 'Streaks does not share cards with Thermal');
  assert.ok(pack.recommendRow('ascii', profile('Techno'), 0, [], null, library).every(slot => !thermalIds.has(slot.id)), 'ASCII does not share cards with Thermal');
  assert.deepEqual(pack.recommendRow('thermal', profile('Gospel'), 0, [], null, library), [], 'no Thermal on a gospel song');
  assert.deepEqual(pack.recommendRow('streaks', profile('Gospel'), 0, [], null, library), [], 'no Streaks on a gospel song');
  assert.deepEqual(pack.recommendRow('ascii', profile('Gospel'), 0, [], null, library), [], 'no ASCII on a gospel song');
  assert.deepEqual(pack.recommendRow('depth', profile('Gospel'), 0, [], null, cutouts), [], 'no Depth on a gospel song');
  assert.equal(pack.recommendRow('halftone', profile('Gospel'), 0, [], null, library).length, 4, 'Halftone suits a gospel song');
  assert.equal(pack.recommendRow('dither', profile('Gospel'), 0, [], null, library).length, 4, 'Dither suits a gospel song');
  assert.equal(pack.recommendRow('glow', profile('Gospel'), 0, [], null, library).length, 4, 'Glow suits a gospel song');
  for (const row of ['photography', 'looks', 'riso', 'spray', 'pulise', 'dust']) {
    assert.ok(pack.recommendRow(row, profile('Techno'), 0, [], null, library).every(slot => !slot.look), `${row} has no look`);
  }
});

const python = spawnSync('python3', ['-c', 'import modal'], { encoding: 'utf8' });

test('the worker takes a look on a picture of Our photography and refuses every mistake', { skip: python.status !== 0 && 'Python with Modal is not installed' }, () => {
  const program = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("worker", ${JSON.stringify(workerPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
answers = []
for case in json.load(sys.stdin):
    try:
        module.parse_meta(json.dumps({"opts": case["opts"]}))
        module.check_media(case["opts"], {name: b"x" for name in case["media"]})
        answers.append(True)
    except ValueError:
        answers.append(False)
print(json.dumps(answers))
`;
  const filter = { style: 'filter', font: 'Anton', fontSecondary: 'Anton', layout: { rotate: 0, scaleBias: 1, cut: 0, seed: 3 }, cues: [], fallbackText: '', typeStyle: 'minimal' };
  const cases = [
    [{ ...filter, look: 'thermal' }, true, ['photo']],
    [{ ...filter, look: 'depthfog' }, true, ['photo', 'cutout']],
    [{ ...filter, look: 'depthfog' }, false, ['photo']],
    [{ ...filter }, true, ['photo']],
    [{ ...filter, look: 'sepia' }, false],
    [{ ...filter, look: 'thermal', effectId: 'tropical-ascii-cam-1' }, false],
    [{ ...filter, look: 'thermal', style: 'bank', bankId: 'x' }, false],
    [{ ...filter, look: 7 }, false],
    [{ ...filter, look: 'thermal', plateId: 'burnnet-woman-1547507-1920' }, true],
    [{ ...filter, plateId: 'burnnet-woman-1547507-1920', effectId: 'tropical-ascii-cam-1' }, false],
    [{ ...filter, look: 'thermal', plateId: 'burnnet-woman-1547507-1920' }, false, ['photo']],
    [{ ...filter, look: 'thermal' }, true, ['photo']],
    [{ ...filter, look: 'thermal' }, true, ['motion']],
    [{ ...filter, effectId: 'tropical-ascii-cam-1' }, true],
    [{ ...filter }, false, ['photo', 'motion']],
  ];
  const riso = { style: 'riso', font: 'Anton', fontSecondary: 'Anton', layout: { rotate: 0, scaleBias: 1, cut: 0, seed: 3 }, cues: [], fallbackText: '', inkSet: 'pink-blue' };
  cases.push(
    [{ ...riso, plateId: 'burnnet-woman-1547507-1920' }, true],
    [{ ...riso }, true, ['photo', 'cutout']],
    [{ ...riso }, true, ['motion']],
    [{ ...riso }, false, ['photo']],
    [{ ...riso }, false, ['photo', 'motion']],
    [{ ...riso }, false, ['cutout']],
  );
  const run = spawnSync('python3', ['-c', program], { input: JSON.stringify(cases.map(([opts, , media = []]) => ({ opts, media }))), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), cases.map(([, accepted]) => accepted));
});
