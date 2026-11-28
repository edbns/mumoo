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
const deal = await server.ssrLoadModule('/src/treatment-deal.ts');await server.close();

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

/** What each song is cut as: the presets named by its most specific word, in the brief's order. */
const GENRE_PRESETS = [
  ['Latin & Urbano', 'General Latin', 'Brazilian funk', ['strobe','y2k','baile']],
  ['Latin & Urbano', 'General Latin', 'funk carioca', ['strobe','y2k','baile']],
  ['Latin & Urbano', 'General Latin', 'corridos tumbados', ['kodak','vhs','y2k']],
  ['Latin & Urbano', 'Reggaeton', undefined, ['strobe','y2k','baile']],
  ['Latin & Urbano', 'Traditional Latin (Salsa, Bachata)', undefined, ['kodak','y2k','golden']],
  ['Latin & Urbano', 'Latin Trap', undefined, ['vhs','y2k','baile']],
  ['Hip-Hop & Rap', 'General Hip-Hop', undefined, ['kodak','vhs','y2k']],
  ['Hip-Hop & Rap', 'General Hip-Hop', 'UK drill', ['vhs','strobe','mono']],
  ['Hip-Hop & Rap', 'Trap', undefined, ['strobe','y2k']],
  ['Hip-Hop & Rap', 'Drill', undefined, ['strobe','y2k']],
  ['Hip-Hop & Rap', 'Boom Bap / Lo-Fi', undefined, ['vhs','super8']],
  ['Hip-Hop & Rap', 'Phonk', undefined, ['strobe','y2k','baile']],
  ['Electronic & Dance (EDM)', 'Techno', undefined, ['strobe','afterhours']],
  ['Electronic & Dance (EDM)', 'Drum & Bass', undefined, ['strobe','y2k']],
  ['Electronic & Dance (EDM)', 'Dubstep / Riddim', undefined, ['strobe','y2k']],
  ['Electronic & Dance (EDM)', 'General Electronic', undefined, ['strobe','afterhours']],
  ['Electronic & Dance (EDM)', 'House', undefined, ['kodak','afterhours']],
  ['Electronic & Dance (EDM)', 'Tech House', undefined, ['kodak','afterhours']],
  ['Electronic & Dance (EDM)', 'Slap House', undefined, ['kodak','y2k']],
  ['Electronic & Dance (EDM)', 'Deep House', undefined, ['dreamy','afterhours']],
  ['Electronic & Dance (EDM)', 'Afro House', undefined, ['dreamy','golden','afterhours']],
  ['Electronic & Dance (EDM)', 'Ambient / Downtempo', undefined, ['dreamy','golden','afterhours']],
  ['Electronic & Dance (EDM)', 'Synthwave / Vaporwave', undefined, ['vhs','afterhours']],
  ['Pop', 'General Pop', 'contemporary R&B', ['kodak','dreamy','golden']],
  ['Pop', 'K-Pop / J-Pop', undefined, ['y2k','dreamy','baile']],
  ['Pop', 'Indie Pop', undefined, ['kodak','dreamy','super8']],
  ['Reggae & Dancehall', 'Dancehall / Afrobeats', undefined, ['y2k','golden','baile']],
  ['Metal', 'Heavy Metal / Hard Rock', undefined, ['kodak','vhs','strobe','mono']],
  ['Metal', 'Extreme Metal (Thrasher, Death)', undefined, ['vhs','strobe','mono']],
  ['Rock', 'Alternative Rock', undefined, ['kodak','vhs','mono']],
  ['Punk', 'Pop-Punk', undefined, ['vhs','y2k']],
  ['Punk', 'General Punk', undefined, ['vhs','y2k']],
  ['Punk', 'Hardcore Punk', undefined, ['vhs','mono']],
  ['Country & Folk', 'Modern Country', undefined, ['kodak','super8']],
  ['Country & Folk', 'Americana / Folk', undefined, ['kodak','dreamy','super8']],
  ['Classical & Cinematic', 'Neoclassical', undefined, ['kodak','dreamy','super8']],
  ['Gospel & Christian', 'Gospel', undefined, ['kodak','dreamy','golden','super8']],
  ['R&B & Soul', 'Neo-Soul', undefined, ['kodak','golden','super8']],
  ['Jazz & Blues', 'General Jazz', undefined, ['kodak','vhs','golden','super8']],
];

