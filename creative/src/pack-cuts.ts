/**
 * A person's video or GIF is not played from its start. Its shots (found when it was prepared) are arranged into
 * a 15-second edit that cuts on the beat, and each card gets a different arrangement: the same pictures, cut four
 * ways. The plan is a pure function of the shots, the beat times and a seed, so the shelf preview and the cloud
 * render make exactly the same edit.
 */
export type Shot = readonly [startMs: number, endMs: number];
export type Cut = {
  /** When in the song this piece starts. */
  atMs: number;
  /** The piece of the video it plays, and where inside it the playing starts. */
  startMs: number;
  endMs: number;
  fromMs: number;
};

const MIN_PIECE_MS = 800;
const MAX_PIECE_MS = 3200;
const MIN_CUT_MS = 350;
/** Beats per cut for each kind of card: a card is calm (a cut every four beats), brisk (every beat) or in between. */
const BEATS_PER_CUT = [2, 1, 4, 2] as const;

function random(seed: number) {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 2246822519) + 0x6d2b79f5) >>> 0;
    return ((state ^ (state >>> 13)) >>> 0) / 4294967296;
  };
}

/** Long shots are split so there is always enough to choose from, even for a GIF that is one shot. */
function pieces(shots: readonly Shot[]): Shot[] {
  let pool: Shot[] = shots.filter(([start, end]) => end - start >= 200);
  const split = (shot: Shot): Shot[] => {
    const length = shot[1] - shot[0];
    if (length <= MAX_PIECE_MS) return [shot];
    const parts = Math.ceil(length / MAX_PIECE_MS);
    return Array.from({ length: parts }, (_, i): Shot => [Math.round(shot[0] + (length * i) / parts), Math.round(shot[0] + (length * (i + 1)) / parts)]);
  };
  pool = pool.flatMap(split);
  // Fewer than four pieces: halve the longest until there are four, or they are too short to halve.
  while (pool.length < 4) {
    const longest = pool.reduce((best, shot, i) => (shot[1] - shot[0] > pool[best][1] - pool[best][0] ? i : best), 0);
    const [start, end] = pool[longest];
    if (end - start < MIN_PIECE_MS * 2) break;
    const middle = Math.round((start + end) / 2);
    pool.splice(longest, 1, [start, middle], [middle, end]);
  }
  return pool;
}

export function planCuts(shots: readonly Shot[], beatsMs: readonly number[], seed: number, durationMs: number): Cut[] {
  const pool = pieces(shots);
  if (!pool.length) return [];
  const next = random(seed);
  const order = pool.map(piece => ({ piece, key: next() })).sort((a, b) => a.key - b.key).map(item => item.piece);

  const everyBeats = BEATS_PER_CUT[Math.abs(seed) % BEATS_PER_CUT.length];
  const beats = beatsMs.filter(ms => ms > 0 && ms < durationMs);
  // A song too fast to cut every beat (a beat under ~0.45 s) is cut every other one.
  const gap = beats.length > 1 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : 1000;
  const step = gap * everyBeats < 450 ? everyBeats * 2 : everyBeats;
  const times = [0];
  if (beats.length) {
    for (let i = 0; i < beats.length; i += step) if (beats[i] - times[times.length - 1] >= MIN_CUT_MS) times.push(beats[i]);
  } else {
    for (let t = 1000; t < durationMs; t += 1000) times.push(t);
  }

  return times.map((atMs, index) => {
    const [startMs, endMs] = order[index % order.length];
    const length = (times[index + 1] ?? durationMs) - atMs;
    const room = Math.max(0, endMs - startMs - length);
    return { atMs, startMs, endMs, fromMs: startMs + Math.round(room * next()) };
  });
}

/** Where in the video the picture comes from at `ms` of the song. A piece shorter than its slot loops. */
export function sourceMsAt(cuts: readonly Cut[], ms: number): number {
  let cut = cuts[0];
  for (const candidate of cuts) if (candidate.atMs <= ms) cut = candidate;
  const length = Math.max(1, cut.endMs - cut.startMs);
  return cut.startMs + ((cut.fromMs - cut.startMs + (ms - cut.atMs)) % length);
}
