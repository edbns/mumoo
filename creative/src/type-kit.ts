/** Shared pieces of the lyric type styles: what a frame carries, measuring, word wrap, and drawing one piece of text. */
import { Text } from 'pixi.js';
import { cssFont, type AdFont, type FaceStyle } from './ad-fonts';
import { textMeasureCtx } from './pack-text';

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
};

export function makeText(label: string, o: TextOpts): Text {
  const text = new Text({
    text: label,
    style: {
      fontFamily: o.face.family,
      fontSize: o.size,
      fontWeight: String(o.face.weight) as '400',
      fontStyle: o.face.italic ? 'italic' : 'normal',
      fill: o.hollow ? { color: o.color, alpha: 0 } : o.color,
      ...(o.stroke ? { stroke: { color: o.stroke.color, width: o.stroke.width, join: 'round' as const } } : {}),
      wordWrap: false,
      ...(o.hollow ? {} : { dropShadow: { color: o.shadow, alpha: 0.42, blur: 10, distance: 3, angle: Math.PI / 2 } }),
    },
  });
  text.anchor.set(o.anchorX ?? 0.5, 0.5);
  text.alpha = o.alpha ?? 1;
  return text;
}

export function activeIndex(words: readonly TimedWord[], ms: number): number {
  let index = -1;
  words.forEach((word, i) => { if (word.startMs <= ms) index = i; });
  return index;
}