test('the genre picks the presets its most specific word names, a style more than a sub-genre, a sub-genre more than a genre', () => {
  for (const [genre, subGenre, style, want] of GENRE_PRESETS) assert.deepEqual(presets.presetsFor({ genre, subGenre, style }), want, `${subGenre} ${style ?? ''}`);
});

test('every genre the brief names has two presets or more to take turns, and groovy house is never strobed', () => {
  for (const [, subGenre, style, want] of GENRE_PRESETS) assert.ok(want.length >= 2, `${subGenre} ${style ?? ''}: ${want}`);
  for (const house of ['House', 'Tech House', 'G-House', 'Deep House', 'Afro House']) assert.ok(!presets.presetsFor({ genre: 'Electronic & Dance (EDM)', subGenre: house }).includes('strobe'), house);
});

test('a song the brief does not name is cut as Raw 16mm, the most popular', () => {
  assert.deepEqual(presets.presetsFor({ genre: '' }), ['kodak']);
  assert.deepEqual(presets.presetsFor({ genre: 'Spoken Word' }), ['kodak']);
});

test('a slow song never gets a fast-cut preset, whatever its genre says', () => {
  const slow = presets.SLOW_DRIVE - 0.05;
  const fast = new Set(presets.PRESETS.filter(def => def.fast).map(def => def.id));
  for (const [genre, subGenre, style] of GENRE_PRESETS) {
    const picked = presets.presetsFor({ genre, subGenre, style }, slow);
    assert.ok(picked.length && picked.every(id => !fast.has(id)), `${subGenre}: ${picked}`);
  }
  assert.deepEqual(presets.presetsFor({ genre: 'Latin & Urbano', subGenre: 'General Latin', style: 'Brazilian funk' }, slow), ['kodak']);
  assert.deepEqual(presets.presetsFor({ genre: 'Hip-Hop & Rap', subGenre: 'Trap' }, slow), ['kodak', 'vhs'], 'a slow trap song is filmed as hip-hop');
  assert.deepEqual(presets.presetsFor({ genre: 'Hip-Hop & Rap', subGenre: 'Trap' }), ['strobe', 'y2k'], 'no measured drive: the genre decides');
});

test('the measured drive picks among the presets the genre names: each is dealt only at the pace it suits', () => {
  for (const [genre, subGenre, style] of GENRE_PRESETS) {
    for (const drive of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const picked = presets.presetsFor({ genre, subGenre, style }, drive);
      const suits = def => drive >= def.drive[0] && drive <= def.drive[1] && !(drive < presets.SLOW_DRIVE && def.fast);
      const any = presets.PRESETS.some(def => presets.presetFit(def, { genre, subGenre, style }) > 0 && suits(def));
      // All suit its pace; or none of the song's could, and the nearest in pace is taken.
      if (any) assert.ok(picked.every(id => suits(presets.presetDef(id))), `${subGenre} at ${drive}: ${picked}`);
    }
  }
  const funk = { genre: 'Latin & Urbano', subGenre: 'General Latin', style: 'Brazilian funk' };
  const techno = { genre: 'Electronic & Dance (EDM)', subGenre: 'Techno' };
  for (const drive of [undefined, 0.3, 0.5, 0.7, 0.9]) {
    assert.ok(!presets.presetsFor(funk, drive).includes('mono'), `Gritty Mono is never Brazilian funk (${drive})`);
    assert.ok(!presets.presetsFor(techno, drive).includes('mono'), `nor techno (${drive})`);
  }
  assert.deepEqual(presets.presetsFor(funk, 0.8), ['strobe', 'y2k', 'baile']);
  assert.deepEqual(presets.presetsFor(techno, 0.45), ['afterhours'], 'a rolling techno groove is the Boiler Room, not strobed');
  assert.ok(presets.presetsFor({ ...techno, style: 'dark techno' }, 0.7).includes('mono'), 'dark techno is Gritty Mono');
  assert.deepEqual(presets.presetsFor({ genre: 'Gospel & Christian', subGenre: 'Gospel' }, 0.8), ['kodak'], 'a pounding gospel song is not held like a hymn');
});

