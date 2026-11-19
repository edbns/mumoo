/**
 * Edit presets (the owner's brief of 16 Nov 2026): the song's genre picks one of six, it is laid over Directed and every treatment,
 * it cuts to its own rhythm on the drums the analysis heard, and it moves, flashes and colours the picture the same way in the
 * preview and the cloud. The worker refuses a preset it does not know.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const presets = await server.ssrLoadModule('/src/edit-presets.ts');
const hits = await server.ssrLoadModule('/src/music-hits.ts');
const director = await server.ssrLoadModule('/src/pack-director.ts');
const motion = await server.ssrLoadModule('/src/preset-motion.ts');
const pack = await server.ssrLoadModule('/src/creatives-pack.ts');
const deal = await server.ssrLoadModule('/src/treatment-deal.ts');
await server.close();

const DURATION = 15000;
/** 120 bpm: a beat every 500 ms, a bar every 2 s; soft until the drop at 6 s, hard after it. */
const BEATS = Array.from({ length: 29 }, (_, i) => 250 + i * 500);
const BARS = BEATS.filter((_, i) => i % 4 === 0);
const ENERGY = Array.from({ length: 150 }, (_, i) => ({ timeMs: i * 100, rms: i >= 60 ? 0.9 : 0.15 }));
const SNARES = BEATS.filter((_, i) => i % 2 === 1);
const HATS = BEATS.map(ms => ms + 250).filter(ms => ms < DURATION);
const DROP = BARS[3];
const MUSIC = { beatsMs: BEATS, downbeatsMs: BARS, energy: ENERGY, snaresMs: SNARES, hatsMs: HATS, dropsMs: [DROP], kicksMs: BEATS.filter((_, i) => i % 2 === 0), heavyMs: BARS };
const ASSETS = [{ kind: 'clip', shots: [[0, 9000]] }, { kind: 'photo' }, { kind: 'clip', shots: [[0, 4000], [4000, 9000]] }, { kind: 'clip', shots: [[0, 7000]] }];

const lengths = segments => segments.slice(0, -1).map(s => s.endMs - s.atMs);
const plan = (id, seed = 3, music = MUSIC) => director.planReel(ASSETS, music, seed, DURATION, presets.presetDef(id).rhythm);

/* ---------- which preset a song gets ---------- */

test('the genre picks the preset the brief names, a style more than a sub-genre, a sub-genre more than a genre', () => {
  const pick = song => presets.presetsFor(song);
  assert.deepEqual(pick({ genre: 'Latin & Urbano', subGenre: 'General Latin', style: 'Brazilian funk' }), ['y2k']);
  assert.deepEqual(pick({ genre: 'Hip-Hop & Rap', subGenre: 'General Hip-Hop', style: 'UK drill' }), ['mono']);
  assert.deepEqual(pick({ genre: 'Hip-Hop & Rap', subGenre: 'Trap' }), ['strobe', 'y2k']);
  assert.deepEqual(pick({ genre: 'Hip-Hop & Rap', subGenre: 'Boom Bap / Lo-Fi' }), ['vhs']);
  assert.deepEqual(pick({ genre: 'Electronic & Dance (EDM)', subGenre: 'Deep House' }), ['dreamy']);
  assert.deepEqual(pick({ genre: 'Electronic & Dance (EDM)', subGenre: 'Ambient / Downtempo' }), ['dreamy']);
  assert.deepEqual(pick({ genre: 'Electronic & Dance (EDM)', subGenre: 'Techno' }), ['strobe']);
  assert.deepEqual(pick({ genre: 'Electronic & Dance (EDM)', subGenre: 'Synthwave / Vaporwave' }), ['vhs']);
  assert.deepEqual(pick({ genre: 'Pop', subGenre: 'General Pop', style: 'contemporary R&B' }), ['kodak', 'dreamy']);
  assert.deepEqual(pick({ genre: 'Metal', subGenre: 'Heavy Metal / Hard Rock' }), ['mono']);
  assert.deepEqual(pick({ genre: 'Country & Folk', subGenre: 'Modern Country' }), ['kodak']);
  assert.deepEqual(pick({ genre: 'Pop', subGenre: 'K-Pop / J-Pop' }), ['y2k']);
  assert.deepEqual(pick({ genre: 'Reggae & Dancehall', subGenre: 'Dancehall / Afrobeats' }), ['y2k']);
});

