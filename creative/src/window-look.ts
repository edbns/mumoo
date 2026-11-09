/**
 * Window — the rules of the look, as pure functions of the clock, the beat times and the lyric cues.
 * Nothing here draws: the flat screen colours and when they flip, which lyric words are on screen together, how big
 * they are set so that all of them fits the safe area, and how hard a beat punches the window.
 * The shelf preview and the cloud render both read these, so they agree.
 */
import { HEIGHT, WIDTH, type LyricCue } from './composition';
import { META_SAFE_BOTTOM } from './ad-punch';
import type { AdFont } from './ad-fonts';
import { luminance } from './dust-colors';
import { PLACE_TOP, SAFE_X, hash } from './spray-look';

// ---------------------------------------------------------------------------------------------------------------
// Screens

/**
 * A screen is one bold, flat colour: no texture, no fade. With it comes the rim cut round the window, and the
 * screens it flips to on a downbeat: ids of other palettes, each one a strong contrast to this one.
 */
export type WindowPalette = { id: string; screen: string; rim: string; flips: readonly [string, string, string] };

export const WINDOW_PALETTES: readonly WindowPalette[] = [
  { id: 'black', screen: '#0a0a0b', rim: '#3d3d45', flips: ['off-white', 'orange', 'acid-yellow'] },
  { id: 'off-white', screen: '#f1ede4', rim: '#9c9484', flips: ['black', 'cobalt', 'hot-red'] },
  { id: 'sand', screen: '#cdbd9e', rim: '#85775c', flips: ['black', 'deep-green', 'cobalt'] },
  { id: 'hot-red', screen: '#ff2418', rim: '#8a0f08', flips: ['off-white', 'black', 'cyan'] },
  { id: 'orange', screen: '#ff6a00', rim: '#8a3300', flips: ['cobalt', 'deep-green', 'black'] },
  { id: 'sun-yellow', screen: '#ffd500', rim: '#8a7200', flips: ['violet', 'black', 'cobalt'] },
  { id: 'acid-yellow', screen: '#d8ff00', rim: '#6f8500', flips: ['black', 'violet', 'magenta'] },
  { id: 'lime', screen: '#7de800', rim: '#3d7a00', flips: ['black', 'magenta', 'violet'] },
  { id: 'green', screen: '#00c853', rim: '#00662a', flips: ['violet', 'magenta', 'black'] },
  { id: 'deep-green', screen: '#0a5c3a', rim: '#052e1d', flips: ['acid-yellow', 'hot-pink', 'teal'] },
  { id: 'teal', screen: '#00a79d', rim: '#00524d', flips: ['off-white', 'sun-yellow', 'black'] },
  { id: 'cyan', screen: '#00d8ff', rim: '#006b80', flips: ['violet', 'magenta', 'black'] },
  { id: 'cobalt', screen: '#1f3cff', rim: '#0f1e80', flips: ['acid-yellow', 'orange', 'hot-pink'] },
  { id: 'violet', screen: '#7a2cff', rim: '#3d1680', flips: ['sun-yellow', 'lime', 'green'] },
  { id: 'magenta', screen: '#e0007a', rim: '#70003d', flips: ['acid-yellow', 'cyan', 'sand'] },
  { id: 'hot-pink', screen: '#ff7ac8', rim: '#8a2f68', flips: ['cobalt', 'deep-green', 'black'] },
];

/** Every palette id, for whoever stores or checks a card's screen colour. */
export const WINDOW_PALETTE_IDS: readonly string[] = WINDOW_PALETTES.map(palette => palette.id);

export function paletteOf(id: string): WindowPalette {
  const palette = WINDOW_PALETTES.find(candidate => candidate.id === id);
  if (!palette) throw new Error(`There is no window palette "${id}".`);
  return palette;
}

/** A screen has to differ from the picture in the letters by at least this contrast (WCAG ratio, picture taken at its average) to read. */
export const MIN_PICTURE_CONTRAST = 1.6;

/**
 * The palettes whose screen reads against this picture, given colours sampled from what shows in the letters: not a
 * yellow screen round a pale yellow picture. A screen too close to the picture's average light is left out.
 */
export function legiblePalettes(pictureColours: readonly string[]): string[] {
  if (!pictureColours.length) throw new Error('A picture needs colours to be judged.');
  const average = pictureColours.reduce((sum, colour) => sum + luminance(colour), 0) / pictureColours.length;
  const reads = (screen: string) => (Math.max(luminance(screen), average) + 0.05) / (Math.min(luminance(screen), average) + 0.05) >= MIN_PICTURE_CONTRAST;
  return WINDOW_PALETTES.filter(palette => reads(palette.screen)).map(palette => palette.id);
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

/** A short line (a lone "I") is set as wide as the box but no bigger than this many times the longest line's size: the stack is not shrunk to nothing by a tower. */
const MAX_SIZE_RATIO = 2.2;

/** One way of stacking the lines: each one is set as wide as the box (a short one within `MAX_SIZE_RATIO`), and the stack is shrunk to fit if it is too tall. */
function stack(lines: readonly string[], measure: Measure, box: { width: number; height: number }): WindowLayout {
  const inks = lines.map(measure);
  const fits = inks.map(({ width }) => (box.width * 100) / width);
  const sizes = fits.map(fit => Math.min(fit, Math.min(...fits) * MAX_SIZE_RATIO));
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
 * wide as the box allows (a short one a little less). A word is never split.
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

/** With a person standing in front, her head is brought down to this far from the top of the frame, to leave room for the words above it: lower, and her body is cropped too much. */
const PERSON_HEAD_AT = Math.round(HEIGHT * 0.32);
/** How far the words' lower edge reaches down behind her head, as a share of their last line's height: enough to be tucked in, not enough to hide the letters. */
const TUCK_SHARE = 0.3;
const TUCK_PASSES = 4;

/** Where the person stands: she is moved down until her head is `PERSON_HEAD_AT` from the top (or left where she is, if she is lower already). */
export function personStage(headTop: number): { drop: number; headAt: number } {
  const drop = Math.max(0, PERSON_HEAD_AT - headTop);
  return { drop, headAt: headTop + drop };
}

/**
 * The words when a person stands in front of them, like the title of a magazine cover: they take the room above her
 * head, their lower edge tucked behind it. Two words stack to fill the room; one word, which can only be as high as it is
 * wide, sits on her head.
 */
export function personWords(text: string, measure: Measure, headAt: number): { layout: WindowLayout; centre: readonly [number, number] } {
  const floor = SAFE_BOX.y + SAFE_BOX.height;
  const fit = (tuck: number) => layoutWords(text, measure, { width: REST_BOX.width, height: (Math.min(headAt + tuck, floor) - SAFE_BOX.y) / (1 + PUNCH_SWELL) });
  let tuck = 0;
  let layout = fit(tuck);
  for (let pass = 0; pass < TUCK_PASSES; pass++) {
    tuck = TUCK_SHARE * layout.lines[layout.lines.length - 1].height * (1 + PUNCH_SWELL);
    layout = fit(tuck);
  }
  const bottom = Math.min(headAt + tuck, floor);
  return { layout, centre: [WIDTH / 2, bottom - (layout.height * (1 + PUNCH_SWELL)) / 2] };
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