test('a take that cuts its own way says so: long holds for the acoustic take, fast cuts for the drill drop and the street cam', () => {
  assert.ok(presets.presetRhythm('super8', 'dust').minMs >= 3000);
  assert.ok(presets.presetRhythm('mono', 'punch').maxMs <= 1000);
  assert.ok(presets.presetRhythm('baile', 'street').maxMs <= 750);
  assert.equal(presets.presetRhythm('golden', 'bloom').ramp, true);
  assert.deepEqual(presets.presetRhythm('kodak', 'portra-drift'), presets.presetDef('kodak').rhythm);
  for (const def of presets.PRESETS) for (const take of Object.keys(def.takeRhythm ?? {})) assert.ok(def.takes.includes(take), `${def.id}/${take}`);
  const slow = { ...MUSIC, dropsMs: [], drive: 0.15 };
  const dust = director.planReel(ASSETS, slow, 3, DURATION, presets.presetRhythm('super8', 'dust'));
  for (const s of dust.slice(0, -1)) assert.ok(s.endMs - s.atMs >= 3000 * 0.7, `an acoustic hold is long: ${s.endMs - s.atMs}`);
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

test('the song\'s drive sets the pace: a slowed song holds longer and never snaps fast, whatever the preset', () => {
  const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
  for (const id of ['strobe', 'y2k', 'baile', 'mono', 'kodak']) {
    const driving = lengths(plan(id, 3, { ...MUSIC, drive: 0.8 }));
    const slow = plan(id, 3, { ...MUSIC, drive: 0.25 });
    const slowed = lengths(slow);
    assert.ok(mean(slowed) > mean(driving) * 1.3, `${id}: ${mean(slowed)} vs ${mean(driving)}`);
    assert.ok(slowed.every((length, i) => length >= 700 || slow[i + 1].atMs === DROP), `${id}: ${slowed}`);
  }
  assert.deepEqual(plan('strobe', 3, { ...MUSIC, drive: 0.8 }), plan('strobe'), 'a driving song cuts as the preset says');
  for (const id of ['strobe', 'y2k', 'baile']) assert.ok(plan(id, 3, { ...MUSIC, drive: 0.25 }).every(segment => !segment.ramp), `${id}: no ramp on a slow song`);
  assert.deepEqual(director.driveBend(undefined), { stretch: 1, hardness: 1, fast: true, ramp: true });
  assert.ok(director.driveBend(0.2).hardness < 0.7, 'a soft song\'s loud part is not hard');
});

test('a reel is carried by its clips, each in turn; up to four stills stand one in each equal stretch of the song, never at the open', () => {
  const clipOf = () => ({ kind: 'clip', shots: [[0, 4000], [4000, 9000]] });
  for (const stills of [0, 1, 2, 3, 4, 6]) {
    const assets = [...Array.from({ length: 8 }, clipOf), ...Array.from({ length: stills }, () => ({ kind: 'photo' }))];
    for (const id of [null, 'strobe', 'kodak', 'dreamy']) {
      const segments = director.planReel(assets, MUSIC, 5, DURATION, id ? presets.presetDef(id).rhythm : undefined);
      const still = segments.map((s, i) => [s, i]).filter(([s]) => assets[s.asset].kind === 'photo');
      const count = Math.min(stills, director.REEL_STILLS, Math.floor((segments.length - 2) / 2));
      assert.equal(still.length, count, `${id} with ${stills} stills`);
      assert.equal(new Set(still.map(([s]) => s.asset)).size, still.length, `${id}: each still once`);
      assert.equal(assets[segments[0].asset].kind, 'clip', `${id} opens on a clip`);
      still.forEach(([s], n) => {
        const stretch = DURATION / count;
        assert.ok(s.atMs >= n * stretch - 1500 && s.atMs < (n + 1) * stretch + 1500, `${id}: still ${n + 1} of ${count} at ${s.atMs}`);
      });
      const clips = segments.filter(s => assets[s.asset].kind === 'clip').map(s => s.asset);
      const firstRound = clips.slice(0, 8);
      assert.equal(new Set(firstRound).size, firstRound.length, `${id}: no clip comes back before every clip has played`);
    }
  }
  const onlyStills = director.planReel([{ kind: 'photo' }, { kind: 'photo' }, { kind: 'photo' }], MUSIC, 5, DURATION);
  assert.ok(onlyStills.length > 3, 'no clip at all: the stills carry it');
});

test('without a preset the Director cuts as it always has', () => {
  const music = { beatsMs: BEATS, downbeatsMs: BARS, energy: ENERGY };
  assert.deepEqual(director.planReel(ASSETS, MUSIC, 5, DURATION), director.planReel(ASSETS, music, 5, DURATION));
});

/* ---------- what the preset does to the picture ---------- */

const moment = (ms, extra = {}) => ({ ms, cutsMs: [2000, 4000, 6250], durationMs: 15_000, music: MUSIC, energy: 0.8, seed: 7, ...extra });

test('no take ever stands still: every one drifts, and every one closes in a little on the kick', () => {
  const calm = { ...MUSIC, kicksMs: [], heavyMs: [], snaresMs: [], dropsMs: [] };
  const at = ms => moment(ms, { music: calm, cutsMs: [] });
  for (const def of presets.PRESETS) {
    for (const take of def.takes) {
      const frames = [500, 1500, 2500, 3500].map(ms => motion.presetFrame(def.id, take, at(ms)));
      const moves = frames.some((frame, i) => i && (Math.abs(frame.shiftX - frames[0].shiftX) + Math.abs(frame.shiftY - frames[0].shiftY) + Math.abs(frame.zoom - frames[0].zoom)) > 0.001);
      assert.ok(moves, `${def.id}/${take} moves within three seconds`);
      const kick = MUSIC.kicksMs.find(ms => ms > 1000 && !BARS.includes(ms));
      const on = motion.presetFrame(def.id, take, moment(kick + 20, { cutsMs: [] }));
      const off = motion.presetFrame(def.id, take, moment(kick + 20, { cutsMs: [], music: { ...MUSIC, kicksMs: [] } }));
      assert.ok(on.zoom > off.zoom, `${def.id}/${take} closes in on the kick`);
    }
  }
});

test('the snare flash takes flash at most three times a second, in white or in colour', () => {
  const snares = Array.from({ length: 40 }, (_, i) => 200 + i * 125);
  const music = { ...MUSIC, snaresMs: snares, dropsMs: [] };
  for (const [id, take] of [['mono', 'punch'], ['baile', 'neon']]) {
    let flashes = 0;
    let lit = false;
    const tints = new Set();
    for (let ms = 0; ms < 5000; ms += 1000 / 30) {
      const frame = motion.presetFrame(id, take, moment(ms, { music }));
      if (frame.flash > 0 && !lit) { flashes += 1; tints.add(frame.flashTint.join(',')); }
      lit = frame.flash > 0;
    }
    assert.ok(flashes >= 10 && flashes <= 15, `${id}/${take}: ${flashes} flashes in five seconds`);
    if (take === 'neon') assert.ok(tints.size > 1, 'the drop take flashes RGB');
  }
});

test('CCTV stamps its camera and a 24-hour clock; three takes are step-printed at a low frame rate, the rest play smoothly', () => {
  const cctv = motion.presetFrame('mono', 'cctv', moment(1000));
  assert.match(cctv.rec.label, /^CAM \d\d$/);
  assert.match(cctv.rec.time, /^\d\d:\d\d:\d\d$/);
  assert.equal(cctv.rec.dot, false);
  assert.equal(motion.presetFrame('vhs', 'rec', moment(1000)).rec.label, 'REC');
  assert.equal(Math.round(motion.presetStepMs('afterhours', 'cyan')), 83);
  assert.equal(Math.round(motion.presetStepMs('super8', 'porch')), 56);
  assert.equal(motion.presetStepMs('mono', 'cctv'), 100);
  assert.equal(motion.presetStepMs('kodak', 'portra-drift'), 0);
  assert.ok(motion.presetFrame('golden', 'haze', moment(1000)).look.edgeBlur > 0, 'the outro is soft at the edges');
});

test('the last cut leads into the first: it plays the opening clip up to where the video starts, so a replay has no seam', () => {
  const clips = Array.from({ length: 6 }, () => ({ kind: 'clip', shots: [[0, 12000]] }));
  for (const seed of [1, 2, 3, 4, 5]) {
    for (const id of ['kodak', 'strobe', 'baile']) {
      const segments = director.planReel([...clips, { kind: 'photo' }], MUSIC, seed, DURATION, presets.presetDef(id).rhythm);
      const [open] = segments;
      const end = segments[segments.length - 1];
      assert.equal(end.asset, open.asset, `${id} ${seed}`);
      assert.ok(!end.ramp);
      assert.ok(Math.abs(director.clipMsAt(end, DURATION) - director.clipMsAt(open, 0)) < 1, `${id} ${seed}: the end runs into the opening`);
    }
  }
});

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
  assert.ok(Math.abs(still.shiftX) < 0.005, 'between hits only the slow drift');
  assert.equal(still.look.mono, 1);
});

