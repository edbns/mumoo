/**
 * Color Slam — modern Meta Reels plate.
 * Full-bleed color + kinetic lyrics (scale / slam / flash). No grain, no halftone.
 * Diversity is intentional: field layout, flash mode, type motion, type treatment,
 * font, and palette all vary per slot seed so cards don't twin.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { META_SAFE_BOTTOM } from './ad-punch';
import { hashPick } from './ad-fonts';
import { fitPackLines } from './pack-text';
import type { PackSceneInput } from './pack-copy';

type FieldMode = 'solid' | 'split-h' | 'split-v' | 'band' | 'corner';
type FlashMode = 'invert' | 'accent' | 'pulse' | 'hold';
type MotionMode = 'scale' | 'slam' | 'flash' | 'rise';
type TypeMode = 'flat' | 'duo' | 'slab' | 'ghost';

function makeText(label: string, font: string, size: number, color: string, alpha = 1) {
  const text = new Text({
    text: label,
    style: {
      fontFamily: font,
      fontSize: size,
      fontWeight: '400',
      fill: color,
      align: 'center',
      wordWrap: false,
    },
  });
  text.anchor.set(0.5);
  text.alpha = alpha;
  return text;
}

function slotSeed(input: PackSceneInput) {
  const style = input.style ?? 'slam';
  return `${style}:${input.palette.bg}:${input.palette.accent}:${input.font}:${input.layout.scaleBias.toFixed(3)}`;
}

export type SlamWorld = {
  root: Container;
  update(input: PackSceneInput): void;
  destroy(): void;
};

export function createSlamWorld(): SlamWorld {
  const root = new Container();
  const plate = new Graphics();
  const lyrics = new Container();
  root.addChild(plate, lyrics);

  function clearLyrics() {
    while (lyrics.children.length) {
      const child = lyrics.children[0];
      lyrics.removeChild(child);
      child.destroy();
    }
  }

  return {
    root,
    update(input: PackSceneInput) {
      const seed = slotSeed(input);
      // Brain picks motion on the slot; style only pins field family for slam-split.
      const fieldMode = (input.style === 'slam-split'
        ? (['split-h', 'split-v', 'band'] as const)[hashPick(seed, 'field', 3)]
        : (['solid', 'split-h', 'split-v', 'band', 'corner'] as const)[hashPick(seed, 'field', 5)]) as FieldMode;
      const flashMode = (input.motion === 'flash'
        ? 'invert'
        : (['invert', 'accent', 'pulse', 'hold'] as const)[hashPick(seed, 'flash', 4)]) as FlashMode;
      const motionMode = (input.motion ?? 'scale') as MotionMode;
      const typeMode = (['flat', 'duo', 'slab', 'ghost'] as const)[hashPick(seed, 'type', 4)] as TypeMode;
      const showHot = hashPick(seed, 'hot', 10) < 4; // ~40% — not every card
      const lift = input.beat;
      const hit = lift > 0.35;

      const a = input.palette.bg;
      const b = input.palette.accent;
      const ink = input.palette.ink;
      // Flash: swap / punch colors on the beat
      let fieldA = a;
      let fieldB = b;
      let typeColor = ink;
      if (flashMode === 'invert' && hit) {
        fieldA = b;
        fieldB = a;
        typeColor = input.palette.wash || a;
      } else if (flashMode === 'accent' && hit) {
        fieldA = b;
        fieldB = b;
        typeColor = ink;
      } else if (flashMode === 'pulse') {
        // Soft — no hard invert; type punches instead
        fieldA = a;
        fieldB = b;
        typeColor = ink;
      }

      plate.clear();
      if (fieldMode === 'solid') {
        plate.rect(0, 0, WIDTH, HEIGHT);
        plate.fill({ color: fieldA });
      } else if (fieldMode === 'split-h') {
        plate.rect(0, 0, WIDTH, HEIGHT / 2);
        plate.fill({ color: fieldA });
        plate.rect(0, HEIGHT / 2, WIDTH, HEIGHT / 2);
        plate.fill({ color: fieldB });
      } else if (fieldMode === 'split-v') {
        plate.rect(0, 0, WIDTH / 2, HEIGHT);
        plate.fill({ color: fieldA });
        plate.rect(WIDTH / 2, 0, WIDTH / 2, HEIGHT);
        plate.fill({ color: fieldB });
      } else if (fieldMode === 'band') {
        plate.rect(0, 0, WIDTH, HEIGHT);
        plate.fill({ color: fieldA });
        const bandH = HEIGHT * (0.22 + lift * 0.08);
        plate.rect(0, HEIGHT * 0.38 - bandH / 2, WIDTH, bandH);
        plate.fill({ color: fieldB });
      } else {
        plate.rect(0, 0, WIDTH, HEIGHT);
        plate.fill({ color: fieldA });
        plate.rect(0, 0, WIDTH * 0.42, HEIGHT * 0.32);
        plate.fill({ color: fieldB });
        plate.rect(WIDTH * 0.55, HEIGHT * 0.68, WIDTH * 0.45, HEIGHT * 0.32);
        plate.fill({ color: fieldB });
      }

      clearLyrics();
      const fit = fitPackLines(input.phrase, input.font, 160, 920, 4);
      const group = new Container();

      // Kinetic motion — lyrics are the star
      let scale = input.layout.scaleBias;
      let yOff = 0;
      let alpha = 1;
      if (motionMode === 'scale') {
        scale *= 1 + lift * 0.22;
      } else if (motionMode === 'slam') {
        scale *= hit ? 1.18 + lift * 0.12 : 0.92;
        yOff = hit ? 0 : 18;
      } else if (motionMode === 'flash') {
        scale *= 1 + lift * 0.1;
        alpha = hit ? 1 : 0.72 + input.energy * 0.15;
        if (hit) typeColor = flashMode === 'hold' ? b : typeColor;
      } else {
        // rise
        scale *= 1 + lift * 0.08;
        yOff = (1 - Math.min(1, lift * 1.4 + input.wordEnter)) * 70;
        alpha = 0.55 + Math.min(0.45, lift * 0.7 + input.wordEnter * 0.3);
      }
      if (flashMode === 'pulse') {
        scale *= 1 + lift * 0.06;
      }

      group.position.set(WIDTH / 2, Math.min(HEIGHT * 0.48, META_SAFE_BOTTOM - 120) + yOff);
      group.scale.set(scale);
      group.alpha = alpha;
      group.rotation = input.layout.rotate * 0.4;

      if (typeMode === 'slab') {
        const slab = new Graphics();
        const h = fit.lines.length * fit.size * 0.92 + 52;
        slab.rect(-480, -h / 2, 960, h);
        slab.fill({ color: typeColor === ink ? b : ink, alpha: 0.95 });
        group.addChild(slab);
        typeColor = typeColor === ink ? (input.palette.wash || a) : ink;
      }

      const lineColor = typeMode === 'ghost' ? b : typeColor;
      fit.lines.forEach((line, i) => {
        const y = (i - (fit.lines.length - 1) / 2) * fit.size * 0.9;
        if (typeMode === 'duo') {
          const under = makeText(line, input.font, fit.size, b, 0.9);
          under.position.set(5, y + 6);
          group.addChild(under);
        }
        const main = makeText(line, input.font, fit.size, typeMode === 'duo' ? ink : lineColor, typeMode === 'ghost' ? 0.85 : 1);
        main.position.set(0, y);
        group.addChild(main);
      });

      if (showHot && input.word && input.word !== input.phrase) {
        const hot = makeText(
          input.word,
          input.fontSecondary,
          Math.max(44, fit.size * 0.32),
          typeMode === 'slab' ? b : b,
          0.8 + input.wordEnter * 0.2,
        );
        hot.position.set(0, fit.lines.length * fit.size * 0.42 + (1 - input.wordEnter) * 20);
        group.addChild(hot);
      }

      lyrics.addChild(group);
    },
    destroy() {
      clearLyrics();
      root.destroy({ children: true });
    },
  };
}
