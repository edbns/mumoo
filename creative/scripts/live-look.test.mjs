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

test('every card of a row carries a look the lane welcomes, never the same on neighbours', () => {
  for (const lane of ['quiet', 'dark', 'techno', 'party', 'general']) {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const looks = deal.dealLooks(lane, seed, 4);
      assert.equal(looks.length, 4);
      assert.ok(looks.every(look => look && deal.isLiveLook(look) && deal.LIVE_LOOKS.find(entry => entry.id === look).lanes.includes(lane)), `${lane}/${seed}: ${looks}`);
      assert.ok(looks.every((look, index) => index === 0 || look !== looks[index - 1]), 'never the same look side by side');
      assert.ok(new Set(looks).size >= 2, 'never one look four times');
    }
  }
  assert.ok(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(seed => deal.dealLooks('dark', seed, 4).join())).size >= 4, 'a new seed (Refresh) deals different looks on different cards');
  assert.deepEqual(deal.dealLooks('dark', 's', 4), deal.dealLooks('dark', 's', 4), 'the same song always gets the same deal');
});

test('every lane has many looks, so Refresh keeps showing new ones', () => {
  for (const lane of ['quiet', 'dark', 'techno', 'party', 'general']) {
    assert.ok(deal.LIVE_LOOKS.filter(look => look.lanes.includes(lane)).length >= 8, `${lane} welcomes at least 8 looks`);
    const seen = new Set();
    for (let refresh = 0; refresh < 6; refresh++) deal.dealLooks(lane, `song:${refresh}`, 4).forEach(look => seen.add(look));
    assert.ok(seen.size >= 8, `${lane}: six refreshes showed ${seen.size} different looks`);
  }
});

test('gospel songs are never dealt a look', () => {
  assert.deepEqual(deal.dealLooks('gospel', 'seed', 4), [null, null, null, null]);
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
  assert.ok(ramp.halftoneCover(0, 0, 0) === 1 && ramp.halftoneCover(255, 255, 255) === 0);
  for (const value of [...dark, ...light, ...red]) assert.ok(value >= 0 && value <= 255);
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

test('a look rides on Our photography cards only, a few different ones, and gospel gets none', () => {
  const library = [picture('a'), picture('b'), picture('c')];
  const club = pack.recommendRow('photography', profile('Techno'), 0, [], null, library);
  assert.equal(club.length, 3, 'three library pictures, three cards, no baked filler');
  const wearing = club.filter(slot => slot.libraryId);
  assert.equal(wearing.length, 3);
  assert.ok(wearing.every(slot => slot.look && deal.isLiveLook(slot.look)), 'every library picture carries a look, none is dealt to a baked effect and lost');
  assert.equal(new Set(wearing.map(slot => slot.look)).size, 3, 'three different looks');
  assert.ok(club.every(slot => !slot.effectId), 'no baked effect beside the library pictures');
  assert.ok(pack.recommendRow('photography', profile('Techno'), 0).every(slot => slot.effectId && !slot.look), 'a baked effect never carries a look');
  const refreshed = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(generation => pack.recommendRow('photography', profile('Techno'), generation, [], null, library).map(slot => slot.look).join()));
  assert.ok(refreshed.size >= 3, 'Refresh deals the looks in other orders');
  assert.ok(pack.recommendRow('photography', profile('Techno'), 0).every(slot => !slot.look), 'with no picture to draw on there is no look');
  for (const row of ['looks', 'riso', 'spray', 'pulise', 'dust']) {
    assert.ok(pack.recommendRow(row, profile('Techno'), 0).every(slot => !slot.look), `${row} has no look`);
  }
  const sad = pack.recommendRow('photography', profile('Pop', 3, 'sad'), 0, [], null, ['a', 'b', 'c'].map(id => picture(id, 'sad')));
  assert.ok(sad.length === 3 && sad.every(slot => slot.look), 'a calm song carries looks too');
  const withPhoto = pack.recommendRow('photography', profile('Techno'), 0, [{ id: 'plate-1', cutout: true }]);
  assert.ok(withPhoto.every(slot => !slot.plateId && !slot.look && slot.effectId), 'our approved photo is not borrowed to show a look; with no library the cards are the baked effects');
  assert.deepEqual(pack.recommendRow('photography', profile('Techno'), 0, [], null, library).map(slot => slot.look), club.map(slot => slot.look), 'the same song and refresh deal the same looks');
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
