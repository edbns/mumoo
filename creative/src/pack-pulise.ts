/**
 * Pulise — full-screen neon colour cut hard on every beat, one big word at a time. Every cut is a flat field and
 * type in another strong neon of the card's set; a strong beat (a downbeat, or a loud moment) opens its cut with
 * the field and type swapped for a split second. Colour only ever changes on the beat (never on lyric timing or
 * meaning) and never more than three times a second, which keeps it clear of the photosensitivity limit that ad
 * platforms and viewers care about. Every frame is a pure function of the music and the frame number.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { HEIGHT, WIDTH, type ImpactMusic } from './composition';
import { META_SAFE_BOTTOM } from './ad-punch';
import { fitPackLines } from './pack-text';
import type { PackSceneInput } from './pack-copy';
import { puliseColours } from './pulise-palettes';

/** Beats closer than this (over 176 BPM) change the field every second beat: at most three cuts a second. */
const MIN_CUT_MS = 340;

/** Which cut the field is on. Past 176 BPM every second beat cuts, so it never flashes more than three times a second. */
export function puliseCuts(beatIndex: number, beatGapMs: number, start = 0) {
  return start + (beatGapMs > 0 && beatGapMs < MIN_CUT_MS ? Math.floor(beatIndex / 2) : beatIndex);
}

/** When the current cut began, how long ago that was, and how long it lasts (0 before the song has a beat to measure by). */
export function cutSpan(beatsMs: readonly number[], beatIndex: number, beatGapMs: number, ms: number) {
  const halved = beatGapMs > 0 && beatGapMs < MIN_CUT_MS;
  const first = halved ? beatIndex - (beatIndex % 2) : beatIndex;
  const startMs = first > 0 ? beatsMs[first - 1] : 0;
  const endMs = beatsMs[first + (halved ? 2 : 1) - 1] ?? startMs + beatGapMs * (halved ? 2 : 1);
  return { startMs, ageMs: ms - startMs, lengthMs: beatGapMs > 0 ? endMs - startMs : 0 };
}

/** A cut counts as a surge when the song is this much louder at its beat than over the two seconds before. */
const SURGE = 1.35;
const SURGE_WINDOW_MS = 2000;
/** How far a downbeat may sit from the beat it belongs to. */
const DOWNBEAT_TOLERANCE_MS = 60;

function surged(music: ImpactMusic, ms: number) {
  const before = music.energy.filter(point => point.timeMs <= ms && point.timeMs > ms - SURGE_WINDOW_MS);
  if (!before.length) return false;
  const mean = before.reduce((sum, point) => sum + point.rms, 0) / before.length;
  return before[before.length - 1].rms >= mean * SURGE;
}

/** A strong beat is a downbeat inside the cut or a surge of loudness as it begins: nothing but the music decides. */
export function strongCut(music: ImpactMusic | null, startMs: number, lengthMs: number) {
  if (!music) return false;
  const first = startMs - DOWNBEAT_TOLERANCE_MS;
  return Boolean(music.downbeatsMs?.some(ms => ms >= first && ms < startMs + lengthMs - DOWNBEAT_TOLERANCE_MS)) || surged(music, startMs);
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
      if (!input.pulise) throw new Error('Pulise needs its look.');
      const cut = puliseCuts(input.beatIndex, input.beatGapMs, input.layout.cut);
      const span = cutSpan(input.music?.beatsMs ?? [], input.beatIndex, input.beatGapMs, input.ms);
      const phase = puliseColours(input.pulise.neon, cut, span.ageMs, span.lengthMs, strongCut(input.music, span.startMs, span.lengthMs));
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
