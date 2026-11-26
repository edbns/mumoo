/**
 * The Director. It edits a 15-second reel out of pictures, video clips and GIFs, the way an editor cuts to a song:
 * where the music is hard the cuts come fast and on the beat, where it is soft they breathe and land on the bar;
 * it opens on a moving clip, never shows the same picture twice in a row, leans on video over stills (stills sell
 * less), and plays every clip from the start of one of its shots instead of from a random moment.
 *
 * Like every plan in the pack it is a pure function of (assets, music, seed): the shelf preview in the browser and
 * the cloud render make exactly the same edit.
 */
import { SLOW_DRIVE, type PresetRhythm } from './edit-presets';

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
  /** Clips of a velocity edit: the clip snaps in fast on the cut, then plays at speed (`rampedMs`). */
  ramp?: boolean;
};

export type DirectorMusic = {
  beatsMs: readonly number[];
  downbeatsMs?: readonly number[];
  energy: readonly { timeMs: number; rms: number }[];
  /** Moments a cut should land on: where the song changes section and where a sung line starts (`songAccents`). */
  accentsMs?: readonly number[];
  /** How the song wants to be cut, from its vibe (`music-intent.ts`): restrained songs hold each picture longer. */
  pace?: Pace;
  /** Where the drums hit (`music-hits.ts`): an edit preset cuts on these. */
  snaresMs?: readonly number[];
  hatsMs?: readonly number[];
  dropsMs?: readonly number[];
  /** How driving the song really is, 0..1, from its tempo and how busy its drums are (`MusicIntentV1.drive`), not from its genre. */
  drive?: number;
};

/** At or above this drive a song may be cut its preset's fast way; below `SLOW_DRIVE` its cuts hold longest. */
const STEADY_DRIVE = 0.55;
/** How much longer a preset's cuts hold on a slow song, and on one between slow and steady. */
const SLOW_STRETCH = 1.8;
const EASY_STRETCH = 1.3;

/** How a song's drive bends a preset's cutting: how much longer its cuts hold, how hard its loudest parts count, and whether it may cut fast. */
export function driveBend(drive: number | undefined) {
  if (drive === undefined || !Number.isFinite(drive)) return { stretch: 1, hardness: 1, fast: true, ramp: true };
  return {
    stretch: drive < SLOW_DRIVE ? SLOW_STRETCH : drive < STEADY_DRIVE ? EASY_STRETCH : 1,
    // A soft song's loudest bar is loud only next to the rest of it: it never counts as hard.
    hardness: Math.min(1, 0.35 + (0.65 * drive) / STEADY_DRIVE),
    fast: drive >= STEADY_DRIVE,
    ramp: drive >= SLOW_DRIVE,
  };
}

export type Pace = 'kinetic' | 'balanced' | 'restrained';
const PACE: Record<Pace, number> = { kinetic: 1, balanced: 1.5, restrained: 2 };

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
/**
 * Stills only bring a moment of stillness to a reel of clips: at most this many, one in each equal stretch of the song (four: one a
 * quarter, three: one a third), never the opening cut. More and the reel turns into a photo slideshow.
 */
export const REEL_STILLS = 4;
const HIGH = 0.66;
const LOW = 0.33;
/** Many videos open on black or fade in. A clip prepared before we measured that is never played from its very first frame. */
export const OPENING_SKIP_MS = 300;
/** A cut moves to a beat this close to an accent. */
const ACCENT_SNAP_MS = 220;
/** A section change: the song's energy rises or falls by this much from one stretch to the next. */
const SECTION_CHANGE = 0.25;
const SECTION_BAR_MS = 600;
/** A sung word after a pause this long starts a line. */
const LINE_GAP_MS = 450;

export function random(seed: number) {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 2246822519) + 0x6d2b79f5) >>> 0;
    return ((state ^ (state >>> 13)) >>> 0) / 4294967296;
  };
}

