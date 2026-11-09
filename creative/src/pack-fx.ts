/**
 * Draws the motion type styles (bounce, wave, glitch, ...). The motion itself is in lyric-fx.ts and is pure;
 * this file only lays the words out and turns each piece's placement into Pixi objects.
 */
import { Container, Graphics } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { displayFace, setCase, type FaceStyle } from './ad-fonts';
import { buzzingWords, EXIT_MS, FX, FX_TRAITS, type FxStyleId, type Layer, type PieceInput, type Placement } from './lyric-fx';
import { activeIndex, layoutWords, makeText, measure, type TypeFrame } from './type-kit';

/** How a block style fits the lyric: the biggest size that keeps it inside `lines` × 900 px, and where it sits. */
type Block = { start: number; width: number; lines: number; gap: number; y: number; left?: true; turn?: number };
/** Styles without a block show one big word at a time instead. */
const BLOCKS: Partial<Record<FxStyleId, Block>> = {
  bounce: { start: 150, width: 900, lines: 3, gap: 1, y: 0.5 },
  wave: { start: 130, width: 900, lines: 4, gap: 1.05, y: 0.5 },
  glitch: { start: 170, width: 900, lines: 3, gap: 0.98, y: 0.5 },
  rotate: { start: 140, width: 900, lines: 3, gap: 1, y: 0.5 },
  stretch: { start: 190, width: 900, lines: 3, gap: 0.95, y: 0.5 },
  split: { start: 190, width: 900, lines: 3, gap: 0.95, y: 0.5 },
  wipe: { start: 150, width: 900, lines: 3, gap: 1, y: 0.5 },
  flicker: { start: 150, width: 900, lines: 3, gap: 1.05, y: 0.5 },
  scatter: { start: 140, width: 900, lines: 3, gap: 1, y: 0.5 },
  jitter: { start: 140, width: 880, lines: 4, gap: 1.05, y: 0.5 },
  slide: { start: 130, width: 900, lines: 4, gap: 1.05, y: 0.5 },
  tilt: { start: 160, width: 820, lines: 3, gap: 1, y: 0.5, left: true, turn: -0.1 },
};

/** Room around a piece's box so a clip never cuts off its overhang or its shadow. */
const CLIP_PAD = 0.25;

export type FxPainter = { paint(style: FxStyleId, frame: TypeFrame): Container };

