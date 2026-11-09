/**
 * Bank world — a picture behind the lyric type system: a Shaders Pro background baked by the Look Lab
 * (Look Bank), or the person's own photo through a live filter (Filter).
 * Colors come from the picture itself (pack-palette), so type always belongs to the image.
 * If the picture is missing, show downtime copy — never a substitute design.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { LOOK_DOWN_MESSAGE } from './pack-looks';
import { analyzeTexture } from './pack-palette';
import type { PackSceneInput } from './pack-copy';
import { createPhotoFilters } from './pack-filter';
import { createTypeLayer, type TimedWord, type TypeStyleId } from './pack-type';

/** Calm styles stay still; kinetic styles get a gentle beat pulse inside the type layer. */
const DRIFT: Record<TypeStyleId, number> = {
  typewriter: 0.6, karaoke: 1, stack: 1, minimal: 0.5, editorial: 0.6, outline: 1,
};

export type BankWorld = {
  root: Container;
  update(input: PackSceneInput): void;
  destroy(): void;
};

export function createBankWorld(): BankWorld {
  const root = new Container();
  const bg = new Sprite();
  bg.anchor.set(0.5);
  bg.position.set(WIDTH / 2, HEIGHT / 2);
  const scrim = new Graphics();
  const down = new Container();
  const type = createTypeLayer();
  const filters = createPhotoFilters();
  root.addChild(bg, scrim, type.root, down);

  function clearDown() {
    while (down.children.length) {
      const child = down.children[0];
      down.removeChild(child);
      child.destroy();
    }
  }

  function paintDown() {
    bg.visible = false;
    type.paint('minimal', { ms: 0, words: [], beat: 0, energy: 0, ink: '#fff', accent: '#fff', shadow: '#000', font: 'Anton', fontSecondary: 'Anton' });
    scrim.clear();
    scrim.rect(0, 0, WIDTH, HEIGHT);
    scrim.fill({ color: '#0a0a0c' });
    clearDown();
    LOOK_DOWN_MESSAGE.split('\n').forEach((line, i) => {
      const t = new Text({
        text: line,
        style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: i === 0 ? 42 : 28, fill: '#f2f0ea', align: 'center' },
      });
      t.anchor.set(0.5);
      t.alpha = i === 0 ? 0.95 : 0.7;
      t.position.set(WIDTH / 2, HEIGHT * 0.48 + (i - 0.5) * 48);
      down.addChild(t);
    });
  }

  return {
    root,
    update(input) {
      const texture = input.background;
      const style = input.typeStyle;
      if (!texture || !style) {
        paintDown();
        return;
      }
      clearDown();
      const palette = analyzeTexture(texture);

      // Slow cinematic drift so a still background still feels alive.
      const t = input.ms / 15000;
      const amount = DRIFT[style];
      const cover = Math.max(WIDTH / texture.width, HEIGHT / texture.height) * (1.1 + 0.03 * amount * Math.sin(t * Math.PI));
      bg.texture = texture;
      bg.scale.set(cover * (1 + input.beat * 0.012 * amount * input.energy));
      bg.position.set(WIDTH / 2 + (t - 0.5) * 36 * amount, HEIGHT / 2 + Math.sin(t * Math.PI * 2) * 14 * amount);
      bg.visible = true;
      if (input.filter && input.colors) filters.apply(bg, input.filter, input.beat, input.colors);
      else bg.filters = [];

      scrim.clear();
      // The scrim only exists to keep lyrics readable; with lyrics off the background shows as it is.
      if (input.lyrics && palette.scrim.alpha > 0) {
        scrim.rect(0, 0, WIDTH, HEIGHT);
        scrim.fill({ color: palette.scrim.color, alpha: palette.scrim.alpha });
      }

      const words: TimedWord[] = !input.lyrics ? [] : input.words.length
        ? [...input.words]
        : [{ text: input.phrase, startMs: 0, endMs: 600 }];
      type.paint(style, {
        ms: input.ms,
        words,
        beat: input.beat,
        energy: input.energy,
        ink: palette.ink,
        accent: palette.accent,
        shadow: palette.ink.toLowerCase() === '#f7f4ee' ? '#000000' : '#ffffff',
        font: input.font,
        fontSecondary: input.fontSecondary,
      });
    },
    destroy() {
      type.destroy();
      filters.destroy();
      root.destroy({ children: true });
    },
  };
}