/** Long shots are split so there is always enough to choose from, even for a GIF that is one shot. */
export function pieces(shots: readonly Shot[]): Shot[] {
  let pool: Shot[] = shots
    .map(([start, end]): Shot => (start === 0 && end >= OPENING_SKIP_MS * 2 ? [OPENING_SKIP_MS, end] : [start, end]))
    .filter(([start, end]) => end - start >= 200);
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
  const bend = driveBend(music?.drive);
  const temper = TEMPER[Math.abs(seed) % TEMPER.length] * PACE[music?.pace ?? 'kinetic'] * bend.stretch;
  const measured = loudness(music?.energy ?? []);
  const level = (from: number, to: number) => measured(from, to) * bend.hardness;
  let beats = (music?.beatsMs ?? []).filter(ms => ms > 0 && ms < durationMs);
  if (!beats.length) beats = Array.from({ length: Math.floor(durationMs / 1000) - 1 }, (_, i) => (i + 1) * 1000);
  const bars = music?.downbeatsMs ?? [];
  const onBar = (ms: number) => bars.some(bar => Math.abs(bar - ms) < 40);
  const accents = music?.accentsMs ?? [];
  const nearAccent = (ms: number) => accents.some(accent => Math.abs(accent - ms) <= ACCENT_SNAP_MS);

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
    // A new section or a new sung line inside the hold takes the cut, a little early, onto its own beat.
    for (let j = position; j < end; j += 1) {
      if (beats[j] - at >= MIN_CUT_MS && nearAccent(beats[j])) { end = j; break; }
    }
    if (end >= beats.length || beats[end] > durationMs - MIN_CUT_MS) break;
    levels.push(here);
    times.push(beats[end]);
    position = end + 1;
  }
  levels.push(level(times[times.length - 1], durationMs));
  return { times, levels };
}

/** With no beats heard, a steady 120 bpm stands in for them. */
const STAND_IN_BEAT_MS = 500;
/** The last piece is never shorter than this share of the window: a cut that would leave less is not made. */
const LAST_SHARE = 0.5;
/** A preset's seconds bend this far (a share of each end) to keep a cut on what it cuts on: the snare a little early is still the snare. */
const LOOSE_LOW = 0.75;
const LOOSE_HIGH = 1.25;

/**
 * Where the cuts fall under an edit preset (`edit-presets.ts`). A cut holds the preset's count of what it cuts on (two to four beats,
 * one snare, one bar: fewer where the music is hard), as long as that lands near its window in seconds; else it lands on what it cuts
 * on nearest the moment the music asks for, else on a beat, inside the window. A drop always takes the cut nearest it. The hard parts
 * (after the drop, or loud) use the preset's fast way of cutting.
 */
function presetCutTimes(music: DirectorMusic | null, rhythm: PresetRhythm, seed: number, durationMs: number) {
  const next = random(seed ^ 0x5bd1e995);
  const bend = driveBend(music?.drive);
  const measured = loudness(music?.energy ?? []);
  const level = (from: number, to: number) => measured(from, to) * bend.hardness;
  const inside = (list: readonly number[] | undefined) => (list ?? []).filter(ms => ms > 0 && ms < durationMs);
  let beats = inside(music?.beatsMs);
  if (!beats.length) beats = Array.from({ length: Math.floor(durationMs / STAND_IN_BEAT_MS) - 1 }, (_, i) => (i + 1) * STAND_IN_BEAT_MS);
  const heardBars = inside(music?.downbeatsMs);
  const heardSnares = inside(music?.snaresMs);
  const snares = heardSnares.length ? heardSnares : beats.filter((_, i) => i % 2 === 1);
  const candidates: Record<PresetRhythm['on'], number[]> = {
    beats,
    snares,
    hits: [...new Set([...inside(music?.hatsMs), ...snares])].sort((a, b) => a - b),
    bars: heardBars.length ? heardBars : beats.filter((_, i) => i % 4 === 0),
  };
  const drops = inside(music?.dropsMs);

  const times = [0];
  const levels: number[] = [];
  for (;;) {
    const at = times[times.length - 1];
    const here = level(at, at + 1500);
    const afterDrop = drops.some(drop => at >= drop - 50);
    const fast = rhythm.fast && bend.fast && (rhythm.fastAfterDrop ? (drops.length ? afterDrop : here >= HIGH) : here >= HIGH || (afterDrop && here >= LOW));
    const chosen = fast ? rhythm.fast! : rhythm;
    // A slow song holds longer, up to the longest cut, but never shorter than the take itself holds (an acoustic take's long holds).
    const stretched = (ms: number, cap: number) => (bend.stretch > 1 ? Math.max(ms, Math.min(cap, ms * bend.stretch)) : ms * bend.stretch);
    const way = bend.stretch === 1 ? chosen : {
      ...chosen,
      minMs: stretched(chosen.minMs, MAX_CUT_MS),
      maxMs: stretched(chosen.maxMs, MAX_CUT_MS * 1.25),
      ...(chosen.every === undefined ? {} : { every: typeof chosen.every === 'number' ? Math.round(chosen.every * bend.stretch) : [Math.round(chosen.every[0] * bend.stretch), Math.round(chosen.every[1] * bend.stretch)] as const }),
    };
    const low = at + way.minMs;
    const high = at + way.maxMs;
    const share = Math.min(1, Math.max(0, 0.85 * (1 - here) + 0.3 * (next() - 0.5)));
    const target = low + (high - low) * share;
    const nearest = (list: readonly number[], from: number, to: number) => list.filter(ms => ms >= from && ms <= to).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    const list = candidates[way.on];
    const looseLow = at + way.minMs * LOOSE_LOW;
    const looseHigh = at + way.maxMs * LOOSE_HIGH;
    let counted: number | undefined;
    if (way.every !== undefined) {
      const hold = typeof way.every === 'number' ? way.every : Math.round(way.every[1] - (way.every[1] - way.every[0]) * here);
      const first = list.findIndex(ms => ms > at + MIN_CUT_MS / 2);
      const pick = first >= 0 ? list[first + hold - 1] : undefined;
      if (pick !== undefined && pick >= looseLow && pick <= looseHigh) counted = pick;
    }
    const heard = counted ?? nearest(list, low, high) ?? nearest(list, looseLow, looseHigh) ?? nearest(beats, low, high);
    // Nothing left to cut on (the beats have stopped) and the end is within reach: the shot holds to it.
    if (heard === undefined && durationMs <= looseHigh) break;
    let cut = heard ?? target;
    // The drop takes the cut: one inside the hold, or one just after it (so the piece before is not a flash).
    const drop = drops.find(ms => ms >= at + MIN_CUT_MS && ms < cut + MIN_CUT_MS && ms <= looseHigh);
    if (drop !== undefined) cut = drop;
    cut = Math.round(cut);
    if (cut > durationMs - way.minMs * LAST_SHARE) break;
    levels.push(here);
    times.push(cut);
  }
  levels.push(level(times[times.length - 1], durationMs));
  return { times, levels };
}

