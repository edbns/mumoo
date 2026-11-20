/** Shared pieces of the lyric type styles: what a frame carries, measuring, word wrap, and drawing one piece of text. */
import { Container, FillGradient, Graphics, Text } from 'pixi.js';
import { cssFont, type AdFont, type FaceStyle } from './ad-fonts';
import { textMeasureCtx } from './pack-text';
import type { TypeFinish } from './type-finish';

export type TimedWord = { text: string; startMs: number; endMs: number };

export type TypeFrame = {
  ms: number;
  words: readonly TimedWord[];
  beat: number;
  /** How many beats have passed (alternates what moves on each hit). */
  beatIndex: number;
  energy: number;
  /** The card's own roll of the dice: scatter angles, hand-drawn wobble. The same card always rolls the same. */
  seed: number;
  ink: string;
  accent: string;
  /** Opposite of ink: used for the soft shadow that keeps type readable on busy images. */
  shadow: string;
  /** Display fonts picked by the brain for the kinetic styles. */
  font: AdFont;
  fontSecondary: AdFont;
  /** How the letters are finished (type-finish.ts); solid when absent. */
  finish?: TypeFinish;
  /** Letters readable on the accent, for the box finish; the shadow colour when absent. */
  onAccent?: string;
};

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);

export function measure(face: FaceStyle, size: number, text: string): number {
  const ctx = textMeasureCtx();
  ctx.font = cssFont(face, size);
  return ctx.measureText(text).width;
}

export type Item = { index: number; text: string; x: number; w: number };
export type Line = { items: Item[]; width: number };
export type Layout = { size: number; lines: Line[]; lineHeight: number };

/** Greedy word wrap at the largest size that fits `maxLines` × `maxWidth`. Lines are centred on x = 0 unless `left`. */
export function layoutWords(
  words: readonly string[],
  face: FaceStyle,
  start: number,
  maxWidth: number,
  maxLines: number,
  lineGap: number,
  left = false,
): Layout {
  let size = start;
  for (;;) {
    const space = measure(face, size, ' ');
    const lines: Line[] = [];
    let current: Item[] = [];
    let x = 0;
    words.forEach((text, index) => {
      const w = measure(face, size, text);
      if (current.length && x + space + w > maxWidth) {
        lines.push({ items: current, width: x });
        current = [];
        x = 0;
      }
      const at = current.length ? x + space : 0;
      current.push({ index, text, x: at, w });
      x = at + w;
    });
    if (current.length) lines.push({ items: current, width: x });
    const widest = Math.max(0, ...lines.map(line => line.width));
    if ((lines.length <= maxLines && widest <= maxWidth) || size <= 28) {
      if (!left) for (const line of lines) for (const item of line.items) item.x -= line.width / 2;
      return { size, lines, lineHeight: size * lineGap };
    }
    size = Math.max(28, size - 6);
  }
}

export type TextOpts = {
  size: number;
  color: string;
  /** The soft shadow that keeps type readable on busy pictures. */
  shadow: string;
  face: FaceStyle;
  alpha?: number;
  anchorX?: number;
  stroke?: { color: string; width: number };
  hollow?: boolean;
  /** Solid when absent. Gradient fades `color` into `glow`; sticker edges the letters in `shadow` and drops a hard shadow of `glow`. */
  finish?: TypeFinish;
  glow?: string;
  /** No shadow at all (letters on a box). */
  flat?: boolean;
};

const mix = (a: string, b: string, t: number) => {
  const channel = (colour: string, i: number) => parseInt(colour.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map(i => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
};

function fillOf(o: TextOpts) {
  if (o.hollow) return { color: o.color, alpha: 0 };
  if (o.finish !== 'gradient' || !o.glow) return o.color;
  return new FillGradient({
    type: 'linear', start: { x: 0, y: 0.15 }, end: { x: 0, y: 0.95 }, textureSpace: 'local',
    colorStops: [{ offset: 0, color: o.color }, { offset: 1, color: mix(o.color, o.glow, 0.6) }],
  });
}

function shadowOf(o: TextOpts) {
  if (o.hollow || o.flat) return {};
  if (o.finish === 'sticker') return { dropShadow: { color: o.glow ?? o.shadow, alpha: 1, blur: 0, distance: Math.max(3, o.size * 0.055), angle: Math.PI / 4 } };
  return { dropShadow: { color: o.shadow, alpha: 0.42, blur: 10, distance: 3, angle: Math.PI / 2 } };
}

export function makeText(label: string, o: TextOpts): Text {
  const text = new Text({
    text: label,
    style: {
      fontFamily: o.face.family,
      fontSize: o.size,
      fontWeight: String(o.face.weight) as '400',
      fontStyle: o.face.italic ? 'italic' : 'normal',
      fill: fillOf(o),
      ...(o.stroke ? { stroke: { color: o.stroke.color, width: o.stroke.width, join: 'round' as const } }
        : o.finish === 'sticker' && !o.hollow ? { stroke: { color: o.shadow, width: Math.max(4, o.size * 0.07), join: 'round' as const } } : {}),
      wordWrap: false,
      ...shadowOf(o),
    },
  });
  text.anchor.set(o.anchorX ?? 0.5, 0.5);
  text.alpha = o.alpha ?? 1;
  return text;
}

/**
 * A word in the frame's colours and finish. `lit`: the word being sung, in the accent; in the box finish it sits on a
 * rounded box of the accent instead, in letters readable on it. Placed by its middle (or its left edge, `anchorX: 0`).
 */
export function finishedWord(label: string, o: Omit<TextOpts, 'color' | 'shadow' | 'finish' | 'glow' | 'flat'>, frame: TypeFrame, lit = false): Container {
  const finish = frame.finish ?? 'solid';
  const boxed = lit && finish === 'box';
  const text = makeText(label, {
    ...o,
    color: boxed ? frame.onAccent ?? frame.shadow : lit ? frame.accent : frame.ink,
    shadow: frame.shadow,
    finish: boxed ? 'solid' : finish,
    glow: lit ? frame.ink : frame.accent,
    flat: boxed,
  });
  if (!boxed) return text;
  const holder = new Container();
  const width = measure(o.face, o.size, label);
  const padX = o.size * 0.16;
  const box = new Graphics();
  const left = (o.anchorX ?? 0.5) === 0 ? -padX : -width / 2 - padX;
  box.roundRect(left, -o.size * 0.56, width + padX * 2, o.size * 1.1, o.size * 0.18);
  box.fill({ color: frame.accent });
  holder.addChild(box, text);
  holder.alpha = text.alpha;
  text.alpha = 1;
  return holder;
}

export function activeIndex(words: readonly TimedWord[], ms: number): number {
  let index = -1;
  words.forEach((word, i) => { if (word.startMs <= ms) index = i; });
  return index;
}