test('Gritty Mono punches and flashes on the drop, or ghosts with a heavy grain', () => {
  assert.ok(motion.presetFrame('mono', 'punch', moment(BEATS[0] + 20)).zoom > 1.03);
  assert.notEqual(motion.presetFrame('mono', 'punch', moment(DROP + 10)).flash, 0);
  const ghost = motion.presetFrame('mono', 'ghost', moment(3000));
  assert.ok(ghost.zoomBlur > 0 && ghost.look.grain > motion.presetFrame('mono', 'grit', moment(3000)).look.grain);
  for (const take of ['grit', 'punch', 'ghost']) assert.equal(motion.presetFrame('mono', take, moment(3000)).look.mono, 1, take);
});

test('Golden Hour glows warm and dissolves; Baile bends the lens and bounces on the kick', () => {
  for (const take of ['amber', 'bloom', 'live']) assert.ok(motion.presetFrame('golden', take, moment(3000)).look.halation > 0, take);
  assert.equal(presets.TRANSITION.golden('amber'), 'dissolve');
  for (const take of ['fisheye', 'neon', 'whip']) assert.ok(motion.presetFrame('baile', take, moment(3000)).look.barrel > 0.2, take);
  assert.ok(motion.presetFrame('baile', 'fisheye', moment(BEATS[0] + 20)).zoom > motion.presetFrame('baile', 'fisheye', moment(BEATS[0] + 300)).zoom);
  assert.equal(presets.TRANSITION.baile('whip'), 'whip');
});

