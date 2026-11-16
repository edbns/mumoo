/**
 * Window — the rules of the look, as pure functions of the clock, the beat times and the lyric cues.
 * Nothing here draws: the flat screen colours and when they flip, which lyric words are on screen together, how big
 * they are set on one line so that it fits the safe area, and how hard a beat punches the window.
 * The shelf preview and the cloud render both read these, so they agree.
 */
import { HEIGHT, WIDTH, type LyricCue } from './composition';
import { META_SAFE_BOTTOM } from './ad-punch';
import type { AdFont } from './ad-fonts';

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
/** Words keep this far from the sides of the frame, in px. */
const SAFE_X = 54;
/** The highest a word's box may sit: clear of the top bar. */
const PLACE_TOP = Math.round(HEIGHT * 0.1);

// ---------------------------------------------------------------------------------------------------------------
// Screens

/**
 * A screen is one flat colour, black or white (and red for Silhouette): no texture, no fade. With it comes the rim cut round the window, and
 * the screen it could flip to on a downbeat (the shelf deals each card only its own, so it holds).
 */
export type WindowPalette = { id: string; screen: string; rim: string; flips: readonly string[] };

export const WINDOW_PALETTES: readonly WindowPalette[] = [
  { id: 'black', screen: '#0a0a0b', rim: '#3d3d45', flips: ['off-white'] },
  { id: 'off-white', screen: '#f1ede4', rim: '#9c9484', flips: ['black'] },
  { id: 'red', screen: '#e10600', rim: '#7a0300', flips: ['black'] },
];

/** Every palette id, for whoever stores or checks a card's screen colour. */
export const WINDOW_PALETTE_IDS: readonly string[] = WINDOW_PALETTES.map(palette => palette.id);

export function paletteOf(id: string): WindowPalette {
  const palette = WINDOW_PALETTES.find(candidate => candidate.id === id);
  if (!palette) throw new Error(`There is no window palette "${id}".`);
  return palette;
}

/**
 * The palette on show at `ms`: the card starts on `startId` and, on every downbeat, flips to one of that palette's
 * flip colours its seed picks, out of those in `allowed` (the palettes that read against the picture). A palette none
 * of whose flip colours is allowed holds its colour.
 */
export function screenAt(seed: number, startId: string, ms: number, downbeatsMs: readonly number[], allowed: readonly string[] = WINDOW_PALETTE_IDS): WindowPalette {
  if (!allowed.includes(startId)) throw new Error(`The window palette "${startId}" is not allowed on this card.`);
  let palette = paletteOf(startId);
  for (let bar = 0; bar < downbeatsMs.length && downbeatsMs[bar] <= ms; bar++) {
    const options = palette.flips.filter(flip => allowed.includes(flip));
    if (options.length) palette = paletteOf(options[hash(seed, bar, 0x58) % options.length]);
  }
  return palette;
}

/**
 * The faces the window is set in. A line is made as wide as the screen, so how tall its letters come out depends on
 * the face: these heavy, condensed ones give letters twice as tall as the wide heavy faces (a seven-letter word is
 * about 250 px tall in them, and about 130 px in Archivo Black or Dela Gothic One), which is what a giant word is.
 */
export const WINDOW_FACES: readonly AdFont[] = ['Anton', 'Big Shoulders Display', 'Staatliches', 'Bangers', 'Barlow Condensed'];

// ---------------------------------------------------------------------------------------------------------------
// Which words are in the window

/** At most this many cues share the window, and only while together they are no longer than `GROUP_LETTERS`: on one line, a longer pair would be set too thin to show the picture. */
export const GROUP_WORDS = 2;
export const GROUP_LETTERS = 6;
/** A pause between two cues longer than this closes the window until the next words. */
export const PHRASE_GAP_MS = 400;
/** The last words of a phrase stay this long after they are sung. */
export const HOLD_MS = 200;

export type WordGroup = { text: string; startMs: number; endMs: number };

/** Commas and full stops are not part of a giant word. */
const bare = (text: string) => text.trim().replace(/[,.;:]+$/u, '');

const lettersIn = (text: string) => [...text.replace(/\s/gu, '')].length;

/** The cues, dealt into the groups of words that are in the window together, in time order. */
export function wordGroups(cues: readonly LyricCue[]): WordGroup[] {
  const groups: (WordGroup & { cues: number })[] = [];
  for (const cue of cues) {
    const text = bare(cue.text);
    if (!text) continue;
    const last = groups.at(-1);
    const joins = last && last.cues < GROUP_WORDS && cue.startMs - last.endMs <= PHRASE_GAP_MS && lettersIn(last.text) + lettersIn(text) <= GROUP_LETTERS;
    if (last && joins) {
      last.text = `${last.text} ${text}`;
      last.endMs = cue.endMs;
      last.cues++;
    } else groups.push({ text, startMs: cue.startMs, endMs: cue.endMs, cues: 1 });
  }
  return groups.map(({ text, startMs, endMs }) => ({ text, startMs, endMs }));
}

/** The index of the group in the window at `ms`, or -1 when the window is closed (before the first words, or between phrases). */
export function groupAt(groups: readonly WordGroup[], ms: number): number {
  let at = -1;
  for (let i = 0; i < groups.length && groups[i].startMs <= ms; i++) at = i;
  if (at < 0) return -1;
  const next = groups[at + 1];
  return ms < groups[at].endMs + HOLD_MS || (next && next.startMs - groups[at].endMs <= PHRASE_GAP_MS) ? at : -1;
}

