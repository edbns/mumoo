import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { planReel, segmentAt, clipMsAt, pieces, songAccents, OPENING_SKIP_MS } = await server.ssrLoadModule('/src/pack-director.ts');
await server.close();

const DURATION = 15000;
const BEATS = Array.from({ length: 30 }, (_, i) => 500 + i * 480); // 125 bpm
const BARS = BEATS.filter((_, i) => i % 4 === 0);
/** Soft for the first five seconds, hard from five to ten, soft again. */
const ENERGY = Array.from({ length: 150 }, (_, i) => ({ timeMs: i * 100, rms: i >= 50 && i < 100 ? 0.9 : 0.1 }));
const MUSIC = { beatsMs: BEATS, downbeatsMs: BARS, energy: ENERGY };
const CLIP = { kind: 'clip', shots: [[0, 4000], [4000, 5500], [5500, 12000]] };
const SHORT = { kind: 'clip', shots: [[0, 1500], [1500, 3000], [3000, 4200]] };
const PHOTO = { kind: 'photo' };
const ASSETS = [CLIP, PHOTO, SHORT, PHOTO, CLIP];

const lengths = (segments, from, to) => segments.filter(s => s.atMs >= from && s.atMs < to).map(s => s.endMs - s.atMs);
const mean = list => list.reduce((a, b) => a + b, 0) / list.length;

test('the same inputs make the same edit', () => {
  assert.deepEqual(planReel(ASSETS, MUSIC, 41, DURATION), planReel(ASSETS, MUSIC, 41, DURATION));
});

test('the edit covers the whole song, in order, with no gaps', () => {
  for (const seed of [0, 1, 2, 3, 9]) {
    const segments = planReel(ASSETS, MUSIC, seed, DURATION);
    assert.equal(segments[0].atMs, 0);
    assert.equal(segments.at(-1).endMs, DURATION);
    for (const [i, segment] of segments.entries()) {
      if (i > 0) assert.equal(segment.atMs, segments[i - 1].endMs);
      assert.ok(segment.endMs - segment.atMs >= 450, `${segment.endMs - segment.atMs}`);
    }
  }
});

test('cuts come faster where the music is hard than where it is soft', () => {
  for (const seed of [0, 4, 5, 6]) {
    const segments = planReel(ASSETS, MUSIC, seed, DURATION);
    const hard = mean(lengths(segments, 5500, 9500));
    const soft = mean([...lengths(segments, 0, 4500), ...lengths(segments, 10500, 15000)]);
    assert.ok(hard < soft, `seed ${seed}: hard ${hard} soft ${soft}`);
  }
});

test('soft music still shows the pictures: no cut is longer than a few seconds', () => {
  const soft = { beatsMs: BEATS, downbeatsMs: BARS, energy: ENERGY.map(f => ({ ...f, rms: 0.1 })) };
  for (const seed of [0, 1, 2, 3, 7]) {
    const segments = planReel(ASSETS, soft, seed, DURATION);
    for (const segment of segments.slice(0, -1)) assert.ok(segment.endMs - segment.atMs <= 2600, `seed ${seed}: ${segment.endMs - segment.atMs}`);
    assert.ok(new Set(segments.map(s => s.asset)).size >= 4, `seed ${seed}: ${new Set(segments.map(s => s.asset)).size} different pictures`);
  }
});

test('every picture of a reel gets its turn, on loud music too, whatever the seed', () => {
  const pool = [CLIP, SHORT, CLIP, PHOTO, PHOTO, PHOTO, PHOTO, PHOTO];
  const loud = { beatsMs: BEATS, downbeatsMs: BARS, energy: ENERGY.map(f => ({ ...f, rms: 0.8 })) };
  for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 4000, 4001, 4002, 4003]) {
    const seen = new Set(planReel(pool, loud, seed, DURATION).map(s => s.asset));
    // 15 s at 125 bpm has room for every one of eight pictures except where the temper is calm.
    assert.ok(seen.size >= (seed % 4 === 2 ? 5 : 7), `seed ${seed}: ${seen.size} of ${pool.length}`);
  }
});