test('Afterhours drags the shutter on the kick; Super 8 sits in a weaving gate', () => {
  assert.ok(motion.presetFrame('afterhours', 'cyan', moment(BEATS[0] + 20)).whipBlur !== 0);
  assert.ok(motion.presetFrame('afterhours', 'drag', moment(BEATS[0] + 300)).whipBlur !== 0, 'the drag take always smears a little');
  for (const take of ['porch', 'dust']) assert.equal(motion.presetFrame('super8', take, moment(3000)).look.gate, 1, take);
  assert.equal(motion.presetFrame('kodak', 'portra-drift', moment(3000)).look.gate, 0);
});

test('under a treatment the preset never bends Fisheye twice or draws a gate inside the panels', () => {
  const baile = motion.presetFrame('baile', 'fisheye', moment(3000));
  assert.equal(motion.fitTreatment(baile, 'fisheye').look.barrel, 0);
  assert.equal(motion.fitTreatment(baile, 'zoom').look.barrel, baile.look.barrel);
  const super8 = motion.presetFrame('super8', 'porch', moment(3000));
  for (const treatment of ['triptych', 'collage', 'bento', 'frame', 'sideways']) assert.equal(motion.fitTreatment(super8, treatment).look.gate, 0, treatment);
  assert.equal(motion.fitTreatment(super8, undefined), super8);
});

test('Club Pulse and Y2K pulse the lens on a bass hit, at most three times a second; the calmer presets never do', () => {
  assert.ok(motion.presetFrame('strobe', 'neon-white', moment(BARS[1] + 20)).pulse > 0.4);
  assert.ok(motion.presetFrame('y2k', 'whip', moment(BARS[1] + 20)).pulse > 0.4);
  assert.equal(motion.presetFrame('strobe', 'neon-white', moment(BARS[1] + 400)).pulse, 0);
  for (const id of ['kodak', 'vhs', 'dreamy', 'mono']) {
    const take = presets.presetDef(id).takes[0];
    assert.equal(motion.presetFrame(id, take, moment(BARS[1] + 20)).pulse, 0, id);
  }
  // Bass every 100 ms: a pulse starts only every third of a second.
  const fast = Array.from({ length: 30 }, (_, i) => i * 100);
  assert.deepEqual(motion.spaced(fast, 1000 / 3).slice(0, 4), [0, 400, 800, 1200]);
  const pulsing = Array.from({ length: 300 }, (_, i) => motion.presetFrame('strobe', 'neon-white', moment(i * 10, { music: { ...MUSIC, heavyMs: fast } })).pulse);
  const starts = pulsing.filter((value, i) => value > 0 && !(pulsing[i - 1] > 0)).length;
  assert.ok(starts <= 9, `${starts} pulses in three seconds`);
});

