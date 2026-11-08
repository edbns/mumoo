/**
 * Noir — Shaders.com FilmStock mono plate (baked offline by the Look Lab) + type.
 * If the bake is missing, show downtime copy — never a fake local film filter.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { META_SAFE_BOTTOM } from './ad-punch';
import { hashPick } from './ad-fonts';
import { fitPackLines } from './pack-text';
import type { PackSceneInput } from './pack-copy';
import { LOOK_DOWN_MESSAGE } from './pack-looks';

type TypeMode = 'flat' | 'hot' | 'slab';

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
  return `${input.palette.accent}:${input.palette.bg}:${input.font}:${input.layout.scaleBias.toFixed(3)}`;
}

export type NoirWorld = {
  root: Container;
  update(input: PackSceneInput): void;
  destroy(): void;
};

export function createNoirWorld(): NoirWorld {
  const root = new Container();
  const plate = new Container();
  const photo = new Sprite();
  photo.anchor.set(0.5);
  photo.position.set(WIDTH / 2, HEIGHT / 2);
  photo.visible = false;
  const scrim = new Graphics();
  plate.addChild(photo, scrim);

  const lyrics = new Container();
  root.addChild(plate, lyrics);

  function clearLyrics() {
    while (lyrics.children.length) {
      const child = lyrics.children[0];
      lyrics.removeChild(child);
      child.destroy();
    }
  }

  function paintDown() {
    photo.visible = false;
    scrim.clear();
    scrim.rect(0, 0, WIDTH, HEIGHT);
    scrim.fill({ color: '#0a0a0c' });
    clearLyrics();
    const lines = LOOK_DOWN_MESSAGE.split('\n');
    const group = new Container();
    group.position.set(WIDTH / 2, HEIGHT * 0.48);
    lines.forEach((line, i) => {
      const t = makeText(line, 'Inter, system-ui, sans-serif', i === 0 ? 42 : 28, '#f2f0ea', i === 0 ? 0.95 : 0.7);
      t.position.set(0, (i - (lines.length - 1) / 2) * 48);
      group.addChild(t);
    });
    lyrics.addChild(group);
  }

  return {
    root,
    update(input: PackSceneInput) {
      const lookPlate = input.lookPlateTexture;
      if (!lookPlate) {
        paintDown();
        return;
      }

      photo.texture = lookPlate;
      photo.scale.set(
        WIDTH / Math.max(1, lookPlate.width),
        HEIGHT / Math.max(1, lookPlate.height),
      );
      photo.visible = true;

      const voidBg = input.palette.bg || '#050505';
      const chalk = input.palette.ink || '#f2f0ea';
      const accent = input.palette.accent || '#e8e4dc';

      scrim.clear();
      scrim.rect(0, 0, WIDTH, HEIGHT);
      scrim.fill({ color: '#050505', alpha: 0.12 });

      const seed = slotSeed(input);
      const typeMode = (['flat', 'hot', 'slab'] as const)[hashPick(seed, 'noir-type', 3)] as TypeMode;
      const showHot = hashPick(seed, 'noir-hot', 10) < 4;

      clearLyrics();
      const fit = fitPackLines(input.phrase, input.font, 150, 900, 4);
      const scale = (1 + input.beat * 0.05) * input.layout.scaleBias;
      const group = new Container();
      group.position.set(WIDTH / 2, Math.min(HEIGHT * 0.48, META_SAFE_BOTTOM - 120));
      group.scale.set(scale);
      group.rotation = input.layout.rotate * 0.25;

      if (typeMode === 'slab') {
        const slab = new Graphics();
        const h = fit.lines.length * fit.size * 0.92 + 56;
        const w = 940;
        slab.rect(-w / 2, -h / 2, w, h);
        slab.fill({ color: chalk, alpha: 0.92 });
        group.addChild(slab);
      }

      const mainColor = typeMode === 'slab' ? voidBg : chalk;
      fit.lines.forEach((line, i) => {
        const y = (i - (fit.lines.length - 1) / 2) * fit.size * 0.88;
        const main = makeText(line, input.font, fit.size, mainColor);
        main.position.set(0, y);
        group.addChild(main);
      });

      if (showHot && typeMode !== 'flat' && input.word && input.word !== input.phrase) {
        const hot = makeText(
          input.word,
          input.fontSecondary,
          Math.max(48, fit.size * 0.34),
          typeMode === 'slab' ? voidBg : accent,
          0.85 + input.wordEnter * 0.15,
        );
        hot.position.set(0, fit.lines.length * fit.size * 0.4 + (1 - input.wordEnter) * 14);
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