/**
 * Where the song asks for a cut besides its beats: each stretch whose energy jumps or drops from the one before (a drop,
 * a break, a chorus coming in) and each sung line's first word. Sorted, each once, inside the clip.
 */
export function songAccents(
  segments: readonly { startMs: number; energyChange: number | null }[],
  words: readonly { startMs: number; endMs: number }[],
  downbeatsMs: readonly number[],
  durationMs: number,
): number[] {
  // The analysis marks sections on whole seconds; the bar that starts nearest is where the change is really heard.
  const onBar = (ms: number) => {
    const bar = downbeatsMs.reduce((best, d) => (Math.abs(d - ms) < Math.abs(best - ms) ? d : best), Number.POSITIVE_INFINITY);
    return Math.abs(bar - ms) <= SECTION_BAR_MS ? bar : ms;
  };
  const sections = segments.filter(segment => segment.energyChange !== null && Math.abs(segment.energyChange) >= SECTION_CHANGE).map(segment => onBar(segment.startMs));
  const lines = words.filter((word, i) => i === 0 || word.startMs - words[i - 1].endMs >= LINE_GAP_MS).map(word => word.startMs);
  return [...new Set([...sections, ...lines].map(Math.round))].filter(ms => ms > 0 && ms < durationMs).sort((a, b) => a - b);
}

/** `rhythm`: an edit preset's way of cutting (`edit-presets.ts`), instead of the Director's own. */
export function planReel(assets: readonly ReelAsset[], music: DirectorMusic | null, seed: number, durationMs: number, rhythm?: PresetRhythm): Segment[] {
  const playable = assets.map((asset, index) => ({ asset, index })).filter(({ asset }) => asset.kind === 'photo' || pieces(asset.shots).length > 0);
  if (!playable.length) return [];
  const next = random(seed);
  const { times } = rhythm ? presetCutTimes(music, rhythm, seed, durationMs) : cutTimes(music, seed, durationMs);

  const clips = shuffled(playable.filter(({ asset }) => asset.kind === 'clip').map(({ index }) => index), next);
  const photos = shuffled(playable.filter(({ asset }) => asset.kind === 'photo').map(({ index }) => index), next);
  const stills = clips.length ? stillCuts(times, durationMs, Math.min(REEL_STILLS, photos.length)) : null;
  const cursor = { clip: 0, photo: 0 };
  // Each clip's pieces, shuffled once, and how far through them the edit has played.
  const playlist = new Map<number, { pieces: Shot[]; used: number }>();
  for (const index of clips) {
    const asset = assets[index];
    if (asset.kind === 'clip') playlist.set(index, { pieces: shuffled(pieces(asset.shots), next), used: 0 });
  }

  const segments: Segment[] = [];
  let previous = -1;
  times.forEach((atMs, k) => {
    const endMs = times[k + 1] ?? durationMs;
    // Clips carry the reel, each in turn before any comes back; a still has its own few cuts (`stillCuts`), or every cut when there is no clip.
    const clip = stills ? !stills.has(k) : false;
    const pool = clip ? clips : photos;
    const kind = clip ? 'clip' : 'photo';
    let asset = pool[cursor[kind] % pool.length];
    cursor[kind] += 1;
    if (asset === previous && pool.length > 1) {
      asset = pool[cursor[kind] % pool.length];
      cursor[kind] += 1;
    }
    previous = asset;

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
      segments.push({ atMs, endMs, asset, startMs, pieceEndMs, fromMs: startMs, zoom: [1, 1], ...(rhythm?.ramp && driveBend(music?.drive).ramp ? { ramp: true } : {}) });
    } else {
      segments.push({ atMs, endMs, asset, startMs: 0, pieceEndMs: 0, fromMs: 0, zoom: k % 2 === 0 ? [1, 1.12] : [1.12, 1] });
    }
  });
  loopBack(segments);
  return segments;
}

