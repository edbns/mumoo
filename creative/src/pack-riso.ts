/**
 * Riso plate — MIT pixi-filters print recipe with seeded diversity.
 * Halftone (DotFilter) + misregistration (RGBSplit) + paper tooth (SimplexNoise).
 * Colors: real Riso drum pairings via pickRisoPalette (ink = type, accent/bg = drums).
 * Type: not every card gets a shadow or secondary word — treatments vary by seed.
 */
import { Container, Graphics, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import { DotFilter, RGBSplitFilter, SimplexNoiseFilter } from 'pixi-filters';
import { HEIGHT, WIDTH } from './composition';
import { META_SAFE_BOTTOM } from './ad-punch';
import { hashPick } from './ad-fonts';
import { fitPackLines } from './pack-text';
import type { PackSceneInput } from './pack-copy';

type TypeMode = 'flat' | 'misreg' | 'knockout' | 'ink';
type FieldMode = 'fields' | 'bars' | 'corners' | 'wash';

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

export type RisoWorld = {
  root: Container;
  update(input: PackSceneInput): void;
  destroy(): void;
};

export function createRisoWorld(): RisoWorld {
  const root = new Container();
  const plate = new Container();
  const photo = new Sprite();
  photo.anchor.set(0.5);
  photo.position.set(WIDTH / 2, HEIGHT / 2);
  photo.visible = false;
  const stock = new Graphics();
  const inkA = new Graphics();
  const inkB = new Graphics();
  const inkC = new Graphics();
  plate.addChild(photo, stock, inkA, inkB, inkC);
  plate.filterArea = new Rectangle(0, 0, WIDTH, HEIGHT);

  function coverPhoto(texture: Texture) {
    photo.texture = texture;
    const scale = Math.max(WIDTH / Math.max(1, texture.width), HEIGHT / Math.max(1, texture.height));
    photo.scale.set(scale);
    photo.visible = true;
  }

  const dots = new DotFilter({ scale: 0.85, angle: 5, grayscale: false });
  const misreg = new RGBSplitFilter({
    red: { x: 3, y: 0 },
    green: { x: -1.5, y: 1.5 },
    blue: { x: 0, y: -2.5 },
  });
  const tooth = new SimplexNoiseFilter({ noiseScale: 8, strength: 0.18 });
  plate.filters = [dots, misreg, tooth];

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
      const paper = input.palette.wash || '#f4ecd8';
      const drumA = input.palette.accent;
      const drumB = input.palette.bg;
      const typeInk = input.palette.ink || '#000000';
      const lift = input.beat;
      const fieldMode = (['fields', 'bars', 'corners', 'wash'] as const)[
        hashPick(seed, 'field', 4)
      ] as FieldMode;
      const typeMode = (['flat', 'misreg', 'knockout', 'ink'] as const)[
        hashPick(seed, 'type', 4)
      ] as TypeMode;
      const showHot = hashPick(seed, 'hot', 10) < 4;
      const recipe = hashPick(seed, 'recipe', 4); // 0 calm · 1 classic · 2 heavy slip · 3 coarse dots
      const swayAmp = recipe === 0 ? 3 : recipe === 2 ? 14 : 8;
      const sway = Math.sin(input.frame / (recipe === 0 ? 48 : 30)) * swayAmp;

      if (input.plateTexture) coverPhoto(input.plateTexture);
      else photo.visible = false;

      stock.clear();
      stock.rect(0, 0, WIDTH, HEIGHT);
      // Paper wash over the photo — riso drums print on top of the still.
      stock.fill({ color: paper, alpha: input.plateTexture ? 0.42 : 1 });

      inkA.clear();
      inkB.clear();
      inkC.clear();

      if (fieldMode === 'fields' || fieldMode === 'wash') {
        inkA.ellipse(WIDTH * 0.38 + sway, HEIGHT * 0.4 - lift * 16, WIDTH * 0.4, HEIGHT * 0.26);
        inkA.fill({ color: drumA, alpha: 0.5 + lift * 0.18 });
        inkA.ellipse(WIDTH * 0.62 - sway * 0.4, HEIGHT * 0.58 + lift * 8, WIDTH * 0.34, HEIGHT * 0.2);
        inkA.fill({ color: drumA, alpha: 0.32 + lift * 0.12 });
        inkB.ellipse(WIDTH * 0.64 - sway, HEIGHT * 0.32 + lift * 10, WIDTH * 0.36, HEIGHT * 0.24);
        inkB.fill({ color: drumB, alpha: 0.38 + lift * 0.12 });
        if (fieldMode === 'wash') {
          inkB.ellipse(WIDTH * 0.5, HEIGHT * 0.72, WIDTH * 0.55, HEIGHT * 0.18);
          inkB.fill({ color: drumB, alpha: 0.22 });
        } else {
          inkB.ellipse(WIDTH * 0.34 + sway * 0.3, HEIGHT * 0.68, WIDTH * 0.36, HEIGHT * 0.18);
          inkB.fill({ color: drumB, alpha: 0.26 });
        }
      }

      if (fieldMode === 'bars' || fieldMode === 'fields') {
        inkC.rect(0, 0, WIDTH, 40 + lift * 24);
        inkC.fill({ color: drumA, alpha: 0.9 });
        inkC.rect(0, HEIGHT - (48 + lift * 20), WIDTH, 48 + lift * 20);
        inkC.fill({ color: drumB, alpha: 0.82 });
      }

      if (fieldMode === 'corners') {
        inkA.rect(0, 0, WIDTH * 0.42, HEIGHT * 0.28);
        inkA.fill({ color: drumA, alpha: 0.7 });
        inkB.rect(WIDTH * 0.58, HEIGHT * 0.62, WIDTH * 0.42, HEIGHT * 0.38);
        inkB.fill({ color: drumB, alpha: 0.65 });
        inkC.rect(WIDTH * 0.7, 0, WIDTH * 0.3, HEIGHT * 0.18);
        inkC.fill({ color: drumB, alpha: 0.55 });
        inkC.rect(0, HEIGHT * 0.78, WIDTH * 0.35, HEIGHT * 0.22);
        inkC.fill({ color: drumA, alpha: 0.5 });
      }

      // Filter motion recipes — same tools, different dials
      const slipBase = recipe === 0 ? 1 : recipe === 2 ? 4 : 2;
      const slip = slipBase + lift * (recipe === 2 ? 9 : recipe === 0 ? 2 : 5);
      misreg.red = { x: slip, y: lift * (recipe === 2 ? 2.2 : 1) };
      misreg.green = { x: -slip * 0.55, y: slip * 0.35 };
      misreg.blue = { x: slip * 0.2, y: -slip * 0.65 };
      tooth.strength = recipe === 0 ? 0.08 + lift * 0.06 : 0.12 + lift * 0.14;
      tooth.offsetZ = input.frame * (recipe === 0 ? 0.008 : 0.02);
      dots.scale = recipe === 3 ? 1.35 + lift * 0.35 : recipe === 0 ? 0.55 + lift * 0.1 : 0.75 + lift * 0.22;
      dots.angle = 5 + recipe * 3;

      clearLyrics();
      const fit = fitPackLines(input.phrase, input.font, 150, 900, 4);
      const scale = (1 + input.beat * 0.06) * input.layout.scaleBias;
      const group = new Container();
      // Dead-center X — no drift. Y Meta-safe mid.
      group.position.set(WIDTH / 2, Math.min(HEIGHT * 0.48, META_SAFE_BOTTOM - 120));
      group.scale.set(scale);
      group.rotation = input.layout.rotate * 0.35;

      const mainColor =
        typeMode === 'knockout' ? paper :
        typeMode === 'ink' ? drumA :
        typeInk;
      const underColor = typeMode === 'misreg' ? drumA : null;

      // Knockout needs an ink slab so cream type reads on paper stock
      if (typeMode === 'knockout') {
        const slab = new Graphics();
        const padX = 48;
        const padY = 28;
        const h = fit.lines.length * fit.size * 0.92 + padY * 2;
        const w = 920 + padX * 2;
        slab.rect(-w / 2, -h / 2, w, h);
        slab.fill({ color: drumB === '#000000' ? drumA : drumB, alpha: 0.92 });
        group.addChild(slab);
      }

      fit.lines.forEach((line, i) => {
        const y = (i - (fit.lines.length - 1) / 2) * fit.size * 0.88;
        if (underColor) {
          const under = makeText(line, input.font, fit.size, underColor, 0.85);
          under.position.set(3 + lift * 2, y + 4);
          group.addChild(under);
        }
        const main = makeText(line, input.font, fit.size, mainColor);
        main.position.set(0, y);
        group.addChild(main);
      });

      if (showHot && input.word && input.word !== input.phrase) {
        const hotColor = typeMode === 'knockout' ? drumA : typeMode === 'ink' ? drumB : drumA;
        const hot = makeText(
          input.word,
          input.fontSecondary,
          Math.max(48, fit.size * 0.34),
          hotColor,
          0.85 + input.wordEnter * 0.15,
        );
        hot.position.set(0, fit.lines.length * fit.size * 0.4 + (1 - input.wordEnter) * 14);
        group.addChild(hot);
      }
      lyrics.addChild(group);
    },
    destroy() {
      clearLyrics();
      plate.filters = [];
      dots.destroy();
      misreg.destroy();
      tooth.destroy();
      root.destroy({ children: true });
    },
  };
}
