/**
 * Pixi pack scenes — WebGL design surface for Creatives Pack.
 * Canvas is only the blit/encode buffer (via Application canvas).
 */
import { Container } from 'pixi.js';
import type { PackSceneInput } from './pack-copy';
import { createBankWorld } from './pack-bank';
import { createPuliseWorld } from './pack-pulise';
import { createDustWorld, type DustPoints, type DustWorld } from './pack-dust';

export type { PackSceneInput } from './pack-copy';

export type PackScene = {
  root: Container;
  update(input: PackSceneInput): void;
  destroy(): void;
};

/** Build the pack scene graph once; update() shows the world for the style and hides the others. */
export function createPackScene(): PackScene {
  const root = new Container();
  // Look Bank and Our photography share a world: a picture behind the lyric type.
  const picture = createBankWorld();
  const pulise = createPuliseWorld();
  // The dust world is built from the photo's grains, so it exists once a photo has been read.
  let dust: { points: DustPoints; world: DustWorld } | null = null;
  const dustLayer = new Container();
  root.addChild(picture.root, pulise.root, dustLayer);

  function updateDust(input: PackSceneInput) {
    if (!input.dustPoints || !input.colors) throw new Error('Dust needs a photo and its two colours.');
    if (dust?.points !== input.dustPoints) {
      dust?.world.destroy();
      dust = { points: input.dustPoints, world: createDustWorld(input.dustPoints) };
      dustLayer.addChild(dust.world.root);
    }
    dust.world.update({
      ms: input.ms,
      beatsMs: input.beatsMs,
      downbeatsMs: input.downbeatsMs,
      beat: input.beat,
      colors: input.colors,
      font: input.font,
      word: input.lyrics ? input.dustWord : null,
    });
  }

  return {
    root,
    update(input) {
      picture.root.visible = input.style === 'bank' || input.style === 'filter';
      pulise.root.visible = input.style === 'pulise';
      dustLayer.visible = input.style === 'dust';
      if (input.style === 'dust') updateDust(input);
      else if (input.style === 'pulise') pulise.update(input);
      else picture.update(input);
    },
    destroy() {
      picture.destroy();
      pulise.destroy();
      dust?.world.destroy();
      root.destroy({ children: true });
    },
  };
}
