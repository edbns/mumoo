/**
 * The Director. It edits a 15-second reel out of pictures, video clips and GIFs, the way an editor cuts to a song:
 * where the music is hard the cuts come fast and on the beat, where it is soft they breathe and land on the bar;
 * it opens on a moving clip, never shows the same picture twice in a row, leans on video over stills (stills sell
 * less), and plays every clip from the start of one of its shots instead of from a random moment.
 *
 * Like every plan in the pack it is a pure function of (assets, music, seed): the shelf preview in the browser and
 * the cloud render make exactly the same edit.
 */
export type Shot = readonly [startMs: number, endMs: number];

/** What the director is given: a still, or a clip with the shots found when it was prepared. */
export type ReelAsset = { kind: 'photo' } | { kind: 'clip'; shots: readonly Shot[] };

export type Segment = {
  /** When in the song this piece starts, and where it ends. */
  atMs: number;
  endMs: number;
  /** Which asset (its place in the list the director was given). */
  asset: number;
  /** Clips: the piece of the clip it plays, and where inside it the playing starts. Photos: all zero. */
  startMs: number;
  pieceEndMs: number;
  fromMs: number;
  /** Photos: the slow push (or pull) over the piece, as a scale from the start to the end. Clips: no move. */
  zoom: readonly [from: number, to: number];
};

export type DirectorMusic = {
  beatsMs: readonly number[];
  downbeatsMs?: readonly number[];
  energy: readonly { timeMs: number; rms: number }[];
};

const MIN_PIECE_MS = 800;
const MAX_PIECE_MS = 3200;
/** No cut is shorter than this, however fast the song. */
const MIN_CUT_MS = 450;
/** Nor longer, however soft: a slow song still shows its pictures, a few seconds each at most, so a reel is always a mix. */
const MAX_CUT_MS = 2600;
/** How many beats a cut holds at the loud, middle and soft parts of the song: every beat, every other, every bar. */
const HOLD = { high: 1, mid: 2, low: 4 } as const;
/** Each card of a row is edited with a different temper, which scales how many beats a cut holds: brisk, calm, in between. */
const TEMPER = [1, 0.5, 2, 1] as const;
/** The chance a cut is a clip rather than a still, at the loud, middle and soft parts, when there are both. */
const CLIP_CHANCE = { high: 0.88, mid: 0.72, low: 0.5 } as const;
const HIGH = 0.66;
const LOW = 0.33;

export function random(seed: number) {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 2246822519) + 0x6d2b79f5) >>> 0;
    return ((state ^ (state >>> 13)) >>> 0) / 4294967296;
  };
}

/** Long shots are split so there is always enough to choose from, even for a GIF that is one shot. */
export function pieces(shots: readonly Shot[]): Shot[] {
  let pool: Shot[] = shots.filter(([start, end]) => end - start >= 200);
  const split = (shot: Shot): Shot[] => {
    const length = shot[1] - shot[0];
    if (length <= MAX_PIECE_MS) return [shot];
    const parts = Math.ceil(length / MAX_PIECE_MS);
    return Array.from({ length: parts }, (_, i): Shot => [Math.round(shot[0] + (length * i) / parts), Math.round(shot[0] + (length * (i + 1)) / parts)]);
  };
  pool = pool.flatMap(split);
  // Fewer than four pieces: halve the longest until there are four, or they are too short to halve.
  while (pool.length > 0 && pool.length < 4) {
    const longest = pool.reduce((best, shot, i) => (shot[1] - shot[0] > pool[best][1] - pool[best][0] ? i : best), 0);
    const [start, end] = pool[longest];
    if (end - start < MIN_PIECE_MS * 2) break;
    const middle = Math.round((start + end) / 2);
    pool.splice(longest, 1, [start, middle], [middle, end]);
  }
  return pool;
}

function shuffled<T>(items: readonly T[], next: () => number): T[] {
  return items.map(item => ({ item, key: next() })).sort((a, b) => a.key - b.key).map(entry => entry.item);
}

/** How hard the music is at any moment of the 15 seconds, from 0 (its softest) to 1 (its hardest). Flat or unknown music is 0.5 throughout. */
function loudness(energy: DirectorMusic['energy']) {
  const values = energy.map(frame => frame.rms).filter(Number.isFinite).sort((a, b) => a - b);
  const low = values[Math.floor(values.length * 0.1)] ?? 0;
  const high = values[Math.floor(values.length * 0.9)] ?? 0;
  if (!values.length || high - low < 1e-6) return () => 0.5;
  return (fromMs: number, toMs: number) => {
    let sum = 0;
    let count = 0;
    for (const frame of energy) if (frame.timeMs >= fromMs && frame.timeMs < toMs) { sum += frame.rms; count += 1; }
    return count ? Math.min(1, Math.max(0, (sum / count - low) / (high - low))) : 0.5;
  };
}

const band = (level: number) => (level >= HIGH ? 'high' : level >= LOW ? 'mid' : 'low');