test('a song the brief does not name is cut as Raw 16mm, the most popular', () => {
  assert.deepEqual(presets.presetsFor({ genre: 'Gospel & Christian', subGenre: 'Gospel' }), ['kodak']);
  assert.deepEqual(presets.presetsFor({ genre: '' }), ['kodak']);
});

test('each Refresh takes the next preset that fits best, and the takes are spread across the four cards', () => {
  const trap = { genre: 'Hip-Hop & Rap', subGenre: 'Trap' };
  assert.deepEqual([0, 1, 2, 3].map(g => presets.presetAt(trap, g)), ['strobe', 'y2k', 'strobe', 'y2k']);
  assert.deepEqual([0, 1, 2, 3].map(i => presets.takeAt('vhs', 0, i)), ['rec', 'clean', 'rec', 'clean']);
  assert.deepEqual([0, 1, 2, 3].map(i => presets.takeAt('vhs', 1, i)), ['clean', 'rec', 'clean', 'rec']);
  assert.equal(new Set([0, 1, 2, 3].map(i => presets.takeAt('strobe', 0, i))).size, 4);
  for (const def of presets.PRESETS) for (const take of def.takes) assert.ok(presets.isPresetTake(def.id, take), `${def.id}/${take}`);
});

/* ---------- where the drums hit ---------- */

test('the hits are told apart by sound and place: dark strong beats are kicks, bright off-beats hats, the backbeat the snare, an energy jump the drop', () => {
  const beats = Array.from({ length: 16 }, (_, i) => 500 + i * 500);
  const bars = beats.filter((_, i) => i % 4 === 0);
  const offbeats = beats.map(ms => ms + 250);
  const frames = [];
  for (let ms = 0; ms < DURATION; ms += 23) {
    const onBeat = beats.some(b => Math.abs(b - ms) < 12);
    const onOff = offbeats.some(b => Math.abs(b - ms) < 12);
    frames.push({ timeMs: ms, rms: onBeat ? 0.8 : 0.2, onsetStrength: onBeat ? 9 : onOff ? 4 : 0.5, centroidHz: onBeat ? 600 : onOff ? 7000 : 2000 });
  }
  const found = hits.musicHits({
    beatsMs: beats, downbeatsMs: bars, transientsMs: [...beats, ...offbeats].sort((a, b) => a - b), frames,
    segments: [{ startMs: 0, energyChange: null }, { startMs: 4000, energyChange: 0.4 }, { startMs: 9000, energyChange: -0.3 }], durationMs: DURATION,
  });
  assert.deepEqual(found.kicksMs, beats);
  assert.deepEqual(found.hatsMs, offbeats);
  assert.deepEqual(found.snaresMs, beats.filter((_, i) => i % 2 === 1));
  assert.deepEqual(found.dropsMs, [4500], 'the drop moves onto the bar nearest the analysis second');
  assert.ok(found.heavyMs.length > 0 && found.heavyMs.every(ms => found.kicksMs.includes(ms)));
});

test('a song with no analysis of its drums gives no hits, and nothing breaks', () => {
  const none = hits.musicHits({ beatsMs: [], downbeatsMs: [], transientsMs: [], frames: [], segments: [], durationMs: DURATION });
  assert.deepEqual(none, { kicksMs: [], heavyMs: [], snaresMs: [], hatsMs: [], dropsMs: [] });
});

/* ---------- how each preset cuts ---------- */

test('every preset edits the whole song, in order, with no gaps, the same way every time', () => {
  for (const def of presets.PRESETS) {
    const segments = plan(def.id);
    assert.deepEqual(segments, plan(def.id), def.id);
    assert.equal(segments[0].atMs, 0, def.id);
    assert.equal(segments.at(-1).endMs, DURATION, def.id);
    segments.forEach((s, i) => { if (i) assert.equal(s.atMs, segments[i - 1].endMs, def.id); });
  }
});

test('every preset cuts on the drop', () => {
  for (const def of presets.PRESETS) assert.ok(plan(def.id).some(s => s.atMs === DROP), def.id);
});

