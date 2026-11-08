/**
 * Lyric type system — six trend styles, driven by word-level timing.
 * Deterministic: output depends only on the frame inputs (shelf and cloud agree).
 *
 *  typewriter  characters appear with a blinking caret
 *  karaoke     whole line visible, words light up as they are sung
 *  stack       one huge word at a time, slamming in
 *  minimal     quiet lowercase subtitle, line by line
 *  editorial   serif italic, lines slide up through a mask
 *  outline     hollow letters that fill as each word lands
 */
import { Container, Graphics, Text } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import type { AdFont } from './ad-fonts';
import { textMeasureCtx } from './pack-text';

export const TYPE_STYLES = ['typewriter', 'karaoke', 'stack', 'minimal', 'editorial', 'outline'] as const;
export type TypeStyleId = (typeof TYPE_STYLES)[number];

export type TimedWord = { text: string; startMs: number; endMs: number };

export type TypeFrame = {
  ms: number;
  words: readonly TimedWord[];
  beat: number;
  energy: number;
  ink: string;
  accent: string;
  /** Opposite of ink: used for the soft shadow that keeps type readable on busy images. */
  shadow: string;
  /** Display fonts picked by the brain for the kinetic styles. */
  font: AdFont;
  fontSecondary: AdFont;
};

type Face = { family: string; weight: number; italic?: boolean };

/** Fonts that are fixed by the style (mood-specific, not random). */
const FACES: Record<TypeStyleId, (frame: TypeFrame) => Face> = {
  typewriter: () => ({ family: 'Space Mono', weight: 700 }),
  karaoke: f => ({ family: f.font, weight: 400 }),
  stack: f => ({ family: f.fontSecondary, weight: 400 }),
  minimal: () => ({ family: 'Outfit', weight: 400 }),
  editorial: () => ({ family: 'Playfair Display', weight: 700, italic: true }),
  outline: f => ({ family: f.font, weight: 400 }),
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);

function caseFor(style: TypeStyleId, text: string): string {
  switch (style) {
    case 'karaoke':
    case 'stack':
    case 'outline':
      return text.toLocaleUpperCase();
    case 'minimal':
      return text.toLocaleLowerCase();
    case 'editorial':
      return text.charAt(0).toLocaleUpperCase() + text.slice(1);
    default:
      return text;
  }
}

function fontString(face: Face, size: number): string {
  return `${face.italic ? 'italic ' : ''}${face.weight} ${size}px "${face.family}"`;
}

function measure(face: Face, size: number, text: string): number {
  const ctx = textMeasureCtx();
  ctx.font = fontString(face, size);
  return ctx.measureText(text).width;
}

type Item = { index: number; text: string; x: number; w: number };
type Line = { items: Item[]; width: number };
type Layout = { size: number; lines: Line[]; lineHeight: number };

/** Greedy word wrap at the largest size that fits `maxLines` × `maxWidth`. */
function layoutWords(
  words: readonly string[],
  face: Face,
  start: number,
  maxWidth: number,
  maxLines: number,
  lineGap: number,
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
      for (const line of lines) for (const item of line.items) item.x -= line.width / 2;
      return { size, lines, lineHeight: size * lineGap };
    }
    size = Math.max(28, size - 6);
  }
}

type TextOpts = {
  size: number;
  color: string;
  face: Face;
  alpha?: number;
  anchorX?: number;
  stroke?: { color: string; width: number };
  hollow?: boolean;
};

let shadowColor = '#000000';

function makeText(label: string, o: TextOpts): Text {
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
      ...(o.hollow ? {} : { dropShadow: { color: shadowColor, alpha: 0.42, blur: 10, distance: 3, angle: Math.PI / 2 } }),
    },
  });
  text.anchor.set(o.anchorX ?? 0.5, 0.5);
  text.alpha = o.alpha ?? 1;
  return text;
}

function activeIndex(words: readonly TimedWord[], ms: number): number {
  let index = -1;
  words.forEach((word, i) => { if (word.startMs <= ms) index = i; });
  return index;
}

export type TypeLayer = {
  root: Container;
  paint(style: TypeStyleId, frame: TypeFrame): void;
  destroy(): void;
};