test('Club Pulse and Y2K ramp the clip: fast in on the cut, then at speed; the others play it straight', () => {
  for (const id of ['strobe', 'y2k']) {
    const segments = plan(id).filter(segment => ASSETS[segment.asset].kind === 'clip');
    assert.ok(segments.length && segments.every(segment => segment.ramp), id);
  }
  for (const id of ['kodak', 'vhs', 'dreamy', 'mono']) assert.ok(plan(id).every(segment => !segment.ramp), id);
  const speed = (t, length) => (director.rampedMs(t + 10, length) - director.rampedMs(t, length)) / 10;
  assert.ok(Math.abs(speed(20, 1000) - director.RAMP_FAST) < 1e-9, 'snaps in fast on the hit');
  assert.ok(Math.abs(speed(500, 1000) - 1) < 1e-9, 'plays at speed in between');
  assert.ok(Math.abs(speed(950, 1000) - 1) < 1e-9, 'plays at speed into the next cut');
  // Never slower than real time: a slowed 30 fps clip shows each frame several times and hangs before the cut.
  for (const length of [120, 300, 1000]) for (let t = 0; t < length; t += 1) assert.ok(director.rampRate(t, length) >= 1, `${length}: ${t}`);
  // Continuous: no jump in the picture where the speed changes; a short cut keeps the shape.
  for (const length of [300, 1000]) for (let t = 1; t < length; t += 1) assert.ok(director.rampedMs(t, length) > director.rampedMs(t - 1, length));
  const segment = { atMs: 1000, endMs: 2000, asset: 0, startMs: 0, pieceEndMs: 5000, fromMs: 0, zoom: [1, 1], ramp: true };
  assert.equal(director.clipMsAt(segment, 1100), 100 * director.RAMP_FAST);
  assert.equal(director.clipMsAt({ ...segment, ramp: undefined }, 1100), 100);
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
    musicAnalysis: { status: 'ready', clip: {}, result: { rhythm: { tempo: { status: 'estimated', bpm: 125, gridBpm: 125, alternativesBpm: [] }, beatsMs: [1000, 2000] }, features: { transientsMs: Array.from({ length: 10 }, (_, i) => 50 + i * 190), frames } } },
    approvedLyrics: { cues: [{ text: 'hello', startMs: 0, endMs: 380 }], source: 'creator_reviewed' },
    lyricMeaning: { status: 'ready', meaning: { attitude: 'fun', sadness: 0, intensity: 3 } },
  };
}

test('Directed and every treatment carry a preset of the song, the shelf shows them all, each card its own take, and the label says which', () => {
  const song = profile('Trap');
  const turn = ['strobe', 'y2k'];
  const shown = new Set();
  for (const row of ['photography', ...deal.TREATMENT_IDS.filter(id => id !== 'screenshot')]) {
    const slots = pack.recommendRow(row, song, 0, [], LIBRARY);
    assert.equal(slots.length, 4, row);
    const preset = slots[0].preset;
    assert.ok(turn.includes(preset), `${row}: ${preset}`);
    shown.add(preset);
    for (const [i, slot] of slots.entries()) {
      assert.equal(slot.preset, preset, `${row}: one preset a row`);
      assert.equal(slot.presetTake, presets.takeAt(preset, 0, i), row);
      assert.ok(slot.label.startsWith(presets.presetTitle(preset)), `${row}: ${slot.label}`);
    }
    const next = pack.recommendRow(row, song, 1, [], LIBRARY)[0].preset;
    assert.equal(next, turn[(turn.indexOf(preset) + 1) % turn.length], `${row}: Refresh takes the next that fits`);
  }
  assert.deepEqual([...shown].sort(), [...turn].sort(), 'one Refresh of the shelf shows every preset that fits');
});

