/**
 * Lyric type system — twenty-three styles, driven by word-level timing.
 * Deterministic: output depends only on the frame inputs (shelf and cloud agree).
 *
 *  typewriter  characters appear with a blinking caret
 *  karaoke     whole line visible, words light up as they are sung
 *  stack       one huge word at a time, slamming in
 *  minimal     quiet lowercase subtitle, line by line
 *  editorial   serif italic, lines slide up through a mask
 *  outline     hollow letters that fill as each word lands
 *  swap        the phrase holds the middle of the screen and is set again in another face on every beat
 *  poem        the whole line as a small verse, ranged left, each word inked in as it is sung
 *  + the motion styles of lyric-fx.ts (bounce, wave, glitch, rotate, stretch, split, wipe, flicker, zoom,
 *    scatter, jitter, echo, slide, tilt, and the calm rise, glow, drift), drawn by pack-fx.ts
 */
import { Container, Graphics } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { displayFace, setCase, type AdFont, type FaceStyle, type FontNeed } from './ad-fonts';
import { FIXED_FACES } from './font-catalog';
import { FX_STYLES, FX_TRAITS, type FxStyleId } from './lyric-fx';
import { createFxPainter } from './pack-fx';
import { activeIndex, clamp01, easeOut, finishedWord, isPlated, layoutWords, measure, plateInk, type TimedWord, type TypeFrame } from './type-kit';

export type { TimedWord, TypeFrame };

const CLASSIC_STYLES = ['typewriter', 'karaoke', 'stack', 'minimal', 'editorial', 'outline', 'swap', 'poem'] as const;
type ClassicStyle = (typeof CLASSIC_STYLES)[number];
export const TYPE_STYLES = [...CLASSIC_STYLES, ...FX_STYLES] as const;
export type TypeStyleId = (typeof TYPE_STYLES)[number];

const isMotion = (style: TypeStyleId): style is FxStyleId => style in FX_TRAITS;

const fixed = (family: keyof typeof FIXED_FACES): FaceStyle => ({ family, weight: FIXED_FACES[family].weight, italic: FIXED_FACES[family].italic });

type Fonts = Pick<TypeFrame, 'font' | 'fontSecondary'>;

/** The face a classic style draws with: fixed by the style (mood-specific) or chosen by the brain. */
const FACES: Record<ClassicStyle, (fonts: Fonts) => FaceStyle> = {
  typewriter: () => fixed('Space Mono'),
  karaoke: f => displayFace(f.font),
  stack: f => displayFace(f.fontSecondary),
  minimal: () => fixed('Outfit'),
  editorial: () => fixed('Playfair Display'),
  outline: f => displayFace(f.font),
  swap: () => SWAP_FACES[0],
  poem: () => fixed('Outfit'),
};

/** Swap's faces, as unlike each other as faces get: condensed, script, light grotesk, serif italic, wide, heavy. */
const SWAP_FACES: readonly FaceStyle[] = [
  displayFace('League Gothic'),
  displayFace('Kaushan Script'),
  fixed('Outfit'),
  fixed('Playfair Display'),
  displayFace('Syne'),
  displayFace('Anton'),
];

const POEM_FACES: readonly FaceStyle[] = [fixed('Outfit'), fixed('Playfair Display'), fixed('Space Mono')];

/** The font families a style draws with, so they can be fetched before the first frame. */
export function typeFamilies(style: TypeStyleId, fonts: Fonts): string[] {
  if (style === 'swap') return SWAP_FACES.map(face => face.family);
  if (style === 'poem') return POEM_FACES.map(face => face.family);
  return [isMotion(style) ? fonts.font : FACES[style](fonts).family];
}

/** What a style needs of the faces dealt to its card. Styles with a fixed face need nothing. */
export function typeNeeds(style: TypeStyleId): readonly FontNeed[] {
  if (isMotion(style)) return FX_TRAITS[style].needs;
  return style === 'outline' ? ['heavy'] : [];
}

