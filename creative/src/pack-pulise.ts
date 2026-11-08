/**
 * Pulise — neon red and neon white cut hard on every beat, one big word at a time.
 * The field only changes on the beat (never on lyric timing) and never faster than three times a second,
 * which keeps it clear of the photosensitivity limit that ad platforms and viewers care about.
 * The signature colours are fixed on purpose: this template is recognisable by them.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { META_SAFE_BOTTOM } from './ad-punch';
import { fitPackLines } from './pack-text';
import type { PackSceneInput } from './pack-copy';

const RED = '#ff1a2e';
const WHITE = '#fbfdff';
const BLACK = '#050506';

/** Field and type colours in turn: mostly red and white, with a black beat so the cut has room to land. */
const PHASES = [
  { field: RED, ink: WHITE, glow: '#ffd0d4' },
  { field: WHITE, ink: RED, glow: '#ff7a86' },
  { field: RED, ink: WHITE, glow: '#ffd0d4' },
  { field: BLACK, ink: RED, glow: '#ff1a2e' },
] as const;

/** Beats closer than this (over 176 BPM) change the field every second beat: at most three cuts a second. */
const MIN_CUT_MS = 340;

/** Which cut the field is on. Past 176 BPM every second beat cuts, so it never flashes more than three times a second. */
export function puliseCuts(beatIndex: number, beatGapMs: number, start = 0) {
  return start + (beatGapMs > 0 && beatGapMs < MIN_CUT_MS ? Math.floor(beatIndex / 2) : beatIndex);
}

function neonText(label: string, font: string, size: number, color: string, glow: string, alpha = 1) {
  const make = (stroke: number, strokeAlpha: number, fill: string) => new Text({
    text: label,
    style: {
      fontFamily: font, fontSize: size, fontWeight: '400', fill, align: 'center', wordWrap: false,
      stroke: stroke ? { color: glow, width: stroke, join: 'round' } : undefined,
    },
    anchor: 0.5,
    alpha: alpha * strokeAlpha,
  });
  return [make(26, 0.16, color), make(11, 0.34, color), make(0, 1, color)];
}

export type PuliseWorld = {
  root: Container;
  update(input: PackSceneInput): void;
  destroy(): void;
};

export function createPuliseWorld(): PuliseWorld {
  const root = new Container();
  const field = new Graphics();
  const lyrics = new Container();
  root.addChild(field, lyrics);

  function clearLyrics() {
    while (lyrics.children.length) {
      const child = lyrics.children[0];
      lyrics.removeChild(child);
      child.destroy();
    }
  }

  return {
    root,
    update(input) {
      const phase = PHASES[puliseCuts(input.beatIndex, input.beatGapMs, input.layout.cut) % PHASES.length];
      field.clear();
      field.rect(0, 0, WIDTH, HEIGHT);
      field.fill({ color: phase.field });

      clearLyrics();
      // Between two sung words the last one stays up, so a pause never shrinks the whole line onto the screen.
      const word = input.word || input.words.filter(item => item.startMs <= input.ms).at(-1)?.text || input.words[0]?.text || input.phrase;
      // One word on one line: long words shrink to fit the width instead of breaking.
      const fit = fitPackLines(word, input.font, 560, 940, 1);
      const hit = input.beat;
      const big = new Container();
      big.position.set(
        WIDTH / 2 + Math.sin(input.frame * 91) * hit * 12,
        Math.min(HEIGHT * 0.45, META_SAFE_BOTTOM - 260) + Math.cos(input.frame * 57) * hit * 8,
      );
      big.scale.set((0.94 + input.wordEnter * 0.08 + hit * 0.12) * input.layout.scaleBias);
      big.rotation = input.layout.rotate * 0.5;
      fit.lines.forEach((line, i) => {
        const y = (i - (fit.lines.length - 1) / 2) * fit.size * 0.92;
        for (const layer of neonText(line, input.font, fit.size, phase.ink, phase.glow)) {
          layer.position.set(0, y);
          big.addChild(layer);
        }
      });
      lyrics.addChild(big);

      // The rest of the line, small, so the word always sits in its sentence.
      if (input.phrase && input.phrase !== word) {
        const context = fitPackLines(input.phrase, input.fontSecondary, 64, 900, 3);
        const small = new Container();
        small.position.set(WIDTH / 2, Math.min(HEIGHT * 0.74, META_SAFE_BOTTOM - 70));
        context.lines.forEach((line, i) => {
          const text = neonText(line, input.fontSecondary, context.size, phase.ink, phase.glow, 0.82)[2];
          text.position.set(0, (i - (context.lines.length - 1) / 2) * context.size * 1.05);
          small.addChild(text);
        });
        lyrics.addChild(small);
      }
    },
    destroy() {
      clearLyrics();
      root.destroy({ children: true });
    },
  };
}