test('the live looks and Riso are cut in a preset of the song; Screenshot, Window, Silhouette and the lyric-only templates carry none', () => {
  for (const row of ['thermal', 'halftone', 'ascii', 'riso']) {
    const slots = pack.recommendRow(row, profile('Trap'), 0, [{ id: 'p1', cutout: true }], LIBRARY);
    assert.ok(slots.every(slot => ['strobe', 'y2k', 'mono'].includes(slot.preset) && slot.reelIds?.length && slot.label.startsWith(presets.presetTitle(slot.preset))), `${row}: ${slots.map(slot => slot.label)}`);
  }
  for (const row of ['pulise', 'screenshot', 'window', 'silhouette']) {
    for (const slot of pack.recommendRow(row, profile('Trap'), 0, [{ id: 'p1', cutout: true }], LIBRARY)) assert.equal(slot.preset, undefined, row);
  }
});

test('over a live look or Riso the renderer takes only the preset\'s cut, never its colour or camera', () => {
  const source = readFileSync(new URL('../src/pack-renderer.ts', import.meta.url), 'utf8');
  assert.match(source, /const cutOnly = \(opts: PackRendererOpts\) => Boolean\(opts\.look\) \|\| opts\.style === 'riso';/);
  assert.match(source, /const presetLook = cutOnly\(current\) \? null : preset;/);
  assert.match(source, /if \(presetLook && picture\) \{/);
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
  [card({ look: 'thermal' }), true],
  [card({ style: 'riso', inkSet: 'pink-blue' }), true],
  [card({ style: 'window' }), false],
  [card({ look: 'thermal', reel: undefined, plateId: 'burnnet-woman-1547507-1920' }), false],
];
const python = spawnSync('python3', ['-c', 'import modal'], { encoding: 'utf8' });

test('the worker accepts a known preset and take over Directed, a treatment, a live look or Riso, and refuses the rest', { skip: python.status !== 0 && 'Python with Modal is not installed' }, () => {
  const run = spawnSync('python3', ['-c', PROGRAM], { cwd: fileURLToPath(new URL('../../audio-intelligence/', import.meta.url)), input: JSON.stringify(cases.map(([opts]) => opts)), encoding: 'utf8' });
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

test('all of Block Party\'s music is cut as Brazilian funk is at every drive, slowed included', () => {
  const carioca = { genre: 'Latin & Urbano', subGenre: 'General Latin', style: 'funk carioca' };
  const songs = [
    { genre: 'Reggae & Dancehall', subGenre: 'Dancehall / Afrobeats', style: 'dancehall' },
    { genre: 'Latin & Urbano', subGenre: 'Reggaeton', style: 'reggaeton' },
    { genre: 'Latin & Urbano', subGenre: 'Reggaeton' },
    { genre: 'Latin & Urbano', subGenre: 'Reggaeton', style: 'Dominican dembow' },
    { genre: 'Reggae & Dancehall', subGenre: 'General Reggae', style: 'soca music' },
    { genre: 'Latin & Urbano', subGenre: 'General Latin', style: 'funk mandelão' },
  ];
  for (const song of songs) for (const drive of [undefined, 0.2, 0.45, 0.7, 0.95]) {
    assert.deepEqual(presets.presetsFor(song, drive), presets.presetsFor(carioca, drive), `${song.style ?? song.subGenre} at ${drive}`);
  }
  const afro = presets.presetsFor({ genre: 'Reggae & Dancehall', subGenre: 'Dancehall / Afrobeats', style: 'Afrobeats' }, 0.7);
  assert.notDeepEqual(afro, presets.presetsFor(carioca, 0.7), 'Afrobeats is Sunset & Coast\'s, cut its own way');
});

test('phonk is cut as Brazilian funk is at every drive, slowed included; never the 90s Camcorder', () => {
  const carioca = { genre: 'Latin & Urbano', subGenre: 'General Latin', style: 'funk carioca' };
  for (const style of ['Brazilian phonk', 'drift phonk', 'phonk', 'phonk house', 'rare phonk']) {
    for (const drive of [undefined, 0.15, 0.3, 0.45, 0.6, 0.8, 0.95]) {
      const phonk = presets.presetsFor({ genre: 'Electronic & Dance (EDM)', subGenre: 'General Electronic', style }, drive);
      assert.deepEqual(phonk, presets.presetsFor(carioca, drive), `${style} at ${drive}`);
      assert.ok(!phonk.includes('vhs'), `${style} at ${drive}`);
    }
  }
});