test('Raw 16mm holds 2 to 4 beats (1 to 2 seconds here), on the beat', () => {
  const segments = plan('kodak');
  for (const [i, length] of lengths(segments).entries()) if (segments[i + 1].atMs !== DROP) assert.ok(length >= 1000 && length <= 2000, `${length}`);
  for (const s of segments.slice(1)) assert.ok(BEATS.includes(s.atMs), `${s.atMs}`);
});

test('90s Camcorder cuts on the snare, 0.8 to 1.5 seconds apart', () => {
  const segments = plan('vhs');
  for (const s of segments.slice(1)) if (s.atMs !== DROP) assert.ok(SNARES.includes(s.atMs), `${s.atMs}`);
  // The first snare is 0.75 s in: a little early is still the snare.
  for (const [i, length] of lengths(segments).entries()) if (i && segments[i + 1].atMs !== DROP) assert.ok(length >= 800 && length <= 1500, `${length}`);
});

test('Club Pulse cuts on every beat once the drop hits, and holds two beats before it', () => {
  const segments = plan('strobe');
  const after = segments.filter(s => s.atMs >= DROP).slice(0, -1).map(s => s.endMs - s.atMs);
  const before = segments.filter(s => s.endMs < DROP && s.atMs > 0).map(s => s.endMs - s.atMs);
  assert.ok(after.length > 4 && after.every(length => length === 500), `${after}`);
  assert.ok(before.length > 4 && before.every(length => length === 1000), `${before}`);
});

test('Y2K Digicam snaps 0.5 to 1 second, on hi-hats and the snare', () => {
  const segments = plan('y2k');
  const allowed = new Set([...HATS, ...SNARES]);
  for (const s of segments.slice(1)) if (s.atMs !== DROP) assert.ok(allowed.has(s.atMs), `${s.atMs}`);
  for (const [i, length] of lengths(segments).entries()) if (segments[i + 1].atMs !== DROP) assert.ok(length >= 500 && length <= 1000, `${length}`);
});

test('Dreamy holds a bar, 2 to 3 seconds, and dissolves', () => {
  const segments = plan('dreamy');
  for (const [i, length] of lengths(segments).entries()) if (segments[i + 1].atMs !== DROP) assert.ok(length >= 2000 && length <= 3000, `${length}`);
  assert.equal(presets.TRANSITION.dreamy('pastel'), 'dissolve');
});

test('Gritty Mono builds slowly, then cuts every half second after the drop', () => {
  const segments = plan('mono');
  const before = segments.filter(s => s.endMs <= DROP).map(s => s.endMs - s.atMs);
  const after = segments.filter(s => s.atMs >= DROP).slice(0, -1).map(s => s.endMs - s.atMs);
  assert.ok(before.every(length => length >= 1500), `${before}`);
  assert.ok(after.every(length => length >= 400 && length <= 650), `${after}`);
});

test('with no beats heard a preset still cuts in its own window', () => {
  const segments = director.planReel(ASSETS, null, 1, DURATION, presets.presetDef('kodak').rhythm);
  for (const length of lengths(segments)) assert.ok(length >= 1000 && length <= 2000, `${length}`);
});

test('without a preset the Director cuts as it always has', () => {
  const music = { beatsMs: BEATS, downbeatsMs: BARS, energy: ENERGY };
  assert.deepEqual(director.planReel(ASSETS, MUSIC, 5, DURATION), director.planReel(ASSETS, music, 5, DURATION));
});

/* ---------- what the preset does to the picture ---------- */

const moment = (ms, extra = {}) => ({ ms, cutsMs: [2000, 4000, 6250], music: MUSIC, energy: 0.8, seed: 7, ...extra });

test('Club Pulse flashes for two frames on the drop, white or black by take, and punches in on the kick', () => {
  assert.equal(motion.presetFrame('strobe', 'neon-white', moment(DROP + 10)).flash, 1);
  assert.equal(motion.presetFrame('strobe', 'mono-black', moment(DROP + 10)).flash, -1);
  assert.equal(motion.presetFrame('strobe', 'neon-white', moment(DROP + 80)).flash, 0);
  assert.ok(motion.presetFrame('strobe', 'neon-white', moment(BEATS[0] + 20)).zoom > 1.05);
  assert.equal(motion.presetFrame('strobe', 'mono-black', moment(1000)).look.mono, 1);
});

