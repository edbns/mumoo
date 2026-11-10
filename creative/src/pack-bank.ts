/**
 * Bank world — a picture behind the lyric type system: a Shaders Pro background baked by the Look Lab
 * (Look Bank), a baked photography effect (Our photography), or the person's own picture.
 * Colors come from the picture itself (pack-palette), so type always belongs to the image.
 * If the picture is missing, show downtime copy — never a substitute design.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { LOOK_DOWN_MESSAGE } from './pack-looks';
import { analyzeTexture } from './pack-palette';
import type { PackSceneInput } from './pack-copy';
import { createLiveLook, type LiveLook } from './live-look';
import type { LiveLookId } from './live-look-deal';
import { createTypeLayer, type TimedWord, type TypeStyleId } from './pack-type';

/** Calm styles keep the picture still; the rest let it drift and breathe with the beat. */
const DRIFT: Partial<Record<TypeStyleId, number>> = {
  typewriter: 0.6, minimal: 0.5, editorial: 0.6, wipe: 0.6, slide: 0.6, wave: 0.7,
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
  // Each live look is built the first time a card asks for it, then kept: the shelf draws card after card on this one world.
  const looks = new Map<LiveLookId, LiveLook>();
  const type = createTypeLayer();
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
    bg.filters = [];
    type.paint('minimal', { ms: 0, words: [], beat: 0, beatIndex: 0, energy: 0, seed: 0, ink: '#fff', accent: '#fff', shadow: '#000', font: 'Anton', fontSecondary: 'Anton' });
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
      const palette = analyzeTexture(texture, input.look);

      // Slow cinematic drift so a still background still feels alive.
      const t = input.ms / 15000;
      const amount = DRIFT[style] ?? 1;
      const cover = Math.max(WIDTH / texture.width, HEIGHT / texture.height) * (1.1 + 0.03 * amount * Math.sin(t * Math.PI));
      bg.texture = texture;
      bg.scale.set(cover * (1 + input.beat * 0.012 * amount * input.energy));
      bg.position.set(WIDTH / 2 + (t - 0.5) * 36 * amount, HEIGHT / 2 + Math.sin(t * Math.PI * 2) * 14 * amount);
      bg.visible = true;
      if (input.look) {
        let look = looks.get(input.look);
        if (!look) looks.set(input.look, look = createLiveLook(input.look));
        look.update({ beat: input.beat, energy: input.energy, ms: input.ms, range: palette.range });
        bg.filters = [look.filter];
      } else bg.filters = [];

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
        beatIndex: input.beatIndex,
        energy: input.energy,
        seed: input.layout.seed,
        ink: palette.ink,
        accent: palette.accent,
        shadow: palette.ink.toLowerCase() === '#f7f4ee' ? '#000000' : '#ffffff',
        font: input.font,
        fontSecondary: input.fontSecondary,
      });
    },
    destroy() {
      bg.filters = [];
      for (const look of looks.values()) look.filter.destroy();
      type.destroy();
      root.destroy({ children: true });
    },
  };
}