function caseFor(style: ClassicStyle, text: string, font: AdFont): string {
  switch (style) {
    case 'karaoke':
    case 'stack':
    case 'outline':
      return setCase(font, text);
    case 'minimal':
    case 'swap':
    case 'poem':
      return text.toLocaleLowerCase();
    case 'editorial':
      return text.charAt(0).toLocaleUpperCase() + text.slice(1);
    default:
      return text;
  }
}

export type TypeLayer = {
  root: Container;
  paint(style: TypeStyleId, frame: TypeFrame): void;
  destroy(): void;
};

export function createTypeLayer(): TypeLayer {
  const root = new Container();
  const motion = createFxPainter();

  function clear() {
    while (root.children.length) {
      const child = root.children[0];
      root.removeChild(child);
      child.destroy({ children: true });
    }
  }

  function karaoke(frame: TypeFrame) {
    const face = FACES.karaoke(frame);
    const labels = frame.words.map(w => caseFor('karaoke', w.text, frame.font));
    const fit = layoutWords(labels, face, 150, 900, 4, 0.98);
    const active = activeIndex(frame.words, frame.ms);
    const group = new Container();
    const total = fit.lines.length * fit.lineHeight;
    fit.lines.forEach((line, row) => {
      const y = (row + 0.5) * fit.lineHeight - total / 2;
      for (const item of line.items) {
        const word = frame.words[item.index];
        const started = frame.ms >= word.startMs;
        const isActive = item.index === active;
        const pop = isActive ? 1 + 0.06 * (1 - easeOut((frame.ms - word.startMs) / 180)) : 1;
        const t = finishedWord(item.text, { size: fit.size, face, alpha: started ? 1 : 0.3 }, frame, isActive);
        t.position.set(item.x + item.w / 2, y);
        t.scale.set(pop);
        group.addChild(t);
      }
    });
    group.position.set(WIDTH / 2, HEIGHT * 0.5);
    group.scale.set(1 + frame.beat * 0.035 * Math.max(0.4, frame.energy));
    root.addChild(group);
  }

  function typewriter(frame: TypeFrame) {
    const face = FACES.typewriter(frame);
    const labels = frame.words.map(w => w.text);
    const fit = layoutWords(labels, face, 124, 900, 7, 1.3);
    const shown = frame.words.map(word => {
      const span = Math.max(140, (word.endMs - word.startMs) * 0.85);
      return Math.ceil(word.text.length * clamp01((frame.ms - word.startMs) / span));
    });
    const total = fit.lines.length * fit.lineHeight;
    const group = new Container();
    let caret: { x: number; y: number } | null = null;
    fit.lines.forEach((line, row) => {
      const y = (row + 0.5) * fit.lineHeight - total / 2;
      const x0 = -line.width / 2;
      let text = '';
      line.items.forEach((item, i) => {
        const part = labels[item.index].slice(0, shown[item.index]);
        if (i > 0 && shown[item.index] > 0) text += ' ';
        text += part;
      });
      if (text) {
        const t = finishedWord(text, { size: fit.size, face, anchorX: 0 }, frame);
        t.position.set(x0, y);
        group.addChild(t);
      }
      const typedHere = line.items.some(item => shown[item.index] > 0);
      if (typedHere) caret = { x: x0 + measure(face, fit.size, text), y };
    });
    const typing = frame.words.some((w, i) => shown[i] > 0 && shown[i] < w.text.length);
    const blinkOn = typing || Math.floor(frame.ms / 480) % 2 === 0;
    const at = caret ?? { x: -fit.lines[0].width / 2, y: -total / 2 + fit.lineHeight / 2 };
    if (blinkOn) {
      const bar = new Graphics();
      bar.rect(at.x + fit.size * 0.06, at.y - fit.size * 0.42, Math.max(4, fit.size * 0.05), fit.size * 0.84);
      bar.fill({ color: frame.accent });
      group.addChild(bar);
    }
    group.position.set(WIDTH / 2, HEIGHT * 0.5);
    root.addChild(group);
  }

  function stack(frame: TypeFrame) {
    const face = FACES.stack(frame);
    const active = Math.max(0, activeIndex(frame.words, frame.ms));
    const word = frame.words[active];
    const label = caseFor('stack', word.text, frame.fontSecondary);
    const size = Math.min(380, (920 / Math.max(1, measure(face, 100, label))) * 100);
    const slam = 1 + 0.28 * (1 - easeOut((frame.ms - word.startMs) / 150));
    const group = new Container();
    // The word fills with its colour from the left as it is sung.
    const sung = easeOut((frame.ms - word.startMs) / Math.max(120, word.endMs - word.startMs));
    const width = measure(face, size, label);
    const main = new Container();
    main.scale.set(slam);
    main.addChild(finishedWord(label, { size, face }, frame));
    const lit = finishedWord(label, { size, face }, frame, true);
    const reach = new Graphics();
    reach.rect(-width / 2 - size * 0.3, -size, (width + size * 0.6) * sung, size * 2);
    reach.fill({ color: '#ffffff' });
    lit.mask = reach;
    main.addChild(reach, lit);
    group.addChild(main);

    // Previous words, smaller and fading, stacked above.
    for (let k = 1; k <= 2; k++) {
      const prev = frame.words[active - k];
      if (!prev) break;
      const t = finishedWord(caseFor('stack', prev.text, frame.fontSecondary), {
        size: Math.max(44, size * (k === 1 ? 0.34 : 0.24)),
        face,
        alpha: k === 1 ? 0.42 : 0.2,
      }, frame);
      t.position.set(0, -size * (0.62 + k * 0.3));
      group.addChild(t);
    }
    group.position.set(WIDTH / 2, HEIGHT * 0.48);
    group.scale.set(1 + frame.beat * 0.025 * Math.max(0.4, frame.energy));
    root.addChild(group);
  }

  function minimal(frame: TypeFrame) {
    const face = FACES.minimal(frame);
    const labels = frame.words.map(w => caseFor('minimal', w.text, frame.font));
    const fit = layoutWords(labels, face, 80, 820, 3, 1.4);
    const start = frame.words[0]?.startMs ?? 0;
    const active = activeIndex(frame.words, frame.ms);
    const group = new Container();
    const total = fit.lines.length * fit.lineHeight;
    fit.lines.forEach((line, row) => {
      const y = (row + 0.5) * fit.lineHeight - total / 2;
      const lead = Math.min(...line.items.map(item => frame.words[item.index].startMs), start + row * 220);
      const a = easeOut((frame.ms - lead) / 360);
      for (const item of line.items) {
        const t = finishedWord(item.text, { size: fit.size, face, alpha: a }, frame, item.index === active);
        t.position.set(item.x + item.w / 2, y + (1 - a) * 14);
        group.addChild(t);
      }
    });
    group.position.set(WIDTH / 2, HEIGHT * 0.68);
    root.addChild(group);
  }

  function editorial(frame: TypeFrame) {
    const face = FACES.editorial(frame);
    const labels = frame.words.map(w => caseFor('editorial', w.text, frame.font));
    const fit = layoutWords(labels, face, 128, 880, 4, 1.06);
    const active = activeIndex(frame.words, frame.ms);
    const start = frame.words[0]?.startMs ?? 0;
    const total = fit.lines.length * fit.lineHeight;
    const group = new Container();
    fit.lines.forEach((line, row) => {
      const y = (row + 0.5) * fit.lineHeight - total / 2;
      const slide = easeOut((frame.ms - start - row * 120) / 420);
      const lineBox = new Container();
      for (const item of line.items) {
        const t = finishedWord(item.text, { size: fit.size, face }, frame, item.index === active);
        t.position.set(item.x + item.w / 2, y + (1 - slide) * fit.lineHeight * 1.05);
        lineBox.addChild(t);
      }
      const mask = new Graphics();
      mask.rect(-WIDTH / 2, y - fit.lineHeight / 2, WIDTH, fit.lineHeight);
      mask.fill({ color: '#ffffff' });
      group.addChild(mask);
      lineBox.mask = mask;
      group.addChild(lineBox);
    });
    group.position.set(WIDTH / 2, HEIGHT * 0.5);
    root.addChild(group);
  }

  function outline(frame: TypeFrame) {
    const face = FACES.outline(frame);
    const labels = frame.words.map(w => caseFor('outline', w.text, frame.font));
    const fit = layoutWords(labels, face, 170, 900, 3, 0.96);
    const active = activeIndex(frame.words, frame.ms);
    const total = fit.lines.length * fit.lineHeight;
    const group = new Container();
    fit.lines.forEach((line, row) => {
      const y = (row + 0.5) * fit.lineHeight - total / 2;
      for (const item of line.items) {
        const word = frame.words[item.index];
        const filled = frame.ms >= word.startMs;
        const lit = item.index === active;
        const edge = lit ? (isPlated(frame) ? plateInk(frame) : frame.accent) : frame.ink;
        const t = finishedWord(item.text, { size: fit.size, face, hollow: !filled, stroke: { color: edge, width: Math.max(4, fit.size * 0.035) } }, frame, lit);
        t.position.set(item.x + item.w / 2, y);
        group.addChild(t);
      }
    });
    group.position.set(WIDTH / 2, HEIGHT * 0.5);
    group.scale.set(1 + frame.beat * 0.03 * Math.max(0.4, frame.energy));
    root.addChild(group);
  }

  function swap(frame: TypeFrame) {
    const active = activeIndex(frame.words, frame.ms);
    // A song with no beat grid still swaps, on each word as it is sung.
    const turn = frame.beatIndex > 0 ? frame.beatIndex : Math.max(0, active);
    const face = SWAP_FACES[Math.abs(frame.seed + turn) % SWAP_FACES.length];
    const labels = frame.words.map(w => caseFor('swap', w.text, frame.font));
    const fit = layoutWords(labels, face, 280, 880, 3, 0.94);
    const total = fit.lines.length * fit.lineHeight;
    const group = new Container();
    fit.lines.forEach((line, row) => {
      const y = (row + 0.5) * fit.lineHeight - total / 2;
      for (const item of line.items) {
        if (frame.ms < frame.words[item.index].startMs) continue;
        const t = finishedWord(item.text, { size: fit.size, face }, frame, item.index === active);
        t.position.set(item.x + item.w / 2, y);
        group.addChild(t);
      }
    });
    group.position.set(WIDTH / 2, HEIGHT * 0.5);
    group.scale.set(1 + frame.beat * 0.04 * Math.max(0.4, frame.energy));
    root.addChild(group);
  }

  function poem(frame: TypeFrame) {
    const face = POEM_FACES[Math.abs(frame.seed) % POEM_FACES.length];
    const labels = frame.words.map(w => caseFor('poem', w.text, frame.font));
    const fit = layoutWords(labels, face, 66, 520, 8, 1.3, true);
    const active = activeIndex(frame.words, frame.ms);
    const total = fit.lines.length * fit.lineHeight;
    const group = new Container();
    fit.lines.forEach((line, row) => {
      const y = (row + 0.5) * fit.lineHeight - total / 2;
      for (const item of line.items) {
        const word = frame.words[item.index];
        const inked = easeOut((frame.ms - word.startMs) / 320);
        const t = finishedWord(item.text, { size: fit.size, face, alpha: 0.16 + 0.84 * inked }, frame, item.index === active);
        t.position.set(item.x + item.w / 2, y);
        group.addChild(t);
      }
    });
    group.position.set(WIDTH * 0.14, HEIGHT * 0.44);
    root.addChild(group);
  }

  return {
    root,
    paint(style, frame) {
      clear();
      if (!frame.words.length) return;
      if (isMotion(style)) {
        root.addChild(motion.paint(style, frame));
        return;
      }
      switch (style) {
        case 'typewriter': typewriter(frame); break;
        case 'karaoke': karaoke(frame); break;
        case 'stack': stack(frame); break;
        case 'minimal': minimal(frame); break;
        case 'editorial': editorial(frame); break;
        case 'outline': outline(frame); break;
        case 'swap': swap(frame); break;
        case 'poem': poem(frame); break;
      }
    },
    destroy() {
      clear();
      root.destroy({ children: true });
    },
  };
}