test('Y2K whips across each cut and zooms out of it, by take', () => {
  const into = motion.presetFrame('y2k', 'whip', moment(1960));
  const out = motion.presetFrame('y2k', 'whip', moment(2040));
  assert.ok(Math.abs(into.shiftX) > 0.05 && Math.abs(into.whipBlur) > 0);
  assert.ok(Math.sign(into.shiftX) === -Math.sign(out.shiftX), 'the next picture comes in from the other side');
  assert.equal(motion.presetFrame('y2k', 'whip', moment(3000)).whipBlur, 0);
  assert.ok(motion.presetFrame('y2k', 'zoom', moment(2020)).zoom > 1.2);
  for (const take of ['whip', 'zoom']) assert.equal(motion.presetFrame('y2k', take, moment(3000)).look.barrel, 0, 'Y2K Digicam has no fisheye');
});

test('Raw 16mm burns a warm leak on the drop, or once on the loudest bar of a song with none', () => {
  assert.ok(motion.presetFrame('kodak', 'portra-drift', moment(DROP + 700)).leak > 0.5);
  assert.equal(motion.presetFrame('kodak', 'portra-drift', moment(DROP - 500)).leak, 0);
  assert.deepEqual(motion.leakMoments({ downbeatsMs: BARS, energy: ENERGY }), [BARS.find(bar => bar >= 6000)]);
  assert.notDeepEqual(motion.presetFrame('kodak', 'portra-push', moment(2100)).zoom, motion.presetFrame('kodak', 'portra-push', moment(3900)).zoom, 'a push moves in over the piece');
});

test('90s Camcorder shows REC, a running clock and a nineties date, and jolts on a heavy hit', () => {
  const frame = motion.presetFrame('vhs', 'rec', moment(3200));
  assert.match(frame.rec.time, /^PM \d{1,2}:\d{2}:\d{2}$/);
  assert.match(frame.rec.date, /^[A-Z]{3}\. \d{2} 199\d$/);
  assert.equal(motion.presetFrame('vhs', 'clean', moment(3200)).rec, null);
  assert.equal(motion.presetFrame('vhs', 'clean', moment(BARS[1] + 20)).tear, 1);
  assert.equal(motion.presetFrame('vhs', 'clean', moment(BARS[1] + 200)).tear, 0);
});

test('Gritty Mono shakes on bass hits, and is black and white', () => {
  const shaken = motion.presetFrame('mono', 'grit', moment(BARS[2] + 60));
  assert.ok(Math.abs(shaken.shiftX) + Math.abs(shaken.shiftY) > 0);
  const still = motion.presetFrame('mono', 'grit', moment(BARS[2] + 400));
  assert.equal(still.shiftX, 0);
  assert.equal(still.look.mono, 1);
});

test('a moment is drawn the same every time (preview and cloud agree)', () => {
  for (const def of presets.PRESETS) for (const take of def.takes) {
    assert.deepEqual(motion.presetFrame(def.id, take, moment(5123)), motion.presetFrame(def.id, take, moment(5123)), `${def.id}/${take}`);
  }
});

/* ---------- on the shelf ---------- */

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clip = n => ({ id: uuid(n), kind: 'video', attitudes: ['fun'], tags: [], genre: null, subGenre: null, url: `https://x/${n}`, motionUrl: `https://x/${n}.mp4`, shots: [[0, 3000], [3000, 6000]] });
const LIBRARY = Array.from({ length: 10 }, (_, i) => clip(i + 1));

function profile(subGenre, style) {
  const frames = Array.from({ length: 20 }, (_, i) => ({ timeMs: i * 100, rms: 0.2, onsetStrength: 1, centroidHz: 2200, bandwidthHz: 1600, rolloffHz: 3000 }));
  return {
    version: 1,
    clip: { sourceSha256: 'c'.repeat(64), offsetMs: 0, durationMs: 15000 },
    creator: { primaryGenre: { value: 'Hip-Hop & Rap', source: 'creator' }, subGenre: { value: subGenre, source: 'creator' }, ...(style ? { style: { value: style, name: style, source: 'creator' } } : {}) },
    musicAnalysis: { status: 'ready', clip: {}, result: { rhythm: { tempo: { status: 'estimated', bpm: 125, gridBpm: 125, alternativesBpm: [] }, beatsMs: [1000, 2000] }, features: { transientsMs: [500], frames } } },
    approvedLyrics: { cues: [{ text: 'hello', startMs: 0, endMs: 380 }], source: 'creator_reviewed' },
    lyricMeaning: { status: 'ready', meaning: { attitude: 'fun', sadness: 0, intensity: 3 } },
  };
}

