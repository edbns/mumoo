/**
 * Spray — the rules of the look, as pure functions of a seed, the clock, the beat times and the lyric cues.
 * Nothing here draws: the walls and paints, where each lyric word is sprayed, which words are on the wall, how
 * hard the newest one is hit by a beat, when a word gets a drip, a splatter, a mark around it or a scribble over it.
 * The shelf preview and the cloud render both read these, so they agree.
 */
import { HEIGHT, WIDTH, type LyricCue } from './composition';
import { META_SAFE_BOTTOM } from './ad-punch';

// ---------------------------------------------------------------------------------------------------------------
// Chance

/** An integer hash of three numbers: the single source of every random choice in this look. */
export function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(c | 0, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** A random number in [0, 1) that depends only on (seed, a, b). */
export const unit = (seed: number, a: number, b: number) => hash(seed, a, b) / 4294967296;

/** A small deterministic generator: the same seed always gives the same sequence. */
export function generator(seed: number) {
  let index = 0;
  return () => unit(seed, index++, 0x51);
}

// ---------------------------------------------------------------------------------------------------------------
// Walls and paints

/** A wall is a clean, smooth ground (a very soft fade from `ground[0]` at the top to `ground[1]` at the bottom) and the paints sprayed on it. */
export type SprayPalette = { id: string; name: string; ground: readonly [string, string]; sprays: readonly string[] };

export const SPRAY_PALETTES: readonly SprayPalette[] = [
  { id: 'neon-night', name: 'neon on night', ground: ['#0c0b14', '#08080e'], sprays: ['#ff2e93', '#b8ff00', '#00e5ff'] },
  { id: 'neon-plum', name: 'neon on plum', ground: ['#2a1238', '#1a0b26'], sprays: ['#ff7a1a', '#ff3db8', '#d4ff3a'] },
  { id: 'neon-navy', name: 'neon on navy', ground: ['#0e1d45', '#081230'], sprays: ['#19e3ff', '#ff8a1f', '#ff2d7a'] },
  { id: 'bold-offwhite', name: 'bold on off-white', ground: ['#f4f0e8', '#eae4d8'], sprays: ['#e4151f', '#101010', '#1f43ff'] },
  { id: 'bold-grey', name: 'bold on warm grey', ground: ['#d4cec4', '#c2bbaf'], sprays: ['#121212', '#b81d00', '#1237ff'] },
  { id: 'bold-pastel', name: 'bold on pastel', ground: ['#f3d4de', '#ebc3d3'], sprays: ['#1a35ff', '#d3131c', '#121212'] },
];

/** The wall a card was dealt, by its id. An id that is not one of ours is an error, not a stand-in. */
export function sprayPaletteById(id: string): SprayPalette {
  const found = SPRAY_PALETTES.find(palette => palette.id === id);
  if (!found) throw new Error(`Spray has no wall called "${id}".`);
  return found;
}

// ---------------------------------------------------------------------------------------------------------------
// Where words are sprayed

/** The widest and the tallest a lyric word is set: the rest of the frame is for the mess around it. */
export const FONT_SIZE_MAX = 340;
/** Words keep this far from the sides of the frame, in px. */
export const SAFE_X = 54;
/** Highest and lowest a word's box may sit: clear of the top bar, and above the platform's buttons and caption with room for a mark below. */
export const PLACE_TOP = Math.round(HEIGHT * 0.1);
export const PLACE_BOTTOM = META_SAFE_BOTTOM - 200;

export type WordPlace = {
  /** Where along the room the word may sit, 0–1 on each axis. */
  u: number;
  v: number;
  /** Radians, within ±20°. */
  rotation: number;
  /** How much of the room's width the word is set to, 0–1. */
  fit: number;
  /** Which of the wall's paints sprays it. */
  ink: number;
};

/** The two steps of the R2 sequence: points that walk the unit square without ever bunching, however many there are. */
const R2 = [0.7548776662, 0.5698402910] as const;

/**
 * Which paint sprays word `index`: each word takes a different paint from the one before it, so a word sprayed over
 * another stays readable.
 */
export function inkOf(seed: number, index: number, inkCount: number): number {
  let ink = hash(seed, 0x77, 0) % inkCount;
  for (let i = 1; i <= index; i++) ink = (ink + 1 + (hash(seed, i, 0x75) % (inkCount - 1))) % inkCount;
  return ink;
}

/**
 * Where lyric word number `index` is sprayed. A pure function of the seed and the index, so frames are reproducible.
 * Words walk the room along an R2 sequence, so a run of them spreads over the wall instead of piling in one spot.
 */
export function placeWord(seed: number, index: number, inkCount: number): WordPlace {
  const walk = (axis: 0 | 1) => (unit(seed, 0, 0x70 + axis) + (index + 1) * R2[axis] + (unit(seed, index, 0x71 + axis * 5) - 0.5) * 0.1) % 1;
  return {
    u: walk(0),
    v: walk(1),
    rotation: ((unit(seed, index, 0x73) * 2 - 1) * 20 * Math.PI) / 180,
    fit: 0.52 + 0.24 * unit(seed, index, 0x74),
    ink: inkOf(seed, index, inkCount),
  };
}

/** The width a word is set to, in px. */
export const wordWidth = (place: Pick<WordPlace, 'fit'>) => (WIDTH - SAFE_X * 2) * place.fit;

/** The centre of a word of this size: far enough inside the frame that all of it is seen, and low enough that its mark fits below. */
export function wordCentre(place: Pick<WordPlace, 'u' | 'v' | 'rotation'>, width: number, height: number): [number, number] {
  const cos = Math.abs(Math.cos(place.rotation));
  const sin = Math.abs(Math.sin(place.rotation));
  const reachX = (width * cos + height * sin) / 2;
  const reachY = (width * sin + height * cos) / 2;
  const room = (low: number, high: number, at: number) => (high - low < 0 ? (low + high) / 2 : low + (high - low) * at);
  return [room(SAFE_X + reachX, WIDTH - SAFE_X - reachX, place.u), room(PLACE_TOP + reachY, PLACE_BOTTOM - reachY, place.v)];
}

// ---------------------------------------------------------------------------------------------------------------
// The wall: which words are on it

/** Most words on the wall at once; the one beyond them is already faded out. */
export const MAX_WORDS = 10;
/** A pause between two cues longer than this ends a phrase: the wall is wiped. */
export const PHRASE_GAP_MS = 400;
/** The last word of a phrase stays this long after it is sung before the wipe starts. */
export const PHRASE_HOLD_MS = 180;
/** The wall is also wiped every this many bars. */
export const PAGE_BARS = 4;
/** How long the wipe takes. */
export const WIPE_MS = 240;
/** How long an older word takes to settle back when a newer one is sprayed. */
export const RANK_EASE_MS = 140;

/** The set of times at which the wall is wiped: after each phrase, and every `PAGE_BARS` bars. */
export function pageBreaks(cues: readonly Pick<LyricCue, 'startMs' | 'endMs'>[], downbeatsMs: readonly number[]): number[] {
  const breaks: number[] = [];
  for (let i = 0; i + 1 < cues.length; i++) {
    if (cues[i + 1].startMs - cues[i].endMs > PHRASE_GAP_MS) breaks.push(cues[i].endMs + PHRASE_HOLD_MS);
  }
  for (let bar = PAGE_BARS; bar < downbeatsMs.length; bar += PAGE_BARS) breaks.push(downbeatsMs[bar]);
  return [...new Set(breaks)].sort((a, b) => a - b);
}

export type SprayPage = {
  /** Cue indices on the wall, oldest first, the newest last. */
  words: number[];
  /** The wall that was just wiped, while the wipe is still sweeping over it. */
  wiping: { words: number[]; progress: number } | null;
};

/** The words on the wall at `ms`: those sung since the last wipe, the newest `MAX_WORDS` and the one fading beyond them. */
export function pageAt(cues: readonly Pick<LyricCue, 'startMs'>[], breaks: readonly number[], ms: number): SprayPage {
  let last = -1;
  while (last + 1 < breaks.length && breaks[last + 1] <= ms) last++;
  const start = last >= 0 ? breaks[last] : -Infinity;
  const since = (from: number, to: number) => {
    const found: number[] = [];
    for (let i = 0; i < cues.length && cues[i].startMs <= to; i++) if (cues[i].startMs >= from && cues[i].startMs < to) found.push(i);
    return found.slice(-(MAX_WORDS + 1));
  };
  const progress = (ms - start) / WIPE_MS;
  const wiping = last >= 0 && progress < 1 ? { words: since(last > 0 ? breaks[last - 1] : -Infinity, start), progress } : null;
  return { words: since(start, ms + 1), wiping };
}

/**
 * How far back each word of the wall is: 0 for the newest, 1 for the one before it, and so on. A word slides from
 * one rank to the next over `RANK_EASE_MS` when a newer word is sprayed, so nothing jumps.
 */
export function wordRanks(cues: readonly Pick<LyricCue, 'startMs'>[], words: readonly number[], ms: number): number[] {
  const newest = words.length - 1;
  const t = Math.min(1, Math.max(0, (ms - cues[words[newest]].startMs) / RANK_EASE_MS));
  const arrived = t * t * (3 - 2 * t);
  return words.map((_, k) => newest - k - (k < newest ? 1 - arrived : 0));
}

/** How much paint a word at this rank still shows: the newest is solid, older ones thin out to a ghost, the last fades away. */
export const wordAlpha = (rank: number) => (rank <= 0 ? 1 : 0.55 * 0.8 ** (rank - 1)) * Math.min(1, Math.max(0, MAX_WORDS - rank));

/** The size of a word at this rank, against the size it was sprayed at: older words recede. */
export const wordScale = (rank: number) => 0.5 + 0.5 * 0.5 ** Math.max(0, rank);

/** How far the wipe has swept, as the position along the frame's diagonal (y + 0.3·x) it has reached. Paint beyond it is gone. */
export const WIPE_BAND = 220;
export const wipeEdge = (progress: number) => -WIPE_BAND + progress * (HEIGHT + WIDTH * 0.3 + WIPE_BAND * 2);

// ---------------------------------------------------------------------------------------------------------------
// The beat

/** A beat is a downbeat (the first of its bar) when one of the bar times falls within a few ms of it. */
const isDownbeat = (beatMs: number, downbeatsMs: readonly number[]) => downbeatsMs.some(d => Math.abs(d - beatMs) < 45);

export type BeatHit = { age: number; strength: number };

/** The latest beat at or before `ms`: how long ago it fell (seconds) and how hard it hits. */
export function hitAt(ms: number, beatsMs: readonly number[], downbeatsMs: readonly number[]): BeatHit | null {
  let at = -1;
  for (let i = 0; i < beatsMs.length && beatsMs[i] <= ms; i++) at = i;
  if (at < 0) return null;
  return { age: (ms - beatsMs[at]) / 1000, strength: isDownbeat(beatsMs[at], downbeatsMs) ? 1 : 0.35 };
}

/** 0–1 hit of the latest beat on the newest word: the paint lands hard, then the hit dies away. */
export const hitKick = (hit: BeatHit | null) => (hit ? hit.strength * Math.exp(-hit.age * 14) : 0);

// ---------------------------------------------------------------------------------------------------------------
// Drips

/** How long a drip runs before it stops, in ms. */
export const DRIP_MS = 620;
/** 0–1 of a drip's final length at `ageMs` after it starts: it runs fast, slows and stops for good. */
export const dripReach = (ageMs: number) => {
  const t = Math.min(1, Math.max(0, ageMs / DRIP_MS));
  return 1 - (1 - t) ** 3;
};

// ---------------------------------------------------------------------------------------------------------------
// What happens to a word

export type SprayMark = 'underline' | 'circle' | 'arrow';
export type SprayScribble = 'cross' | 'zigzag';

/** Everything that happens to one lyric word over the clip, in ms after the word is first sprayed. */
export type WordPlan = {
  /** Seed of the word's own grains. */
  seed: number;
  /** Which paint sprays the word, and which one its mark and scribble are sprayed in. */
  ink: number;
  accent: number;
  /** How long the nozzle takes to sweep the word. */
  sweepMs: number;
  /** Plain beats while the word is the newest: a puff of speckle each. */
  puffsMs: readonly number[];
  /** Downbeats while the word is the newest: a splatter each. */
  splatsMs: readonly number[];
  /** Downbeats at which the word runs: how many drips each. The newest runs most, the two before it a little. */
  drips: readonly { atMs: number; count: number }[];
  /** A mark sprayed round the word once it is on. */
  mark: SprayMark | null;
  /** A scribble over the word once three newer words have come after it. */
  scribble: { kind: SprayScribble; atMs: number } | null;
};

/** The nozzle takes this long to sweep a word, and the longest a word stays the newest for beats and splatters. */
export const SWEEP_MS = [250, 400] as const;
const NEWEST_MAX_MS = 2400;
const DRIP_WINDOW_MS = 3000;
/** A word shorter than this is not given a mark. */
const MARK_MIN_LETTERS = 3;

/** What happens to cue `index`: a pure function of the seed, the cues and the beat times. */
export function planWord(seed: number, index: number, cues: readonly LyricCue[], beatsMs: readonly number[], downbeatsMs: readonly number[], inkCount: number): WordPlan {
  const cue = cues[index];
  const own = hash(seed, index, 0x60);
  const rnd = (n: number) => unit(own, n, 0x61);
  const sweepMs = Math.round(SWEEP_MS[0] + (SWEEP_MS[1] - SWEEP_MS[0]) * rnd(0));
  const ink = inkOf(seed, index, inkCount);
  const accent = (ink + 1 + Math.floor(rnd(1) * (inkCount - 1))) % inkCount;
  const end = Math.min(cue.startMs + NEWEST_MAX_MS, cues[index + 1]?.startMs ?? Infinity);
  const after = (times: readonly number[], from: number, to: number) => times.filter(t => t >= from && t < to).map(t => t - cue.startMs);

  // A downbeat makes the word run if it is the newest, or one of the two before it.
  const drips = downbeatsMs
    .filter(d => d >= cue.startMs && d < cue.startMs + DRIP_WINDOW_MS)
    .flatMap((d, at) => {
      const newer = cues.slice(index + 1).filter(next => next.startMs <= d).length;
      return newer <= 2 ? [{ atMs: d - cue.startMs, count: newer === 0 ? 3 : 1 + Math.floor(rnd(10 + at) * 2) }] : [];
    });

  const downbeatNear = downbeatsMs.some(d => d - cue.startMs > -60 && d - cue.startMs < 160);
  const keyWord = [...cue.text].length >= MARK_MIN_LETTERS && (downbeatNear || cue.endMs - cue.startMs >= 380);
  const marked = keyWord && rnd(2) < 0.6;
  const mark: SprayMark[] = ['underline', 'circle', 'arrow'];
  const crossedOut = !marked && index + 3 < cues.length && rnd(3) < 0.26;

  return {
    seed: own,
    ink,
    accent,
    sweepMs,
    puffsMs: after(beatsMs.filter(beat => !isDownbeat(beat, downbeatsMs)), cue.startMs, end),
    splatsMs: after(downbeatsMs, cue.startMs, end),
    drips,
    mark: marked ? mark[Math.floor(rnd(4) * mark.length)] : null,
    scribble: crossedOut ? { kind: rnd(5) < 0.5 ? 'cross' : 'zigzag', atMs: cues[index + 3].startMs - cue.startMs } : null,
  };
}
