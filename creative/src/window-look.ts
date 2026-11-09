/**
 * Window — the rules of the look, as pure functions of the clock, the beat times and the lyric cues.
 * Nothing here draws: the flat screen colours and when they flip, which lyric words are on screen together, how big
 * they are set so that all of them fits the safe area, and how hard a beat punches the window.
 * The shelf preview and the cloud render both read these, so they agree.
 */
import { HEIGHT, WIDTH, type LyricCue } from './composition';
import { META_SAFE_BOTTOM } from './ad-punch';
import { PLACE_TOP, SAFE_X, hash } from './spray-look';

// ---------------------------------------------------------------------------------------------------------------
// Screens

/** A screen is one bold, flat colour: no texture, no fade. */
export type WindowScreen = { name: string; hex: string };

export const WINDOW_SCREENS: readonly WindowScreen[] = [
  { name: 'black', hex: '#0a0a0b' },
  { name: 'off-white', hex: '#f1ede4' },
  { name: 'hot red', hex: '#ff2418' },
  { name: 'cobalt', hex: '#1f3cff' },
  { name: 'acid yellow', hex: '#d8ff00' },
  { name: 'deep green', hex: '#0a5c3a' },
];

/**
 * The screen at `ms`: it starts on a colour its seed picks from `screens` and flips to another one on every downbeat.
 * One colour never flips.
 */
export function screenAt(seed: number, screens: readonly WindowScreen[], ms: number, downbeatsMs: readonly number[]): WindowScreen {
  if (!screens.length) throw new Error('A window needs a screen colour.');
  let at = hash(seed, 0x57, 1) % screens.length;
  if (screens.length < 2) return screens[at];
  for (let bar = 0; bar < downbeatsMs.length && downbeatsMs[bar] <= ms; bar++) at = (at + 1 + (hash(seed, bar, 0x58) % (screens.length - 1))) % screens.length;
  return screens[at];
}

// ---------------------------------------------------------------------------------------------------------------
// Which words are in the window

/** At most this many cues share the window, and only while together they are no longer than `GROUP_LETTERS`. */
export const GROUP_WORDS = 2;
export const GROUP_LETTERS = 9;
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
/** The gap between stacked lines, as a share of the shortest line. */
const LINE_GAP = 0.1;
const MAX_LINES = 3;
/** Another line is only worth it when it lets the type be this much bigger: fewer lines read better. */
const WORTH_A_LINE = 1.15;

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

/** Every way to break `words` into `count` runs of neighbours. */
function breaks(words: readonly string[], count: number): string[][] {
  if (count === 1) return [[words.join(' ')]];
  const found: string[][] = [];
  for (let cut = 1; cut <= words.length - (count - 1); cut++) {
    const first = words.slice(0, cut).join(' ');
    for (const rest of breaks(words.slice(cut), count - 1)) found.push([first, ...rest]);
  }
  return found;
}

/** One way of stacking the lines: each one is set as wide as the box, and the stack is shrunk to fit if it is too tall. */
function stack(lines: readonly string[], measure: Measure, box: { width: number; height: number }): WindowLayout {
  const inks = lines.map(measure);
  const sizes = inks.map(({ width }) => (box.width * 100) / width);
  const heights = inks.map(({ height }, i) => (height * sizes[i]) / 100);
  const gap = LINE_GAP * Math.min(...heights);
  const tall = heights.reduce((sum, h) => sum + h, 0) + gap * (lines.length - 1);
  const shrink = Math.min(1, box.height / tall);
  const placed: WindowLine[] = [];
  let y = 0;
  lines.forEach((text, i) => {
    const width = (inks[i].width * sizes[i] * shrink) / 100;
    const height = heights[i] * shrink;
    placed.push({ text, size: sizes[i] * shrink, width, height, x: 0, y });
    y += height + gap * shrink;
  });
  const widest = Math.max(...placed.map(line => line.width));
  for (const line of placed) line.x = (widest - line.width) / 2;
  return { lines: placed, width: widest, height: y - gap * shrink };
}

/**
 * How `text` is set: broken into one to three stacked lines in whichever way gives the biggest type, each line as
 * wide as the box allows. A word is never split.
 */
export function layoutWords(text: string, measure: Measure, box: { width: number; height: number } = REST_BOX): WindowLayout {
  const words = text.split(/\s+/u).filter(Boolean);
  let best: WindowLayout | null = null;
  let bestSize = 0;
  for (let count = 1; count <= Math.min(MAX_LINES, words.length); count++) {
    for (const lines of breaks(words, count)) {
      const layout = stack(lines, measure, box);
      const smallest = Math.min(...layout.lines.map(line => line.size));
      if (smallest > bestSize * WORTH_A_LINE) {
        best = layout;
        bestSize = smallest;
      }
    }
  }
  if (!best) throw new Error('A window needs a word to open on.');
  return best;
}

/** Where the middle of the words sits in the frame when nobody stands in front: the middle of the safe box. */
export const WORD_CENTRE: readonly [number, number] = [WIDTH / 2, SAFE_BOX.y + SAFE_BOX.height / 2];

/** With a person standing in front, her head is brought down to this far from the top of the frame, to leave room for the words above it. */
const PERSON_HEAD_AT = Math.round(HEIGHT * 0.3);
/** How far the head reaches up in front of the words' lower edge, in px. */
const HEAD_OVERLAP = 200;

/**
 * The stage when a person stands in front of the words, like the title of a magazine cover: the person is moved down
 * until her head is `PERSON_HEAD_AT` from the top (or left where she is, if she is lower already), and the words
 * take the room above her, their lower edge tucked behind her head.
 */
export function personStage(headTop: number): { drop: number; box: { width: number; height: number }; centre: readonly [number, number] } {
  const drop = Math.max(0, PERSON_HEAD_AT - headTop);
  const bottom = Math.min(SAFE_BOX.y + SAFE_BOX.height, headTop + drop + HEAD_OVERLAP);
  const height = bottom - SAFE_BOX.y;
  return { drop, box: { width: REST_BOX.width, height: height / (1 + PUNCH_SWELL) }, centre: [WIDTH / 2, SAFE_BOX.y + height / 2] };
}

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

/** With a person standing in front, the picture behind is shown this much bigger, about the middle of the frame: letters full of cloth and skin, not the wall she was photographed against, and not her face a second time. */
export const BEHIND_ZOOM = 1.7;

/** The picture's size against the frame that covers it: it creeps in slowly and the punch pushes it in further. */
export const pictureScale = (ms: number, punch: number, personInFront: boolean) => (personInFront ? BEHIND_ZOOM : 1) * (1 + CREEP_PER_SECOND * (ms / 1000) + PUSH * punch);

/** The picture, fitted to cover the whole frame, as its size in px. */
export function coverSize(width: number, height: number): [number, number] {
  const cover = Math.max(WIDTH / width, HEIGHT / height);
  return [width * cover, height * cover];
}
