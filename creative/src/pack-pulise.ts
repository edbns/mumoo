/**
 * Pulise — neon colour cut hard on every beat, one big word at a time, with sticker shapes (lips, monster heads,
 * eyes, stars...) popping in and out between the cuts. The field only changes on the beat (never on lyric timing)
 * and never faster than three times a second, which keeps it clear of the photosensitivity limit that ad
 * platforms and viewers care about. Palette, ground and stickers come from the card's `PuliseLook`; every frame is
 * a pure function of the music and the frame number.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { META_SAFE_BOTTOM } from './ad-punch';
import { energyAt } from './lyric-motion';
import { fitPackLines } from './pack-text';
import type { PackSceneInput } from './pack-copy';
import { drawGround } from './pulise-ground';
import { popScale, popsAt, type Pop } from './pulise-pops';
import { puliseCut } from './pulise-palettes';
import { drawSticker } from './pulise-stickers';

/** Beats closer than this (over 176 BPM) change the field every second beat: at most three cuts a second. */
const MIN_CUT_MS = 340;
/** Most stickers on screen at once (see `popsAt`). */
const MAX_POPS = 3;
const SPARK_MS = 220;
const SPARKS = 9;

/** Which cut the field is on. Past 176 BPM every second beat cuts, so it never flashes more than three times a second. */
export function puliseCuts(beatIndex: number, beatGapMs: number, start = 0) {
  return start + (beatGapMs > 0 && beatGapMs < MIN_CUT_MS ? Math.floor(beatIndex / 2) : beatIndex);
}

/** When the current cut began, how long ago that was, and how long the cut lasts (0 before the song has two beats). */
export function cutSpan(beatsMs: readonly number[], beatIndex: number, beatGapMs: number, ms: number) {
  const halved = beatGapMs > 0 && beatGapMs < MIN_CUT_MS;
  const first = halved ? beatIndex - (beatIndex % 2) : beatIndex;
  const startMs = first > 0 ? beatsMs[first - 1] : 0;
  return { startMs, ageMs: ms - startMs, lengthMs: halved ? beatGapMs * 2 : beatGapMs };
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
  const sparks = new Graphics();
  const stickers = Array.from({ length: MAX_POPS }, () => new Graphics());
  const lyrics = new Container();
  root.addChild(field, sparks, ...stickers, lyrics);

  /** Short lines thrown off a sticker as it lands, like a comic impact. */
  function throwSparks(pops: readonly Pop[]) {
    sparks.clear();
    for (const pop of pops) {
      const t = pop.ageMs / SPARK_MS;
      if (t >= 1) continue;
      for (let i = 0; i < SPARKS; i++) {
        const angle = (i / SPARKS) * Math.PI * 2 + pop.tilt;
        const near = pop.radius * (1.25 + 0.35 * t);
        const far = near + pop.radius * 0.3 * (1 - t);
        sparks.moveTo(pop.x + Math.cos(angle) * near, pop.y + Math.sin(angle) * near);
        sparks.lineTo(pop.x + Math.cos(angle) * far, pop.y + Math.sin(angle) * far);
      }
      sparks.stroke({ color: pop.ink.body, width: 16, cap: 'round' });
    }
  }

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
      const { pulise } = input;
      const cut = puliseCuts(input.beatIndex, input.beatGapMs, input.layout.cut);
      const phase = puliseCut(pulise.neon, cut);
      const span = cutSpan(input.music?.beatsMs ?? [], input.beatIndex, input.beatGapMs, input.ms);
      field.clear();
      drawGround(field, pulise.ground, phase, cut, span.ageMs, input.beat);

      // Stickers pop on the cut and are gone before the next one; how many depends on the song's energy when the cut began.
      const startEnergy = input.music ? energyAt(input.music, span.startMs) : 0;
      const pops = popsAt(pulise, cut, startEnergy, span.ageMs, span.lengthMs);
      throwSparks(pops);
      stickers.forEach((art, index) => {
        const pop = pops[index];
        art.visible = Boolean(pop);
        if (!pop) return;
        art.clear();
        const radius = pop.radius * popScale(pop) * (1 + input.beat * 0.08);
        drawSticker(art, pop.id, pop.ink, { hit: input.beat, ageMs: pop.ageMs, variant: pop.variant, gaze: pop.gaze + Math.sin(pop.ageMs * 0.006) * 0.4 }, radius);
        art.position.set(pop.x, pop.y);
        art.rotation = pop.tilt + Math.sin(pop.ageMs * 0.012) * 0.04;
      });

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
