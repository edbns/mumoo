/**
 * Doodle — a kid-style pen drawing of a singer on a sheet of paper, with the lyric in a speech bubble. The singer
 * (and what they wear and hold) comes from the song's genre and voice, the face from what the words feel like, and
 * the sway from the beat. Nothing is a picture and nothing is generated: the drawing is `doodle-draw.ts`, put on a
 * 2D canvas and shown through one texture.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import type { AdFont } from './ad-fonts';
import type { DoodlePaper } from './doodle-cast';
import type { DoodleMood } from './doodle-parts';
import { drawDoodle } from './doodle-draw';

export type DoodleInput = {
  id: string;
  paper: DoodlePaper;
  mood: DoodleMood;
  font: AdFont;
  ms: number;
  beat: number;
  beatIndex: number;
  /** The phrase being sung ('' between phrases), when it began, and whether a word is sung right now. */
  phrase: string;
  phraseStartMs: number;
  singing: boolean;
};

export type DoodleWorld = {
  root: Container;
  update(input: DoodleInput): void;
  destroy(): void;
};

/** The sheet for one card. `seed` decides where the strokes wander. */
export function createDoodleWorld(seed: number): DoodleWorld {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  const texture = Texture.from(canvas);
  const sprite = new Sprite(texture);
  sprite.width = WIDTH;
  sprite.height = HEIGHT;
  const root = new Container();
  root.addChild(sprite);
  return {
    root,
    update(input) {
      drawDoodle(ctx, { ...input, width: WIDTH, height: HEIGHT, seed });
      texture.source.update();
    },
    destroy() {
      root.destroy({ children: true });
      texture.destroy(true);
    },
  };
}