/** Where the cuts fall: on beats, holding fewer beats where the music is loud, ending on the bar where it is soft. */
function cutTimes(music: DirectorMusic | null, seed: number, durationMs: number) {
  const temper = TEMPER[Math.abs(seed) % TEMPER.length];
  const level = loudness(music?.energy ?? []);
  let beats = (music?.beatsMs ?? []).filter(ms => ms > 0 && ms < durationMs);
  if (!beats.length) beats = Array.from({ length: Math.floor(durationMs / 1000) - 1 }, (_, i) => (i + 1) * 1000);
  const bars = music?.downbeatsMs ?? [];
  const onBar = (ms: number) => bars.some(bar => Math.abs(bar - ms) < 40);

  const times = [0];
  const levels: number[] = [];
  let position = 0;
  for (;;) {
    const at = times[times.length - 1];
    while (position < beats.length && beats[position] <= at) position += 1;
    if (position >= beats.length) break;
    // How hard the next stretch of music is decides how long this cut holds.
    const here = level(at, at + 1500);
    const hold = Math.max(1, Math.round(HOLD[band(here)] * temper));
    let end = position + hold - 1;
    // Soft and middle parts land on the bar, if one falls inside the hold.
    if (hold > 1) {
      const bar = beats.slice(position, end + 1).findIndex(onBar);
      if (bar >= 0) end = position + bar;
    }
    while (end > position && beats[end] - at > MAX_CUT_MS) end -= 1;
    while (end < beats.length && beats[end] - at < MIN_CUT_MS) end += 1;
    if (end >= beats.length || beats[end] > durationMs - MIN_CUT_MS) break;
    levels.push(here);
    times.push(beats[end]);
    position = end + 1;
  }
  levels.push(level(times[times.length - 1], durationMs));
  return { times, levels };
}

export function planReel(assets: readonly ReelAsset[], music: DirectorMusic | null, seed: number, durationMs: number): Segment[] {
  const playable = assets.map((asset, index) => ({ asset, index })).filter(({ asset }) => asset.kind === 'photo' || pieces(asset.shots).length > 0);
  if (!playable.length) return [];
  const next = random(seed);
  const { times, levels } = cutTimes(music, seed, durationMs);

  const clips = shuffled(playable.filter(({ asset }) => asset.kind === 'clip').map(({ index }) => index), next);
  const photos = shuffled(playable.filter(({ asset }) => asset.kind === 'photo').map(({ index }) => index), next);
  const cursor = { clip: 0, photo: 0 };
  // Each clip's pieces, shuffled once, and how far through them the edit has played.
  const playlist = new Map<number, { pieces: Shot[]; used: number }>();
  for (const index of clips) {
    const asset = assets[index];
    if (asset.kind === 'clip') playlist.set(index, { pieces: shuffled(pieces(asset.shots), next), used: 0 });
  }

  const segments: Segment[] = [];
  const shown = new Map<number, number>();
  let previous = -1;
  times.forEach((atMs, k) => {
    const endMs = times[k + 1] ?? durationMs;
    const chance = CLIP_CHANCE[band(levels[k])];
    // It opens on a clip; after that a still only follows a clip, and never twice.
    const afterStill = segments.length > 0 && assets[previous]?.kind === 'photo';
    // Every picture of the reel gets its turn: a still that has not been seen yet takes the next cut once the clips have each been shown twice.
    const stillWaiting = photos.some(index => !shown.has(index)) && clips.every(index => (shown.get(index) ?? 0) >= 2);
    const draw = next();
    const clip = clips.length > 0 && (photos.length === 0 || k === 0 || afterStill || (draw < chance && !stillWaiting));
    const pool = clip ? clips : photos;
    const kind = clip ? 'clip' : 'photo';
    let asset = pool[cursor[kind] % pool.length];
    cursor[kind] += 1;
    if (asset === previous && pool.length > 1) {
      asset = pool[cursor[kind] % pool.length];
      cursor[kind] += 1;
    }
    previous = asset;
    shown.set(asset, (shown.get(asset) ?? 0) + 1);

    const length = endMs - atMs;
    const picked = playlist.get(asset);
    if (picked) {
      // Prefer a piece long enough to fill the cut without looping, starting from where one of its shots starts.
      const { pieces: all } = picked;
      let choice = picked.used % all.length;
      for (let tried = 0; tried < all.length; tried += 1) {
        const candidate = all[(picked.used + tried) % all.length];
        if (candidate[1] - candidate[0] >= length) { choice = (picked.used + tried) % all.length; break; }
      }
      picked.used = choice + 1;
      const [startMs, pieceEndMs] = all[choice];
      segments.push({ atMs, endMs, asset, startMs, pieceEndMs, fromMs: startMs, zoom: [1, 1] });
    } else {
      segments.push({ atMs, endMs, asset, startMs: 0, pieceEndMs: 0, fromMs: 0, zoom: k % 2 === 0 ? [1, 1.12] : [1.12, 1] });
    }
  });
  return segments;
}

/** The segment playing at `ms` of the song. */
export function segmentAt(segments: readonly Segment[], ms: number): Segment {
  let found = segments[0];
  for (const segment of segments) if (segment.atMs <= ms) found = segment;
  return found;
}

/** Where in its clip a segment plays at `ms` of the song. A piece shorter than its cut loops. */
export function clipMsAt(segment: Segment, ms: number): number {
  const length = Math.max(1, segment.pieceEndMs - segment.startMs);
  return segment.startMs + ((segment.fromMs - segment.startMs + (ms - segment.atMs)) % length);
}