test('cuts land on beats', () => {
  for (const seed of [0, 1, 2, 3]) {
    for (const segment of planReel(ASSETS, MUSIC, seed, DURATION).slice(1)) assert.ok(BEATS.includes(segment.atMs), `cut at ${segment.atMs}`);
  }
});

test('it opens on a clip and never repeats a picture back to back', () => {
  for (const seed of [0, 1, 2, 3, 7, 8]) {
    const segments = planReel(ASSETS, MUSIC, seed, DURATION);
    assert.equal(ASSETS[segments[0].asset].kind, 'clip');
    for (let i = 1; i < segments.length; i += 1) assert.notEqual(segments[i].asset, segments[i - 1].asset, `seed ${seed} cut ${i}`);
  }
});

test('stills never come twice in a row, and video is most of the reel', () => {
  for (const seed of [0, 1, 2, 3, 7, 8]) {
    const segments = planReel(ASSETS, MUSIC, seed, DURATION);
    for (let i = 1; i < segments.length; i += 1) {
      assert.ok(!(ASSETS[segments[i].asset].kind === 'photo' && ASSETS[segments[i - 1].asset].kind === 'photo'), `seed ${seed} cut ${i}`);
    }
    const clipTime = segments.filter(s => ASSETS[s.asset].kind === 'clip').reduce((sum, s) => sum + s.endMs - s.atMs, 0);
    assert.ok(clipTime / DURATION >= 0.5, `seed ${seed}: ${clipTime / DURATION}`);
  }
});

test('a clip plays from the start of a shot-sized piece, always from inside the clip', () => {
  for (const seed of [0, 1, 2, 3]) {
    for (const segment of planReel(ASSETS, MUSIC, seed, DURATION)) {
      if (ASSETS[segment.asset].kind !== 'clip') continue;
      assert.equal(segment.fromMs, segment.startMs);
      for (let ms = segment.atMs; ms < segment.endMs; ms += 50) {
        const at = clipMsAt(segment, ms);
        assert.ok(at >= segment.startMs && at < segment.pieceEndMs, `${at}`);
      }
    }
  }
});

test('a piece long enough to fill the cut is preferred to one that would loop', () => {
  const segments = planReel([CLIP], MUSIC, 0, DURATION);
  for (const segment of segments) {
    const fits = segment.pieceEndMs - segment.startMs >= segment.endMs - segment.atMs;
    // The clip has many long pieces: none of the cuts here has to loop.
    assert.ok(fits, `cut ${segment.atMs}: piece ${segment.pieceEndMs - segment.startMs} for ${segment.endMs - segment.atMs}`);
  }
});

test('stills push in or pull out slowly, clips do not move', () => {
  for (const segment of planReel(ASSETS, MUSIC, 3, DURATION)) {
    const [from, to] = segment.zoom;
    if (ASSETS[segment.asset].kind === 'photo') assert.ok(Math.abs(from - to) > 0.05 && Math.abs(from - to) < 0.2);
    else assert.deepEqual(segment.zoom, [1, 1]);
  }
});

test('the cards of a row are edited four different ways', () => {
  const edits = [0, 1, 2, 3].map(index => JSON.stringify(planReel(ASSETS, MUSIC, 4000 + index, DURATION)));
  assert.equal(new Set(edits).size, 4);
});

test('photos only: still a reel, with no clip to open on', () => {
  const segments = planReel([PHOTO, PHOTO, PHOTO], MUSIC, 1, DURATION);
  assert.ok(segments.length > 3);
  for (let i = 1; i < segments.length; i += 1) assert.notEqual(segments[i].asset, segments[i - 1].asset);
});

test('a clip with no usable shot is left out, nothing at all gives no edit', () => {
  const dead = { kind: 'clip', shots: [[0, 100]] };
  const segments = planReel([dead, PHOTO], MUSIC, 1, DURATION);
  assert.ok(segments.every(s => s.asset === 1));
  assert.deepEqual(planReel([], MUSIC, 1, DURATION), []);
  assert.deepEqual(planReel([dead], MUSIC, 1, DURATION), []);
});

test('no music still cuts, and flat music is cut evenly', () => {
  assert.ok(planReel(ASSETS, null, 0, DURATION).length >= 5);
  const flat = planReel(ASSETS, { beatsMs: BEATS, energy: ENERGY.map(f => ({ ...f, rms: 0.3 })) }, 0, DURATION);
  assert.ok(new Set(flat.slice(0, -1).map(s => s.endMs - s.atMs)).size <= 3);
});