export function createFxPainter(): FxPainter {
  /** Where each letter of a word sits, measured once per word and size. */
  const letterBoxes = new Map<string, { char: string; x: number; w: number }[]>();

  function letters(face: FaceStyle, size: number, label: string) {
    const key = `${face.family}|${size}|${label}`;
    let boxes = letterBoxes.get(key);
    if (!boxes) {
      const chars = Array.from(label);
      boxes = chars.map((char, k) => {
        const left = measure(face, size, chars.slice(0, k).join(''));
        return { char, x: left, w: measure(face, size, chars.slice(0, k + 1).join('')) - left };
      });
      letterBoxes.set(key, boxes);
    }
    return boxes;
  }

  function drawLayer(label: string, layer: Layer, size: number, width: number, face: FaceStyle, frame: TypeFrame) {
    const holder = new Container();
    holder.position.set(layer.dx, layer.dy);
    const text = makeText(label, {
      size,
      face,
      color: layer.tone === 'accent' ? frame.accent : frame.ink,
      shadow: frame.shadow,
      alpha: layer.alpha,
    });
    text.scale.set(layer.grow);
    holder.addChild(text);
    const { clip } = layer;
    if (clip) {
      const height = size * 1.4;
      const pad = size * CLIP_PAD;
      const left = clip.x0 <= 0 ? -width / 2 - pad : -width / 2 + clip.x0 * width;
      const right = clip.x1 >= 1 ? width / 2 + pad : -width / 2 + clip.x1 * width;
      const top = clip.y0 <= 0 ? -height / 2 - pad : -height / 2 + clip.y0 * height;
      const bottom = clip.y1 >= 1 ? height / 2 + pad : -height / 2 + clip.y1 * height;
      const mask = new Graphics();
      mask.rect(left, top, right - left, bottom - top);
      mask.fill({ color: '#ffffff' });
      holder.addChild(mask);
      text.mask = mask;
    }
    return holder;
  }

  /** One letter or word, put where its placement says. Nothing is made for a piece that is not visible. */
  function piece(label: string, at: { x: number; y: number }, width: number, p: Placement, size: number, face: FaceStyle, frame: TypeFrame) {
    if (p.alpha <= 0.01) return null;
    const node = new Container();
    node.position.set(at.x + p.x, at.y + p.y);
    node.rotation = p.rot;
    node.scale.set(p.sx, p.sy);
    node.alpha = p.alpha;
    for (const layer of p.layers) node.addChild(drawLayer(label, layer, size, width, face, frame));
    return node;
  }

  function block(style: FxStyleId, spec: Block, frame: TypeFrame) {
    const traits = FX_TRAITS[style];
    const face = displayFace(frame.font);
    const labels = frame.words.map(word => setCase(frame.font, word.text));
    const fit = layoutWords(labels, face, spec.start, spec.width, spec.lines, spec.gap, Boolean(spec.left));
    const widest = Math.max(...fit.lines.map(line => line.width));
    const active = activeIndex(frame.words, frame.ms);
    const buzz = buzzingWords(frame.words.map(word => word.startMs));
    const total = fit.lines.length * fit.lineHeight;
    const group = new Container();
    let ordinal = 0;
    fit.lines.forEach((line, row) => {
      const y = (row + 0.5) * fit.lineHeight - total / 2;
      const indent = (spec.left ? -widest / 2 : 0) + (spec.turn ? row * fit.size * 0.18 : 0);
      for (const item of line.items) {
        const word = frame.words[item.index];
        const input = (index: number, count: number): PieceInput => ({
          ms: frame.ms,
          ageMs: frame.ms - word.startMs,
          exitMs: null,
          index,
          count,
          ordinal: ordinal++,
          word: item.index,
          line: row,
          size: fit.size,
          seed: frame.seed,
          beat: frame.beat,
          beatIndex: frame.beatIndex,
          energy: frame.energy,
          active: item.index === active,
          buzz: buzz.has(item.index),
        });
        const parts = traits.unit === 'letter'
          ? letters(face, fit.size, item.text).map(box => ({ label: box.char, x: item.x + box.x + box.w / 2, w: box.w }))
          : [{ label: item.text, x: item.x + item.w / 2, w: item.w }];
        parts.forEach((part, index) => {
          const node = piece(part.label, { x: part.x + indent, y }, part.w, FX[style](input(index, parts.length)), fit.size, face, frame);
          if (node) group.addChild(node);
        });
      }
    });
    group.position.set(WIDTH / 2, HEIGHT * spec.y);
    group.rotation = spec.turn ?? 0;
    return group;
  }

  /** One big word at a time; the one it replaced is still leaving. */
  function single(style: FxStyleId, frame: TypeFrame) {
    const face = displayFace(frame.font);
    const current = Math.max(0, activeIndex(frame.words, frame.ms));
    const group = new Container();
    for (const index of [current - 1, current]) {
      const word = frame.words[index];
      if (!word) continue;
      const leaving = index < current;
      const sinceNext = frame.ms - frame.words[current].startMs;
      if (leaving && (sinceNext < 0 || sinceNext >= EXIT_MS)) continue;
      const label = setCase(frame.font, word.text);
      const width = measure(face, 100, label);
      const size = Math.min(380, (920 / Math.max(1, width)) * 100);
      const input: PieceInput = {
        ms: frame.ms,
        ageMs: frame.ms - word.startMs,
        exitMs: leaving ? sinceNext : null,
        index: 0,
        count: 1,
        ordinal: index,
        word: index,
        line: 0,
        size,
        seed: frame.seed,
        beat: frame.beat,
        beatIndex: frame.beatIndex,
        energy: frame.energy,
        active: !leaving,
        buzz: false,
      };
      const node = piece(label, { x: 0, y: 0 }, (width * size) / 100, FX[style](input), size, face, frame);
      if (node) group.addChild(node);
    }
    group.position.set(WIDTH / 2, HEIGHT * 0.48);
    return group;
  }

  return {
    paint(style, frame) {
      const spec = BLOCKS[style];
      return spec ? block(style, spec, frame) : single(style, frame);
    },
  };
}