// ---------------------------------------------------------------------------------------------------------------
// How big the words are

/** How far the window swells on a downbeat. The words are fitted so that even at this size they stay inside the safe area. */
export const PUNCH_SWELL = 0.07;
/** The box the words fill, as the frame is first seen: inside the sides, and between the top bar and the platform's buttons. */
export const SAFE_BOX = { x: SAFE_X, y: PLACE_TOP, width: WIDTH - SAFE_X * 2, height: META_SAFE_BOTTOM - PLACE_TOP } as const;
/** The box the words are fitted to at rest: the safe box less the room the punch swells into. */
export const REST_BOX = { width: SAFE_BOX.width / (1 + PUNCH_SWELL), height: SAFE_BOX.height / (1 + PUNCH_SWELL) } as const;

/** The size of a line's ink, in px, when it is set at a size of 100 px. */
export type Measure = (text: string) => { width: number; height: number };

export type WindowLine = {
  text: string;
  /** Font size in px. */
  size: number;
  /** The ink's size and where its top left corner sits in the block, in px. */
  width: number;
  height: number;
  x: number;
  y: number;
};
export type WindowLayout = { lines: WindowLine[]; width: number; height: number };

/**
 * How `text` is set: on one horizontal line, never broken, as wide as the box allows, shrunk only if that would be
 * taller than the box.
 */
export function layoutWords(text: string, measure: Measure, box: { width: number; height: number } = REST_BOX): WindowLayout {
  const line = text.split(/\s+/u).filter(Boolean).join(' ');
  if (!line) throw new Error('A window needs a word to open on.');
  const ink = measure(line);
  const size = Math.min((box.width * 100) / ink.width, (box.height * 100) / ink.height);
  const width = (ink.width * size) / 100;
  const height = (ink.height * size) / 100;
  return { lines: [{ text: line, size, width, height, x: 0, y: 0 }], width, height };
}

/** The window's words reach this close to the sides of the frame: bigger than other lyrics, so more of the picture shows through them. */
const WINDOW_SIDE = 24;
/** A line laid across the frame, and one turned to run up it (reading bottom to top); the punch's swell is left free in both. */
export const ACROSS_BOX = { width: (WIDTH - WINDOW_SIDE * 2) / (1 + PUNCH_SWELL), height: SAFE_BOX.height / (1 + PUNCH_SWELL) } as const;
export const UP_BOX = { width: SAFE_BOX.height / (1 + PUNCH_SWELL), height: (WIDTH - WINDOW_SIDE * 2) / (1 + PUNCH_SWELL) } as const;

/** Whether the words of group `group` run up the frame instead of across it: the card's words take turns, the seed saying which way it starts. */
export const turnedAt = (seed: number, group: number) => ((seed + group) & 1) === 1;

/** How a group of words is set in the window: one line, across the frame or turned up it (its width then runs along the frame's height). */
export const layoutWindow = (text: string, measure: Measure, turned: boolean): WindowLayout => layoutWords(text, measure, turned ? UP_BOX : ACROSS_BOX);

/** Where the middle of the words sits in the frame: the middle of the safe box. */
export const WORD_CENTRE: readonly [number, number] = [WIDTH / 2, SAFE_BOX.y + SAFE_BOX.height / 2];

// ---------------------------------------------------------------------------------------------------------------
// The beat

/** A beat is a downbeat (the first of its bar) when one of the bar times falls within a few ms of it. */
const isDownbeat = (beatMs: number, downbeatsMs: readonly number[]) => downbeatsMs.some(d => Math.abs(d - beatMs) < 45);

/** How hard a plain beat punches against a downbeat, and how fast the punch dies away (per second). */
const PLAIN_PUNCH = 0.55;
const PUNCH_DECAY = 13;

/** 0–1 punch of the latest beat at or before `ms`: it lands at once and dies away. */
export function punchAt(ms: number, beatsMs: readonly number[], downbeatsMs: readonly number[]): number {
  let at = -1;
  for (let i = 0; i < beatsMs.length && beatsMs[i] <= ms; i++) at = i;
  if (at < 0) return 0;
  return (isDownbeat(beatsMs[at], downbeatsMs) ? 1 : PLAIN_PUNCH) * Math.exp((-(ms - beatsMs[at]) / 1000) * PUNCH_DECAY);
}

/** New words land small and spring to size: how much smaller than rest they start, and how fast they settle (ms). */
const POP_FROM = 0.13;
const POP_MS = 70;

/** The size of the words against rest: swollen by the punch, and for a moment after new words arrive, shrunk. */
export const windowScale = (punch: number, sinceArrivedMs: number) => (1 + PUNCH_SWELL * punch) * (1 - POP_FROM * Math.exp(-Math.max(0, sinceArrivedMs) / POP_MS));

/** How far the picture pushes in on a punch, and how far it creeps in over a second. */
const PUSH = 0.05;
const CREEP_PER_SECOND = 0.004;

/** The picture's size against the frame that covers it: it creeps in slowly and the punch pushes it in further. */
export const pictureScale = (ms: number, punch: number) => 1 + CREEP_PER_SECOND * (ms / 1000) + PUSH * punch;

/** The picture, fitted to cover the whole frame, as its size in px. */
export function coverSize(width: number, height: number): [number, number] {
  const cover = Math.max(WIDTH / width, HEIGHT / height);
  return [width * cover, height * cover];
}
