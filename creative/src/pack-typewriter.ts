/**
 * Typewriter: the Director's reel as an old newspaper photo (warm paper, faded, stained), with the lyrics typed over it in black
 * typewriter ink, a little faded, or in a red, yellow or purple ink that the paper's shadows take on too. Each phrase is typed where it falls on the page as it is sung, key by key, and stays, so the page
 * fills up. Ink dots are spattered here and there and stay, so with lyrics off the page still carries its ink.
 */
import { CanvasTextMetrics, Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js';
import { HEIGHT, WIDTH, type LyricCue } from './composition';
import { phrasesFor } from './lyric-motion';
import { FRAME_UV, NOISE, makeFilter } from './treatment-filter';

export const TYPEWRITER_FONT = 'Special Elite';
const INK = '#1c1814';
const SIZE = 46;
const LINE = 66;
const SIDE = 70;
const TOP = 130;
/** The bottom of the page is left to the platform's caption and buttons. */
const BOTTOM = 260;
/** How long one key takes, at most: a short word is typed quickly even when it is sung long. */
const KEY_MS = 70;

type PaperLook = { paper: [number, number, number]; colour: number; fade: number; stain: number; ink: number; pen: string; tint: number };

const NEWSPRINT: Omit<PaperLook, 'pen' | 'tint'> = { paper: [0.91, 0.87, 0.77], colour: 0.12, fade: 0.16, stain: 0.5, ink: 0.45 };

/**
 * The paper each variant prints on (0-1 rgb), how much of the picture's own colour is kept, how washed out it is, how stained,
 * how faded the ink, the ink's colour (`pen`), and how far the picture's shadows take on that colour (`tint`). The four inks
 * are the original page with only the colour changed. Old letter, Faded page and Yellowed are no longer dealt; they stay so
 * cards made with them still render.
 */
export const PAPER_LOOK: Record<string, PaperLook> = {
  newsprint: { ...NEWSPRINT, pen: INK, tint: 0 },
  'red-ink': { ...NEWSPRINT, pen: '#a61e1a', tint: 0.8 },
  'yellow-ink': { ...NEWSPRINT, pen: '#b8860b', tint: 0.8 },
  'purple-ink': { ...NEWSPRINT, pen: '#5b2a86', tint: 0.8 },
  letter: { paper: [0.94, 0.86, 0.7], colour: 0.2, fade: 0.12, stain: 0.7, ink: 0.5, pen: INK, tint: 0 },
  faded: { paper: [0.95, 0.91, 0.82], colour: 0.08, fade: 0.32, stain: 0.35, ink: 0.6, pen: INK, tint: 0 },
  yellowed: { paper: [0.9, 0.78, 0.57], colour: 0.15, fade: 0.14, stain: 0.9, ink: 0.5, pen: INK, tint: 0 },
};

const pen = (hex: string) => {
  const [uPenR, uPenG, uPenB] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return { uPenR, uPenG, uPenB };
};

/** Old newsprint: the picture's light on warm paper, its darks a brown-grey (never black, so the ink reads), grain, fibres, stains and browned edges. */
const PAPER = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uPaperR;
uniform float uPaperG;
uniform float uPaperB;
uniform float uColour;
uniform float uFade;
uniform float uStain;
uniform float uSeed;
uniform float uPenR;
uniform float uPenG;
uniform float uPenB;
uniform float uTint;
${FRAME_UV}
${NOISE}
void main(void) {
  vec2 n = vTextureCoord / frameMax();
  vec2 px = n * vec2(${WIDTH}.0, ${HEIGHT}.0);
  vec3 paper = vec3(uPaperR, uPaperG, uPaperB);
  vec3 c = texture(uTexture, vTextureCoord).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  l = smoothstep(0.04, 0.96, l);
  // The picture printed in the page's ink: its shadows take on the ink's colour, kept lighter than the type so the type reads.
  vec3 shadow = mix(paper * 0.42, mix(vec3(uPenR, uPenG, uPenB), paper, 0.3), uTint);
  vec3 toned = mix(shadow, paper, pow(l, 0.8));
  toned = mix(toned, c * paper * 1.1, uColour);
  toned = mix(toned, paper, uFade);
  toned += (hash(floor(px / 1.5)) - 0.5) * 0.06;
  toned -= (noise(vec2(px.x * 0.02, px.y * 0.5) + uSeed) - 0.5) * 0.035;
  float stain = noise(n * vec2(3.0, 5.0) + uSeed) * noise(n * vec2(6.0, 9.0) + uSeed * 1.7);
  toned *= 1.0 - uStain * smoothstep(0.22, 0.55, stain) * vec3(0.04, 0.1, 0.22);
  float edge = smoothstep(0.35, 0.78, length((n - 0.5) * vec2(1.0, 0.8)));
  toned *= 1.0 - edge * vec3(0.1, 0.18, 0.3);
  finalColor = vec4(clamp(toned, 0.0, 1.0), 1.0);
}
`;

/** Worn ribbon: the ink thins in soft patches and in fine specks, the same on every frame (the page does not shimmer). */
const RIBBON = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uFade;
uniform float uSeed;
${FRAME_UV}
${NOISE}
void main(void) {
  vec2 px = vTextureCoord / frameMax() * vec2(${WIDTH}.0, ${HEIGHT}.0);
  float patchy = noise(px * 0.018 + uSeed);
  float fine = noise(px * 0.4 + uSeed * 3.1);
  float keep = clamp(1.0 - uFade * (0.6 * (1.0 - patchy) + 0.5 * fine), 0.12, 1.0);
  finalColor = texture(uTexture, vTextureCoord) * keep;
}
`;

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A phrase as typed: its text, and where each word's letters sit in it with the time they are sung. */
export type TypedPhrase = { text: string; words: { from: number; to: number; startMs: number; endMs: number }[] };
/** One typed line: a stretch (`from`, in the phrase's text) of one phrase, where it sits and how crooked. */
export type TypedLine = { phrase: number; from: number; text: string; x: number; y: number; tilt: number };

/**
 * Where every phrase of the song is typed: on rows of the page not yet used, at a typewriter column, wrapped to a width of its
 * own (so the page is not one block), each line a touch crooked. The same cues and seed always type the same page.
 */
export function typedPage(cues: readonly LyricCue[], seed: number, charWidth: number): { phrases: TypedPhrase[]; lines: TypedLine[] } {
  const roll = random(seed * 2654435761);
  const columns = Math.max(8, Math.floor((WIDTH - 2 * SIDE) / charWidth));
  const rows = Math.floor((HEIGHT - TOP - BOTTOM) / LINE);
  const used = new Array<boolean>(rows).fill(false);
  const phrases: TypedPhrase[] = [];
  const lines: TypedLine[] = [];
  for (const phrase of phrasesFor(cues)) {
    let text = '';
    const words = phrase.words.map(word => {
      if (text) text += ' ';
      const from = text.length;
      text += word.text.trim();
      return { from, to: text.length, startMs: word.startMs, endMs: word.endMs };
    });
    const index = phrases.push({ text, words }) - 1;
    const width = Math.max(10, Math.round(columns * (0.55 + roll() * 0.45)));
    const wrapped: { from: number; text: string }[] = [];
    for (const word of words) {
      let from = word.from;
      while (from < word.to) {
        const last = wrapped.at(-1);
        const piece = text.slice(from, Math.min(word.to, from + width));
        if (last && from === word.from && last.text.length + 1 + piece.length <= width) {
          last.text += ` ${piece}`;
        } else wrapped.push({ from, text: piece });
        from += piece.length;
      }
    }
    const longest = Math.max(...wrapped.map(line => line.text.length));
    // Rows where the phrase fits, with a blank row above and below while the page has room, so phrases do not run together.
    const starts = Array.from({ length: Math.max(0, rows - wrapped.length + 1) }, (_, row) => row);
    const fits = (row: number, margin: number) => wrapped.every((_, k) => !used[row + k]) && (!margin || (!used[row - 1] && !used[row + wrapped.length]));
    const free = starts.filter(row => fits(row, 1));
    const open = free.length ? free : starts.filter(row => fits(row, 0));
    const start = open.length ? open[Math.floor(roll() * open.length)] : Math.floor(roll() * Math.max(1, rows - wrapped.length + 1));
    const column = Math.floor(roll() * (columns - longest + 1));
    const tilt = (roll() - 0.5) * 0.022;
    wrapped.forEach((line, k) => {
      used[start + k] = true;
      lines.push({
        phrase: index, from: line.from, text: line.text,
        x: SIDE + column * charWidth, y: TOP + (start + k) * LINE + (roll() - 0.5) * 8, tilt,
      });
    });
  }
  return { phrases, lines };
}

/** How many letters of a phrase are typed at `ms`: each word key by key from when it is sung, the space after it with its last key. */
export function typedChars(phrase: TypedPhrase, ms: number): number {
  let count = 0;
  for (const word of phrase.words) {
    if (ms < word.startMs) break;
    const length = word.to - word.from;
    const span = Math.max(1, Math.min(word.endMs - word.startMs, length * KEY_MS));
    const done = Math.min(length, Math.ceil(((ms - word.startMs) / span) * length));
    if (done < length) return word.from + done;
    count = Math.min(phrase.text.length, word.to + 1);
  }
  return count;
}

/** Ink spattered on the page: specks, a few drops, and blots with their splashes. Drawn once per card. */
function spatter(dots: Graphics, seed: number, pen: string) {
  const roll = random(seed * 40503 + 17);
  dots.clear();
  const drop = (x: number, y: number, r: number) => dots.circle(x, y, r).fill({ color: pen, alpha: 0.55 + roll() * 0.35 });
  for (let i = 0; i < 34; i++) drop(roll() * WIDTH, roll() * HEIGHT, 1.2 + roll() * 2.2);
  for (let i = 0; i < 12; i++) drop(roll() * WIDTH, roll() * HEIGHT, 3.5 + roll() * 3.5);
  for (let i = 0; i < 3; i++) {
    const x = 60 + roll() * (WIDTH - 120);
    const y = 80 + roll() * (HEIGHT - 160);
    drop(x, y, 8 + roll() * 7);
    for (let k = 0, splashes = 4 + Math.floor(roll() * 4); k < splashes; k++) {
      const angle = roll() * Math.PI * 2;
      const reach = 16 + roll() * 30;
      drop(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach, 1.5 + roll() * 3);
    }
  }
}

export type TypewriterPage = {
  root: Container;
  /** The old-paper pass, for the reel itself. */
  paper: ReturnType<typeof makeFilter>['filter'];
  update(input: { cues: readonly LyricCue[]; ms: number; seed: number; variant: string; lyrics: boolean }): void;
  destroy(): void;
};

export function createTypewriterPage(): TypewriterPage {
  const root = new Container();
  const dots = new Graphics();
  const typed = new Container();
  root.addChild(dots, typed);
  root.filterArea = new Rectangle(0, 0, WIDTH, HEIGHT);
  const paper = makeFilter(PAPER, 'treatment-paper', { uPaperR: 0.9, uPaperG: 0.86, uPaperB: 0.76, uColour: 0, uFade: 0, uStain: 0, uSeed: 0, uPenR: 0, uPenG: 0, uPenB: 0, uTint: 0 });
  const ribbon = makeFilter(RIBBON, 'treatment-ribbon', { uFade: 0.5, uSeed: 0 });
  root.filters = [ribbon.filter];
  const typeface = { fontFamily: `"${TYPEWRITER_FONT}", "Courier New", monospace`, fontSize: SIZE };
  const style = new TextStyle({ ...typeface, fill: INK });

  let spattered: string | null = null;
  let inked = INK;
  let laid: { cues: readonly LyricCue[]; seed: number; phrases: TypedPhrase[]; lines: { line: TypedLine; text: Text }[] } | null = null;

  function clearTyped() {
    for (const child of typed.removeChildren()) child.destroy();
    laid = null;
  }

  return {
    root,
    paper: paper.filter,
    update({ cues, ms, seed, variant, lyrics }) {
      const look = PAPER_LOOK[variant] ?? PAPER_LOOK.newsprint;
      const grain = (seed % 997) / 37;
      paper.set({ uPaperR: look.paper[0], uPaperG: look.paper[1], uPaperB: look.paper[2], uColour: look.colour, uFade: look.fade, uStain: look.stain, uSeed: grain, ...pen(look.pen), uTint: look.tint });
      if (inked !== look.pen) {
        style.fill = look.pen;
        inked = look.pen;
      }
      ribbon.set({ uFade: look.ink, uSeed: grain });
      if (spattered !== `${seed}:${look.pen}`) {
        spatter(dots, seed, look.pen);
        spattered = `${seed}:${look.pen}`;
      }
      const words = lyrics ? cues : [];
      if (!laid || laid.cues !== words || laid.seed !== seed) {
        clearTyped();
        const charWidth = CanvasTextMetrics.measureText('M'.repeat(20), style).width / 20;
        const page = typedPage(words, seed, charWidth);
        laid = {
          cues: words, seed, phrases: page.phrases,
          lines: page.lines.map(line => {
            const text = new Text({ text: '', style });
            text.position.set(line.x, line.y);
            text.rotation = line.tilt;
            text.alpha = 0.82 + ((line.phrase * 7919 + seed) % 13) / 100;
            typed.addChild(text);
            return { line, text };
          }),
        };
      }
      const counts = laid.phrases.map(phrase => typedChars(phrase, ms));
      for (const { line, text } of laid.lines) {
        const shown = line.text.slice(0, Math.max(0, counts[line.phrase] - line.from));
        if (text.text !== shown) text.text = shown;
      }
    },
    destroy() {
      clearTyped();
      paper.filter.destroy();
      ribbon.filter.destroy();
      root.destroy({ children: true });
    },
  };
}
