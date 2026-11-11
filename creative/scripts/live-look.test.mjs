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

const FAMILIES = ['thermal', 'halftone'];
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
      }
    }
    assert.ok(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(seed => deal.dealLooks('dark', seed, 4, family).join())).size >= 4, `${family}: a new seed (Refresh) deals different looks on different cards`);
    assert.deepEqual(deal.dealLooks('dark', 's', 4, family), deal.dealLooks('dark', 's', 4, family), 'the same song always gets the same deal');
  }
});

test('every effect has many colourings in every lane, so Refresh keeps showing new ones', () => {
  for (const family of FAMILIES) {
    for (const lane of ['quiet', 'dark', 'techno', 'party', 'general']) {
      assert.ok(deal.LIVE_LOOKS.filter(look => look.family === family && look.lanes.includes(lane)).length >= 6, `${family} welcomes at least 6 colourings in ${lane}`);
      const seen = new Set();
      for (let refresh = 0; refresh < 6; refresh++) deal.dealLooks(lane, `song:${refresh}`, 4, family).forEach(look => seen.add(look));
      assert.ok(seen.size >= 6, `${family}/${lane}: six refreshes showed ${seen.size} different looks`);
    }
  }
});

test('Thermal is not dealt on a gospel song, Halftone is', () => {
  assert.deepEqual(deal.dealLooks('gospel', 'seed', 4, 'thermal'), [null, null, null, null]);
  assert.ok(deal.dealLooks('gospel', 'seed', 4, 'halftone').every(look => look && familyOf(look) === 'halftone'));
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
  assert.ok(halftones.length >= 8, 'many inks and papers');
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

test('Thermal and Halftone are rows of their own, drawn on library pictures only, and Our photography carries no look', () => {
  const library = [picture('a'), picture('b'), picture('c'), picture('d')];
  for (const family of FAMILIES) {
    const row = pack.recommendRow(family, profile('Techno'), 0, [], null, library);
    assert.equal(row.length, 4, `${family}: four library pictures, four cards`);
    assert.ok(row.every(slot => slot.row === family && slot.style === 'filter' && slot.libraryId && !slot.effectId && !slot.plateId), `${family} is drawn on library pictures`);
    assert.ok(row.every(slot => slot.look && familyOf(slot.look) === family), `${family} deals only its own colourings`);
    assert.ok(row.every(slot => slot.label.includes(deal.liveLookTitle(slot.look))), 'the card says which look it is');
    assert.ok(new Set(row.map(slot => slot.look)).size >= 2, `${family} is not one look four times`);
    assert.equal(new Set(row.map(slot => slot.id)).size, 4);
    const refreshed = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(generation => pack.recommendRow(family, profile('Techno'), generation, [], null, library).map(slot => slot.look).join()));
    assert.ok(refreshed.size >= 3, `${family}: Refresh deals other looks`);
    assert.deepEqual(pack.recommendRow(family, profile('Techno'), 0, [], null, library).map(slot => slot.look), row.map(slot => slot.look), 'the same song and refresh deal the same looks');
    assert.deepEqual(pack.recommendRow(family, profile('Techno'), 0), [], `${family} has no picture to draw on without the library, so the row is empty`);
    const sad = pack.recommendRow(family, profile('Pop', 3, 'sad'), 0, [], null, ['a', 'b', 'c', 'd'].map(id => picture(id, 'sad')));
    assert.ok(sad.length === 4 && sad.every(slot => slot.look), `${family}: a calm song gets looks too`);
  }
  const thermalIds = new Set(pack.recommendRow('thermal', profile('Techno'), 0, [], null, library).map(slot => slot.id));
  assert.ok(pack.recommendRow('halftone', profile('Techno'), 0, [], null, library).every(slot => !thermalIds.has(slot.id)), 'the rows never share a card');
  assert.deepEqual(pack.recommendRow('thermal', profile('Gospel'), 0, [], null, library), [], 'no Thermal on a gospel song');
  assert.equal(pack.recommendRow('halftone', profile('Gospel'), 0, [], null, library).length, 4, 'Halftone suits a gospel song');
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
  const run = spawnSync('python3', ['-c', program], { input: JSON.stringify(cases.map(([opts, , media = []]) => ({ opts, media }))), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), cases.map(([, accepted]) => accepted));
});
