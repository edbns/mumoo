/**
 * The locked lyric styles: each has its own face, colours and motion, the same on every card and every song.
 * Over a picture the colours are the style's own (white with a dark edge, Inked's bone and red); on a flat screen
 * (`frame.screen`) the light colours give way to the screen's ink so the words never vanish into it.
 * Deterministic like the rest of the type system: a frame depends only on its inputs.
 *
 *  clean      bold white captions with a black edge; each word pops in as it is sung
 *  brat       lowercase, narrowed, softly blurred; each word appears as it is sung
 *  subtitle   small lowercase line low on the screen on a dark pill; sung words brighten
 *  impact     one huge condensed word at a time, snapping in, punched on the beat
 *  hollow     outlined capitals that fill as each word is sung
 *  inked      worn typewriter face in bone with the sung word in red (inked-red: every word red), ink bleeding round the letters
 *  elegant    lowercase serif in warm white, letters drawing together as the line fades up
 *  scramble   monospace capitals that decode letter by letter, splitting red and cyan on the beat
 *  blur       each word comes into focus out of a blur
 *  swap       the line holds the middle of the screen and is set in another face on every beat
 */
import { BlurFilter, Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { hash01 } from './lyric-fx';
import { activeIndex, clamp01, easeOut, type TypeFrame } from './type-kit';
import type { PresetStyle } from './type-styles';

export type LockedStyle = PresetStyle | 'swap';

const RED = '#B3121B';
const RED_EDGE = '#140203';
const BONE = '#ECE4D3';
const WARM = '#F3EBDD';
const SCRAMBLE_GLYPHS = '#%&@$*+=/<>01ABXZ';

type Face = { family: string; weight?: '800'; italic?: true; letters: 'upper' | 'lower' | 'natural'; size: number; narrow?: true };

const SWAP_FACES: readonly Face[] = [
  { family: 'Anton', letters: 'upper', size: 0.13 },
  { family: 'Instrument Serif', italic: true, letters: 'lower', size: 0.125 },
  { family: 'TikTok Sans', weight: '800', letters: 'natural', size: 0.09 },
  { family: 'JetBrains Mono', weight: '800', letters: 'upper', size: 0.072 },
  { family: 'Archivo Black', letters: 'upper', size: 0.085 },
  { family: 'Arimo', letters: 'lower', size: 0.105, narrow: true },
];

/** The font families each style draws with, so they can be fetched before the first frame. */
export const LOCKED_FAMILIES: Record<LockedStyle, readonly string[]> = {
  clean: ['TikTok Sans'],
  brat: ['Arimo'],
  subtitle: ['TikTok Sans'],
  impact: ['Anton'],
  hollow: ['Archivo Black'],
  inked: ['Special Elite'],
  'inked-red': ['Special Elite'],
  elegant: ['Instrument Serif'],
  scramble: ['JetBrains Mono'],
  blur: ['TikTok Sans'],
  swap: [...new Set(SWAP_FACES.map(face => face.family))],
};

const setLetters = (text: string, letters: Face['letters']) =>
  letters === 'upper' ? text.toLocaleUpperCase() : letters === 'lower' ? text.toLocaleLowerCase() : text;

const easeBack = (v: number) => {
  const x = clamp01(v) - 1;
  return 1 + 2.9 * x ** 3 + 1.9 * x ** 2;
};

function word(text: string, style: TextStyleOptions): Text {
  const piece = new Text({ text, style: { ...style, wordWrap: false } });
  piece.anchor.set(0.5);
  return piece;
}

type Laid = { pieces: Text[]; spots: { x: number; y: number }[]; rows: number; size: number };

/**
 * The line's words at the largest size up to `size` that fits `maxRows` rows of `maxWidth`, wrapped and centred on (0, 0).
 * `build` makes word `i` at a size; `narrow` squeezes every word across.
 */
function lay(count: number, build: (i: number, size: number) => Text, o: { size: number; gap: number; row: number; maxWidth: number; maxRows: number; narrow?: number }): Laid {
  let size = o.size;
  for (;;) {
    const pieces = Array.from({ length: count }, (_, i) => build(i, size));
    if (o.narrow) for (const piece of pieces) piece.scale.x = o.narrow;
    const widths = pieces.map(piece => piece.width);
    const gap = size * o.gap;
    const rows: number[][] = [[]];
    let width = 0;
    widths.forEach((w, i) => {
      const row = rows[rows.length - 1];
      if (row.length && width + gap + w > o.maxWidth) { rows.push([i]); width = w; } else { row.push(i); width += (row.length > 1 ? gap : 0) + w; }
    });
    const widest = Math.max(0, ...rows.map(row => row.reduce((sum, i) => sum + widths[i], 0) + gap * (row.length - 1)));
    if ((rows.length <= o.maxRows && widest <= o.maxWidth) || size <= o.size * 0.4) {
      const spots: { x: number; y: number }[] = [];
      rows.forEach((row, r) => {
        let x = -(row.reduce((sum, i) => sum + widths[i], 0) + gap * (row.length - 1)) / 2;
        for (const i of row) {
          spots[i] = { x: x + widths[i] / 2, y: (r - (rows.length - 1) / 2) * size * o.row };
          x += widths[i] + gap;
        }
      });
      return { pieces, spots, rows: rows.length, size };
    }
    for (const piece of pieces) piece.destroy();
    size *= 0.9;
  }
}

export type PresetPainter = { paint(style: LockedStyle, frame: TypeFrame): Container; destroy(): void };

export function createPresetPainter(): PresetPainter {
  // Filters are kept and reused frame after frame; only their strength changes.
  const softBlur = new BlurFilter({ strength: 2.7, quality: 3 });
  const bleedBlur = new BlurFilter({ strength: 4.2, quality: 3 });
  const focus = new Map<number, BlurFilter>();
  const focusAt = (i: number) => {
    let filter = focus.get(i);
    if (!filter) focus.set(i, filter = new BlurFilter({ strength: 0, quality: 4 }));
    return filter;
  };

  function paint(style: LockedStyle, frame: TypeFrame): Container {
    const group = new Container();
    const words = frame.words;
    if (!words.length) return group;
    const over = !frame.screen;
    const light = over ? '#ffffff' : frame.ink;
    const shade = (alpha: number, blur: number, distance = 0) => over ? { dropShadow: { color: '#000000', alpha, blur, distance, angle: Math.PI / 2 } } : {};
    const age = (i: number) => frame.ms - words[i].startMs;
    const lineStart = words[0].startMs - 120;
    const active = activeIndex(words, frame.ms);
    group.position.set(WIDTH / 2, HEIGHT * 0.5);

    const place = (laid: Laid, keep: (piece: Text, i: number) => boolean, into: Container = group) => {
      laid.pieces.forEach((piece, i) => {
        if (!keep(piece, i)) { piece.destroy(); return; }
        piece.position.set(laid.spots[i].x, laid.spots[i].y);
        into.addChild(piece);
      });
    };

    switch (style) {
      case 'clean': {
        const laid = lay(words.length, (i, size) => word(words[i].text, {
          fontFamily: 'TikTok Sans', fontWeight: '800', fontSize: size, fill: light,
          ...(over ? { stroke: { color: '#000000', width: size * 0.13, join: 'round' as const } } : {}), ...shade(0.35, 12, 9),
        }), { size: WIDTH * 0.088, gap: 0.28, row: 1.15, maxWidth: WIDTH * 0.84, maxRows: 4 });
        place(laid, (piece, i) => {
          const t = age(i);
          if (t < 0) return false;
          piece.scale.set(t < 160 ? 0.8 + 0.2 * easeBack(t / 160) : 1);
          piece.alpha = clamp01(t / 50);
          return true;
        });
        break;
      }
      case 'brat': {
        const laid = lay(words.length, (i, size) => word(words[i].text.toLocaleLowerCase(), {
          fontFamily: 'Arimo', fontWeight: '400', fontSize: size, fill: light, ...shade(0.3, 30),
        }), { size: WIDTH * 0.1, gap: 0.22, row: 1.02, maxWidth: WIDTH * 0.78, maxRows: 4, narrow: 0.85 });
        const soft = new Container();
        soft.filters = [softBlur];
        place(laid, (_, i) => age(i) >= 0, soft);
        group.addChild(soft);
        break;
      }
      case 'subtitle': {
        const laid = lay(words.length, (i, size) => word(words[i].text.toLocaleLowerCase(), {
          fontFamily: 'TikTok Sans', fontWeight: '600', fontSize: size, fill: light,
        }), { size: WIDTH * 0.052, gap: 0.3, row: 1.3, maxWidth: WIDTH * 0.78, maxRows: 3 });
        const fade = clamp01((frame.ms - lineStart) / 150);
        group.position.set(WIDTH / 2, HEIGHT * 0.8);
        if (over) {
          const widest = Math.max(...laid.spots.map((spot, i) => Math.abs(spot.x) + laid.pieces[i].width / 2)) * 2;
          const height = laid.rows * laid.size * 1.3 + laid.size * 0.8;
          const pill = new Graphics()
            .roundRect(-widest / 2 - laid.size * 0.8, -height / 2, widest + laid.size * 1.6, height, Math.min(height / 2, laid.size * 1.1))
            .fill({ color: 0x000000, alpha: 0.55 });
          pill.alpha = fade;
          group.addChild(pill);
        }
        place(laid, (piece, i) => {
          piece.alpha = fade * (age(i) >= 0 ? 1 : 0.5);
          return true;
        });
        break;
      }
      case 'impact': {
        if (active < 0) break;
        const size = WIDTH * 0.22;
        const piece = word(words[active].text.toLocaleUpperCase(), { fontFamily: 'Anton', fontWeight: '400', fontSize: size, fill: light, letterSpacing: -size * 0.01, ...shade(0.4, 24) });
        const fit = Math.min(1, (WIDTH * 0.86) / piece.width);
        const t = age(active);
        const punch = (frame.beatIndex % 4 === 0 ? 0.07 : 0.025) * frame.beat;
        piece.scale.set(fit * ((t < 90 ? 1.22 - 0.22 * easeOut(t / 90) : 1) + punch));
        group.addChild(piece);
        break;
      }
      case 'hollow': {
        const base = (size: number): TextStyleOptions => ({
          fontFamily: 'Archivo Black', fontWeight: '400', fontSize: size, stroke: { color: light, width: size * 0.06, join: 'round' }, ...shade(0.55, 30),
        });
        const laid = lay(words.length, (i, size) => word(words[i].text.toLocaleUpperCase(), { ...base(size), fill: { color: light, alpha: 0 } }),
          { size: WIDTH * 0.095, gap: 0.3, row: 1.12, maxWidth: WIDTH * 0.86, maxRows: 4 });
        group.position.y += 42 * (1 - easeOut((frame.ms - lineStart) / 220));
        const shown = clamp01((frame.ms - lineStart) / 120);
        laid.pieces.forEach((piece, i) => {
          const fill = clamp01(age(i) / 80);
          piece.position.set(laid.spots[i].x, laid.spots[i].y);
          piece.alpha = shown * (1 - fill);
          group.addChild(piece);
          if (fill > 0) {
            const solid = word(words[i].text.toLocaleUpperCase(), { ...base(laid.size), fill: light });
            solid.alpha = fill;
            solid.position.copyFrom(piece.position);
            group.addChild(solid);
          }
        });
        break;
      }
      case 'inked':
      case 'inked-red': {
        const colour = (i: number) => style === 'inked-red' || i === active ? RED : over ? BONE : frame.ink;
        const ink = (i: number, size: number, bleed = false): TextStyleOptions => ({
          fontFamily: 'Special Elite', fontWeight: '400', fontSize: size, fill: colour(i),
          ...(colour(i) === RED && over ? { stroke: { color: RED_EDGE, width: size * 0.08, join: 'round' as const } } : {}),
          ...(bleed ? {} : shade(colour(i) === RED ? 0.85 : 0.5, 24, 6)),
        });
        const laid = lay(words.length, (i, size) => word(words[i].text, ink(i, size)), { size: WIDTH * 0.106, gap: 0.34, row: 1.19, maxWidth: WIDTH * 0.86, maxRows: 4 });
        const bleeding = new Container();
        bleeding.filters = [bleedBlur];
        bleeding.alpha = 0.5;
        group.addChild(bleeding);
        place(laid, (piece, i) => {
          if (age(i) < 0) return false;
          const bleed = word(words[i].text, ink(i, laid.size, true));
          bleed.position.set(laid.spots[i].x, laid.spots[i].y);
          bleeding.addChild(bleed);
          return true;
        });
        break;
      }
      case 'elegant': {
        const since = frame.ms - lineStart;
        const laid = lay(words.length, (i, size) => word(words[i].text.toLocaleLowerCase(), {
          fontFamily: 'Instrument Serif', fontWeight: '400', fontSize: size, fill: over ? WARM : frame.ink,
          letterSpacing: size * (0.03 + 0.09 * (1 - easeOut(since / 800))), ...shade(0.35, 30),
        }), { size: WIDTH * 0.105, gap: 0.26, row: 1.08, maxWidth: WIDTH * 0.82, maxRows: 4 });
        group.position.y += 36 * (1 - easeOut(since / 700));
        place(laid, (piece, i) => {
          piece.alpha = clamp01(since / 550) * (age(i) >= 0 ? 1 : 0.55);
          return true;
        });
        break;
      }
      case 'scramble': {
        const style = (size: number, fill: string): TextStyleOptions => ({ fontFamily: 'JetBrains Mono', fontWeight: '800', fontSize: size, fill });
        const labels = words.map(w => w.text.toLocaleUpperCase());
        const laid = lay(words.length, (i, size) => word(labels[i], style(size, light)), { size: WIDTH * 0.075, gap: 0.6, row: 1.25, maxWidth: WIDTH * 0.86, maxRows: 4 });
        const step = Math.floor(frame.ms / 45);
        const split = frame.beatIndex % 2 === 0 && frame.beat > 0.4 ? 10.5 * frame.beat : 0;
        place(laid, (piece, i) => {
          const t = age(i);
          if (t < 0) return false;
          const text = [...labels[i]].map((letter, j) => t > 60 + j * 28 || letter === ' ' ? letter
            : SCRAMBLE_GLYPHS[Math.floor(hash01(frame.seed, i, j, step) * SCRAMBLE_GLYPHS.length)]).join('');
          piece.text = text;
          if (split > 0 && over) {
            for (const [dx, tint] of [[-split, '#ff2a2a'], [split, '#22e6ff']] as const) {
              const ghost = word(text, style(laid.size, tint));
              ghost.blendMode = 'add';
              ghost.alpha = 0.85;
              ghost.position.set(laid.spots[i].x + dx, laid.spots[i].y);
              group.addChild(ghost);
            }
          }
          return true;
        });
        break;
      }
      case 'blur': {
        const laid = lay(words.length, (i, size) => word(words[i].text, {
          fontFamily: 'TikTok Sans', fontWeight: '700', fontSize: size, fill: light, ...shade(0.35, 24),
        }), { size: WIDTH * 0.088, gap: 0.28, row: 1.15, maxWidth: WIDTH * 0.84, maxRows: 4 });
        place(laid, (piece, i) => {
          const t = age(i) + 40;
          if (t < 0) return false;
          const sharp = easeOut(t / 280);
          if (sharp < 1) {
            const filter = focusAt(i);
            filter.strength = 36 * (1 - sharp);
            piece.filters = [filter];
          }
          piece.alpha = clamp01(t / 140);
          return true;
        });
        break;
      }
      case 'swap': {
        // A song with no beat grid still swaps, on each word as it is sung.
        const turn = frame.beatIndex > 0 ? frame.beatIndex : Math.max(0, active);
        const face = SWAP_FACES[Math.abs(frame.seed + turn) % SWAP_FACES.length];
        const laid = lay(words.length, (i, size) => word(setLetters(words[i].text, face.letters), {
          fontFamily: face.family, fontWeight: face.weight ?? '400', fontStyle: face.italic ? 'italic' : 'normal', fontSize: size, fill: light, ...shade(0.4, 24),
        }), { size: WIDTH * face.size, gap: 0.26, row: 1.12, maxWidth: WIDTH * 0.86, maxRows: 4, narrow: face.narrow ? 0.85 : undefined });
        place(laid, (_, i) => age(i) >= 0);
        break;
      }
    }
    return group;
  }

  return {
    paint,
    destroy() {
      softBlur.destroy();
      bleedBlur.destroy();
      for (const filter of focus.values()) filter.destroy();
      focus.clear();
    },
  };
}
