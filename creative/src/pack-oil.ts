/**
 * Oil plate — cleared photo pushed through a painterly stack
 * (blur + emboss + soft color) so the still reads as painted, not graded.
 */
import { Container, Graphics, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import { EmbossFilter, KawaseBlurFilter } from 'pixi-filters';
import { HEIGHT, WIDTH } from './composition';
import { META_SAFE_BOTTOM } from './ad-punch';
import { fitPackLines } from './pack-text';
import type { PackSceneInput } from './pack-copy';

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

export type OilWorld = {
  root: Container;
  update(input: PackSceneInput): void;
  destroy(): void;
};

export function createOilWorld(): OilWorld {
  const root = new Container();
  const plate = new Container();
  const photo = new Sprite();
  photo.anchor.set(0.5);
  photo.position.set(WIDTH / 2, HEIGHT / 2);
  photo.visible = false;
  const wash = new Graphics();
  const grain = new Graphics();
  plate.addChild(photo, wash, grain);
  plate.filterArea = new Rectangle(0, 0, WIDTH, HEIGHT);

  const blur = new KawaseBlurFilter({ strength: 2.2, quality: 3 });
  const emboss = new EmbossFilter(3.2);
  plate.filters = [blur, emboss];

  const lyrics = new Container();
  root.addChild(plate, lyrics);

  function clearLyrics() {
    while (lyrics.children.length) {
      const child = lyrics.children[0];
      lyrics.removeChild(child);
      child.destroy();
    }
  }

  function coverPhoto(texture: Texture) {
    photo.texture = texture;
    const scale = Math.max(WIDTH / Math.max(1, texture.width), HEIGHT / Math.max(1, texture.height));
    photo.scale.set(scale);
    photo.visible = true;
  }

  return {
    root,
    update(input: PackSceneInput) {
      const texture = input.plateTexture;
      if (texture) coverPhoto(texture);
      else photo.visible = false;

      const accent = input.palette.accent || '#d4a373';
      const ink = input.palette.ink || '#f7f1e8';
      wash.clear();
      wash.rect(0, 0, WIDTH, HEIGHT);
      wash.fill({ color: accent, alpha: 0.18 + input.energy * 0.08 });
      grain.clear();
      for (let i = 0; i < 500; i++) {
        const x = (i * 7919 + input.frame * 3) % WIDTH;
        const y = (i * 9973 + input.frame) % HEIGHT;
        grain.rect(x, y, 1 + (i % 2), 1);
        grain.fill({ color: i % 3 ? '#2a1810' : '#fff6ea', alpha: 0.05 + (i % 4) * 0.015 });
      }

      clearLyrics();
      const fit = fitPackLines(input.phrase || input.word || 'NOW', input.font, 140, 900, 4);
      const group = new Container();
      group.position.set(WIDTH / 2 + input.layout.driftX * 0.1, Math.min(HEIGHT * 0.52, META_SAFE_BOTTOM - 80));
      group.scale.set((1 + input.beat * 0.06) * input.layout.scaleBias);
      fit.lines.forEach((line, i) => {
        const y = (i - (fit.lines.length - 1) / 2) * fit.size * 0.9;
        const shadow = makeText(line, input.font, fit.size, accent, 0.85);
        shadow.position.set(6, y + 6);
        const main = makeText(line, input.font, fit.size, ink);
        main.position.set(0, y);
        group.addChild(shadow, main);
      });
      lyrics.addChild(group);
    },
    destroy() {
      clearLyrics();
      plate.filters = [];
      root.destroy({ children: true });
    },
  };
}