/**
 * A seamless loop: the last cut plays the moments of the opening clip just before the opening starts (the opening moved later into its
 * piece to make room), so a feed that replays the video runs from its last frame straight into its first, with no seam to swipe on.
 * Left as it is where the opening is a still, its piece is too short, or the cut before the last already shows it.
 */
function loopBack(segments: Segment[]) {
  if (segments.length < 3) return;
  const open = segments[0];
  const end = segments[segments.length - 1];
  const lead = end.endMs - end.atMs;
  const openLength = (open.endMs - open.atMs) * (open.ramp ? RAMP_FAST : 1);
  if (open.pieceEndMs - open.startMs < lead + openLength || segments[segments.length - 2].asset === open.asset) return;
  open.fromMs = open.startMs + lead;
  segments[segments.length - 1] = { atMs: end.atMs, endMs: end.endMs, asset: open.asset, startMs: open.startMs, pieceEndMs: open.pieceEndMs, fromMs: open.startMs, zoom: [1, 1] };
}

/**
 * Which cuts (by index) are stills: one in each of `count` equal stretches of the song, the cut starting nearest its middle, never the
 * first cut or the last (it loops back into the first: `loopBack`) and never next to another still. A short edit with few cuts takes fewer.
 */
export function stillCuts(times: readonly number[], durationMs: number, count: number): Set<number> {
  const taken = new Set<number>();
  const wanted = Math.min(count, Math.floor((times.length - 2) / 2));
  for (let i = 0; i < wanted; i++) {
    const middle = ((i + 0.5) * durationMs) / wanted;
    let best = -1;
    for (let k = 1; k < times.length - 1; k++) {
      if (taken.has(k) || taken.has(k - 1) || taken.has(k + 1)) continue;
      if (best < 0 || Math.abs(times[k] - middle) < Math.abs(times[best] - middle)) best = k;
    }
    if (best > 0) taken.add(best);
  }
  return taken;
}

/** The segment playing at `ms` of the song. */
export function segmentAt(segments: readonly Segment[], ms: number): Segment {
  let found = segments[0];
  for (const segment of segments) if (segment.atMs <= ms) found = segment;
  return found;
}

/**
 * A velocity edit: the clip plays `RAMP_FAST` times as fast for the first `RAMP_IN_MS` of a cut, then at speed. Never slower than real time:
 * a 30 fps clip slowed down has too few frames, and the picture hangs before every cut.
 */
export const RAMP_FAST = 2.2;
const RAMP_IN_MS = 220;

/** How long a velocity-edited cut `lengthMs` long snaps in fast. A short cut keeps the same shape, scaled down. */
const rampHead = (lengthMs: number) => RAMP_IN_MS * Math.min(1, lengthMs * 0.25 / RAMP_IN_MS);

/** How much of its clip a velocity-edited cut `lengthMs` long has played `t` ms in. */
export function rampedMs(t: number, lengthMs: number): number {
  const head = rampHead(lengthMs);
  return t < head ? t * RAMP_FAST : head * RAMP_FAST + (t - head);
}

/** How fast a velocity-edited cut `lengthMs` long plays its clip `t` ms in (1 is real time): the speed `rampedMs` moves at. */
export function rampRate(t: number, lengthMs: number): number {
  return t < rampHead(lengthMs) ? RAMP_FAST : 1;
}

/** How fast a segment plays its clip at `ms` of the song, so a playing video can be run at that speed instead of being sought. */
export function clipRateAt(segment: Segment, ms: number): number {
  return segment.ramp ? rampRate(ms - segment.atMs, Math.max(1, segment.endMs - segment.atMs)) : 1;
}

/** Where in its clip a segment plays at `ms` of the song. A piece shorter than its cut loops. */
export function clipMsAt(segment: Segment, ms: number): number {
  const length = Math.max(1, segment.pieceEndMs - segment.startMs);
  const played = segment.ramp ? rampedMs(ms - segment.atMs, Math.max(1, segment.endMs - segment.atMs)) : ms - segment.atMs;
  return segment.startMs + ((segment.fromMs - segment.startMs + played) % length);
}
