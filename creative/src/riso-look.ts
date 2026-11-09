/**
 * Riso — the rules of the look, as pure functions of a seed, the clock and the beat times.
 * Nothing here draws: the colours of the inks, where each lyric word is stamped, which words are on the page,
 * how the ink layers slip on a beat. The shelf preview and the cloud render both read these, so they agree.
 */
import { HEIGHT, WIDTH } from './composition';

/** The paper every print is made on. */
export const RISO_PAPER = '#efe6d2';

/** Two fluorescent inks (a third is optional). The person uses the first two; the lyric words use all of them. */
export type RisoInkSet = { id: string; name: string; inks: readonly [string, string] | readonly [string, string, string] };

export const RISO_INK_SETS: readonly RisoInkSet[] = [
  { id: 'pink-blue', name: 'pink + blue', inks: ['#ff48b0', '#0078bf'] },
  { id: 'orange-teal', name: 'orange + teal', inks: ['#ff6c2f', '#00a99d'] },
  { id: 'violet-coral', name: 'violet + coral', inks: ['#7a4fe0', '#ff5a47'] },
  { id: 'red-green', name: 'red + green', inks: ['#ff3b30', '#00a95c'] },
];

/** The ink set a card was dealt, by its id. An id that is not one of ours is an error, not a stand-in. */
export function risoInkSetById(id: string): RisoInkSet {
  const found = RISO_INK_SETS.find(set => set.id === id);
  if (!found) throw new Error(`Riso has no ink set called "${id}".`);
  return found;
}

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

/** A small deterministic generator for building textures: the same seed always gives the same sequence. */
export function generator(seed: number) {
  let index = 0;
  return () => unit(seed, index++, 0x51);
}

// ---------------------------------------------------------------------------------------------------------------
// Lyric words

/** Most words on the page at once. */
export const MAX_WORDS = 14;
/** A pause between two cues longer than this ends a phrase: the page is wiped clean. */
export const PHRASE_GAP_MS = 400;
/** The page is also wiped every this many bars. */
export const PAGE_BARS = 4;
/** How long the wipe takes. */
export const WIPE_MS = 200;

export const WORD_SIZE_MIN = 140;
export const WORD_SIZE_MAX = 460;
/** The widest a word is set; one wider than the frame is simply cropped by its edge. */
export const WORD_WIDTH_MAX = 1500;

export type WordPlace = {
  /** Where along the room the word may sit, 0–1 on each axis (the world keeps enough of the word inside the frame). */
  u: number;
  v: number;
  /** Radians, within ±25°. */
  rotation: number;
  /** Font size in px, before it is shortened to the width limit. */
  size: number;
  /** Which of the set's inks stamps it. */
  ink: number;
};

const GOLDEN = 0.6180339887;

/**
 * Where lyric word number `index` is stamped. A pure function of the seed and the index, so frames are reproducible.
 * Heights walk the frame by the golden ratio, so any run of words spreads from top to bottom instead of clumping.
 */
export function placeWord(seed: number, index: number, inkCount: number): WordPlace {
  const phase = unit(seed, 0, 0x70);
  const jitter = (unit(seed, index, 0x71) - 0.5) * 0.12;
  return {
    u: unit(seed, index, 0x72),
    v: Math.min(1, Math.max(0, (phase + index * GOLDEN + jitter) % 1)),
    rotation: ((unit(seed, index, 0x73) * 2 - 1) * 25 * Math.PI) / 180,
    size: WORD_SIZE_MIN + (WORD_SIZE_MAX - WORD_SIZE_MIN) * unit(seed, index, 0x74) ** 1.0,
    ink: hash(seed, index, 0x75) % inkCount,
  };
}

/** How much ink a word keeps: the newest is solid, older ones thin out to a faint screen of dots. */
export const wordDensity = (rank: number) => (rank <= 0 ? 1 : 0.8 * 0.91 ** (rank - 1));

/** The set of times at which the page is wiped: after each phrase, and every `PAGE_BARS` bars. */
export function pageBreaks(cues: readonly { startMs: number; endMs: number }[], downbeatsMs: readonly number[]): number[] {
  const breaks: number[] = [];
  for (let i = 0; i + 1 < cues.length; i++) {
    if (cues[i + 1].startMs - cues[i].endMs > PHRASE_GAP_MS) breaks.push(cues[i].endMs);
  }
  for (let bar = PAGE_BARS; bar < downbeatsMs.length; bar += PAGE_BARS) breaks.push(downbeatsMs[bar]);
  return [...new Set(breaks)].sort((a, b) => a - b);
}