test('segmentAt finds the piece playing at a moment', () => {
  const segments = planReel(ASSETS, MUSIC, 2, DURATION);
  for (const segment of segments) assert.equal(segmentAt(segments, segment.atMs), segment);
  assert.equal(segmentAt(segments, DURATION - 1), segments.at(-1));
});

test('a clip is never played from its very first frame, where many videos are still black or fading in', () => {
  for (const seed of [0, 1, 2, 3, 7]) {
    for (const segment of planReel(ASSETS, MUSIC, seed, DURATION)) {
      if (ASSETS[segment.asset].kind === 'clip') assert.ok(segment.startMs >= OPENING_SKIP_MS, `${segment.startMs}`);
    }
  }
  // A clip whose dark opening was measured when it was prepared already starts later: that start is kept.
  const measured = pieces([[1267, 6000]]);
  assert.equal(measured[0][0], 1267);
  assert.ok(measured.every(([start]) => start >= 1267));
  // A first shot too short to lose its opening keeps it, rather than leaving nothing to play.
  assert.deepEqual(pieces([[0, 500]]), [[0, 500]]);
});

test('a new section or a sung line inside a hold takes the cut onto its own beat', () => {
  const soft = { ...MUSIC, energy: ENERGY.map(frame => ({ ...frame, rms: 0.1 })) };
  let tried = 0;
  for (const seed of [0, 1, 2, 3]) {
    const plain = planReel(ASSETS, soft, seed, DURATION).map(s => s.atMs);
    // An accent a little off the beat, where the plain edit does not cut.
    const beat = BEATS.find(b => b > 3000 && !plain.includes(b) && !plain.some(cut => Math.abs(cut - b) < 450));
    if (beat === undefined) continue;
    const accented = planReel(ASSETS, { ...soft, accentsMs: [beat - 90] }, seed, DURATION).map(s => s.atMs);
    tried += 1;
    assert.ok(accented.includes(beat), `seed ${seed}: a cut lands on ${beat}`);
    assert.deepEqual(accented.filter(at => at < beat - 450), plain.filter(at => at < beat - 450), 'the edit before it is untouched');
  }
  assert.ok(tried >= 2, `only ${tried} seeds had a beat to test`);
  // No accents: the same edit as before.
  assert.deepEqual(planReel(ASSETS, { ...MUSIC, accentsMs: [] }, 5, DURATION), planReel(ASSETS, MUSIC, 5, DURATION));
});

test('a restrained song holds each picture longer than a kinetic one', () => {
  for (const seed of [0, 1, 2, 3]) {
    const kinetic = planReel(ASSETS, { ...MUSIC, pace: 'kinetic' }, seed, DURATION);
    const restrained = planReel(ASSETS, { ...MUSIC, pace: 'restrained' }, seed, DURATION);
    assert.deepEqual(kinetic, planReel(ASSETS, MUSIC, seed, DURATION), 'kinetic is how the Director always cut');
    assert.ok(restrained.length < kinetic.length, `seed ${seed}: ${restrained.length} cuts vs ${kinetic.length}`);
  }
});

test('the song\'s accents: its section changes on the bar, and each sung line\'s first word', () => {
  const segments = [{ startMs: 0, energyChange: null }, { startMs: 3000, energyChange: -0.29 }, { startMs: 5000, energyChange: 0.31 }, { startMs: 9000, energyChange: 0.1 }];
  const words = [{ startMs: 400, endMs: 700 }, { startMs: 760, endMs: 1000 }, { startMs: 2100, endMs: 2400 }, { startMs: 2450, endMs: 2700 }];
  // 3000 moves to the bar at 2420 (580 away); 5000 has none near enough (4340 is 660 away); 9000 is too small a change; 400 and 2100 start lines.
  assert.deepEqual(songAccents(segments, words, BARS, DURATION), [400, 2100, 2420, 5000]);
  assert.deepEqual(songAccents(segments, [], [], DURATION), [3000, 5000], 'no bars: the section marks stay where they are');
  assert.deepEqual(songAccents([], [], BARS, DURATION), []);
});