export function createTypeLayer(): TypeLayer {
  const root = new Container();

  function clear() {
    while (root.children.length) {
      const child = root.children[0];
      root.removeChild(child);
      child.destroy({ children: true });
    }
  }

  function karaoke(frame: TypeFrame, style: TypeStyleId) {
    const face = FACES[style](frame);
    const labels = frame.words.map(w => caseFor(style, w.text));
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
        const t = makeText(item.text, {
          size: fit.size,
          face,
          color: isActive ? frame.accent : frame.ink,
          alpha: started ? 1 : 0.3,
        });
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
        const t = makeText(text, { size: fit.size, face, color: frame.ink, anchorX: 0 });
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
      bar.rect(at.x + fit.size * 0.06, at.y - fit.size * 0.46, Math.max(6, fit.size * 0.1), fit.size * 0.92);
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
    const label = caseFor('stack', word.text);
    const size = Math.min(380, (920 / Math.max(1, measure(face, 100, label))) * 100);
    const slam = 1 + 0.28 * (1 - easeOut((frame.ms - word.startMs) / 150));
    const group = new Container();
    const main = makeText(label, { size, face, color: frame.ink });
    main.scale.set(slam);
    group.addChild(main);

    const barW = measure(face, size, label) * easeOut((frame.ms - word.startMs) / Math.max(120, word.endMs - word.startMs));
    const bar = new Graphics();
    bar.rect(-measure(face, size, label) / 2, size * 0.58, barW, Math.max(10, size * 0.05));
    bar.fill({ color: frame.accent });
    group.addChild(bar);

    // Previous words, smaller and fading, stacked above.
    for (let k = 1; k <= 2; k++) {
      const prev = frame.words[active - k];
      if (!prev) break;
      const t = makeText(caseFor('stack', prev.text), {
        size: Math.max(44, size * (k === 1 ? 0.34 : 0.24)),
        face,
        color: frame.ink,
        alpha: k === 1 ? 0.42 : 0.2,
      });
      t.position.set(0, -size * (0.62 + k * 0.3));
      group.addChild(t);
    }
    group.position.set(WIDTH / 2, HEIGHT * 0.48);
    group.scale.set(1 + frame.beat * 0.025 * Math.max(0.4, frame.energy));
    root.addChild(group);
  }

  function minimal(frame: TypeFrame) {
    const face = FACES.minimal(frame);
    const labels = frame.words.map(w => caseFor('minimal', w.text));
    const fit = layoutWords(labels, face, 80, 820, 3, 1.4);
    const start = frame.words[0]?.startMs ?? 0;
    const group = new Container();
    const total = fit.lines.length * fit.lineHeight;
    fit.lines.forEach((line, row) => {
      const y = (row + 0.5) * fit.lineHeight - total / 2;
      const lead = Math.min(...line.items.map(item => frame.words[item.index].startMs), start + row * 220);
      const a = easeOut((frame.ms - lead) / 360);
      for (const item of line.items) {
        const t = makeText(item.text, { size: fit.size, face, color: frame.ink, alpha: a });
        t.position.set(item.x + item.w / 2, y + (1 - a) * 14);
        group.addChild(t);
      }
    });
    const rule = new Graphics();
    const ruleA = easeOut((frame.ms - start) / 500);
    rule.rect(-48, -total / 2 - fit.size * 0.95, 96 * ruleA, 4);
    rule.fill({ color: frame.accent, alpha: ruleA });
    group.addChild(rule);
    group.position.set(WIDTH / 2, HEIGHT * 0.68);
    root.addChild(group);
  }

  function editorial(frame: TypeFrame) {
    const face = FACES.editorial(frame);
    const labels = frame.words.map(w => caseFor('editorial', w.text));
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
        const t = makeText(item.text, {
          size: fit.size,
          face,
          color: item.index === active ? frame.accent : frame.ink,
        });
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
    const ruleW = 520 * easeOut((frame.ms - start) / 600);
    const rules = new Graphics();
    rules.rect(-ruleW / 2, -total / 2 - fit.size * 0.7, ruleW, 3);
    rules.rect(-ruleW / 2, total / 2 + fit.size * 0.62, ruleW, 3);
    rules.fill({ color: frame.accent });
    group.addChild(rules);
    group.position.set(WIDTH / 2, HEIGHT * 0.5);
    root.addChild(group);
  }

  function outline(frame: TypeFrame) {
    const face = FACES.outline(frame);
    const labels = frame.words.map(w => caseFor('outline', w.text));
    const fit = layoutWords(labels, face, 170, 900, 3, 0.96);
    const active = activeIndex(frame.words, frame.ms);
    const total = fit.lines.length * fit.lineHeight;
    const group = new Container();
    fit.lines.forEach((line, row) => {
      const y = (row + 0.5) * fit.lineHeight - total / 2;
      for (const item of line.items) {
        const word = frame.words[item.index];
        const filled = frame.ms >= word.startMs;
        const flash = item.index === active && frame.ms - word.startMs < 140;
        const t = makeText(item.text, {
          size: fit.size,
          face,
          color: flash ? frame.accent : frame.ink,
          hollow: !filled,
          stroke: { color: flash ? frame.accent : frame.ink, width: Math.max(4, fit.size * 0.035) },
        });
        t.position.set(item.x + item.w / 2, y);
        group.addChild(t);
      }
    });
    group.position.set(WIDTH / 2, HEIGHT * 0.5);
    group.scale.set(1 + frame.beat * 0.03 * Math.max(0.4, frame.energy));
    root.addChild(group);
  }

  return {
    root,
    paint(style, frame) {
      clear();
      shadowColor = frame.shadow;
      if (!frame.words.length) return;
      switch (style) {
        case 'typewriter': typewriter(frame); break;
        case 'karaoke': karaoke(frame, 'karaoke'); break;
        case 'stack': stack(frame); break;
        case 'minimal': minimal(frame); break;
        case 'editorial': editorial(frame); break;
        case 'outline': outline(frame); break;
      }
    },
    destroy() {
      clear();
      root.destroy({ children: true });
    },
  };
}