export type RisoPage = {
  /** Cue indices on the page, oldest first, the newest last. */
  words: number[];
  /** The page that was just wiped, while the wipe is still sweeping over it. */
  wiping: { words: number[]; progress: number } | null;
};

/** The words of the page at `ms`: those sung since the last wipe, at most `MAX_WORDS`. */
export function pageAt(cues: readonly { startMs: number }[], breaks: readonly number[], ms: number): RisoPage {
  let last = -1;
  while (last + 1 < breaks.length && breaks[last + 1] <= ms) last++;
  const start = last >= 0 ? breaks[last] : -Infinity;
  const since = (from: number, to: number) => {
    const found: number[] = [];
    for (let i = 0; i < cues.length && cues[i].startMs <= to; i++) if (cues[i].startMs >= from && cues[i].startMs < to) found.push(i);
    return found.slice(-MAX_WORDS);
  };
  const current = since(start, ms + 1);
  const progress = (ms - start) / WIPE_MS;
  const wiping = last >= 0 && progress < 1 ? { words: since(last > 0 ? breaks[last - 1] : -Infinity, start), progress } : null;
  return { words: current, wiping };
}

// ---------------------------------------------------------------------------------------------------------------
// The beat

type BeatHit = { age: number; strength: number; index: number };

/** The beats at or before `ms`, newest first: how long ago each was (seconds) and how hard it hits. */
function recentBeats(ms: number, beatsMs: readonly number[], downbeatsMs: readonly number[], count: number): BeatHit[] {
  let last = -1;
  for (let i = 0; i < beatsMs.length && beatsMs[i] <= ms; i++) last = i;
  const hits: BeatHit[] = [];
  for (let k = 0; k < count && last - k >= 0; k++) {
    const at = beatsMs[last - k];
    hits.push({ age: (ms - at) / 1000, strength: downbeatsMs.some(d => Math.abs(d - at) < 45) ? 1 : 0.25, index: last - k });
  }
  return hits;
}

/** Each ink sits a few px off from the others at rest; the offsets are the slip of a press that is not quite true. */
const REST: readonly (readonly [number, number])[] = [[-2.5, 1.5], [3.5, -2.5], [1, 4]];

/** How far (px) and which way ink layer `ink` is shifted at `ms`: its rest offset, a slow drift, and the kick of the latest beats. */
export function misregistration(seed: number, ink: number, ms: number, beatsMs: readonly number[], downbeatsMs: readonly number[]): [number, number] {
  let x = REST[ink][0] + Math.sin(ms / 1700 + ink * 2.1) * 1.2;
  let y = REST[ink][1] + Math.cos(ms / 2300 + ink * 1.3) * 1.2;
  for (const { age, strength, index } of recentBeats(ms, beatsMs, downbeatsMs, 2)) {
    const angle = unit(seed, index, 0x80 + ink) * Math.PI * 2;
    // A downbeat throws the layers far; an ordinary beat only nudges them. Then they settle back.
    const reach = (3 + 18 * strength ** 2) * Math.exp(-age * 7);
    x += Math.cos(angle) * reach;
    y += Math.sin(angle) * reach;
  }
  return [x, y];
}

/** 0–1 swell of the halftone dots on the latest beat: the cells breathe, a downbeat harder. */
export function breath(ms: number, beatsMs: readonly number[], downbeatsMs: readonly number[]): number {
  const [hit] = recentBeats(ms, beatsMs, downbeatsMs, 1);
  return hit ? hit.strength * Math.exp(-hit.age * 8) : 0;
}

/**
 * The size of a word that is stamped down: it lands a little too big, squeezes, and settles.
 * `age` is seconds since the stamp; `weight` is how hard (the newest word on a downbeat is hardest).
 */
export const stampScale = (age: number, weight: number) => 1 + weight * Math.exp(-age * 11) * Math.cos(age * 24);

/** When the latest downbeat at or before `ms` fell, or -Infinity. */
export function lastDownbeat(ms: number, downbeatsMs: readonly number[]): number {
  let at = -Infinity;
  for (const d of downbeatsMs) if (d <= ms) at = d;
  return at;
}

/** Keeps the centre of a word of this width and height far enough inside the frame that most of it can be read. */
export function wordCentre(place: Pick<WordPlace, 'u' | 'v'>, width: number, height: number): [number, number] {
  const x = width * 0.15 + (WIDTH - width * 0.3) * place.u;
  const y = height * 0.25 + (HEIGHT - height * 0.5) * place.v;
  return [x, y];
}