test('Directed and every treatment carry the song\'s preset, each card its own take, and the label says which', () => {
  const song = profile('Trap');
  for (const row of ['photography', ...deal.TREATMENT_IDS]) {
    const slots = pack.recommendRow(row, song, 0, [], LIBRARY);
    assert.equal(slots.length, 4, row);
    for (const [i, slot] of slots.entries()) {
      assert.equal(slot.preset, 'strobe', row);
      assert.equal(slot.presetTake, presets.takeAt('strobe', 0, i), row);
      assert.ok(slot.label.startsWith('Club Pulse'), `${row}: ${slot.label}`);
    }
  }
  assert.ok(pack.recommendRow('photography', song, 1, [], LIBRARY).every(slot => slot.preset === 'y2k'), 'Refresh takes the next that fits');
});

test('the other templates carry no preset', () => {
  for (const row of ['thermal', 'riso', 'pulise']) {
    for (const slot of pack.recommendRow(row, profile('Trap'), 0, [{ id: 'p1', cutout: true }], LIBRARY)) assert.equal(slot.preset, undefined, row);
  }
});

/* ---------- the worker and Learning ---------- */

const worker = fileURLToPath(new URL('../../audio-intelligence/modal_creatives_encode_staging.py', import.meta.url));
const PROGRAM = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("worker", ${JSON.stringify(worker)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
answers = []
for case in json.load(sys.stdin):
    try:
        module.parse_meta(json.dumps({"opts": case}))
        answers.append(True)
    except ValueError:
        answers.append(False)
print(json.dumps(answers))
`;
const R2 = 'https://abc123.r2.cloudflarestorage.com/bucket/library/x?X-Amz-Signature=1';
const reel = [{ kind: 'photo', url: R2 }, { kind: 'photo', url: R2 }];
const card = change => ({ style: 'filter', font: 'Anton', fontSecondary: 'Anton', layout: { rotate: 0, scaleBias: 1, cut: 0, seed: 3 }, cues: [], fallbackText: '', typeStyle: 'karaoke', reel, preset: 'vhs', presetTake: 'rec', ...change });
const cases = [
  [card({}), true],
  [card({ style: 'treatment', treatment: 'bento', treatmentVariant: 'mosaic' }), true],
  [card({ preset: 'kaleido' }), false],
  [card({ presetTake: 'portra-drift' }), false],
  [card({ presetTake: undefined }), false],
  [card({ look: 'thermal' }), false],
  [card({ style: 'riso', inkSet: 'pink-blue' }), false],
];
const python = spawnSync('python3', ['-c', 'import modal'], { encoding: 'utf8' });

test('the worker accepts a known preset and take over Directed or a treatment, and refuses the rest', { skip: python.status !== 0 && 'Python with Modal is not installed' }, () => {
  const run = spawnSync('python3', ['-c', PROGRAM], { input: JSON.stringify(cases.map(([opts]) => opts)), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), cases.map(([, accepted]) => accepted));
});

test('the worker\'s PRESETS stay in step with edit-presets.ts', () => {
  const block = readFileSync(worker, 'utf8').match(/PRESETS = \{([\s\S]*?)\n\}/);
  assert.ok(block, 'PRESETS missing from the worker');
  for (const def of presets.PRESETS) {
    assert.ok(block[1].includes(`"${def.id}"`), def.id);
    for (const take of def.takes) assert.ok(block[1].includes(`"${take}"`), `${def.id}/${take}`);
  }
});

test('Learning keeps the preset and take of each card', () => {
  const sent = readFileSync(new URL('../src/pack-feedback.ts', import.meta.url), 'utf8');
  const kept = readFileSync(new URL('../netlify/lib/feedback.mjs', import.meta.url), 'utf8');
  assert.match(sent, /preset: slot\.preset, presetTake: slot\.presetTake/);
  assert.match(kept, /preset, preset_take[,)]/);
  assert.match(readFileSync(new URL('../db/migrations/030_feedback_preset.sql', import.meta.url), 'utf8'), /add column if not exists preset text/);
});
