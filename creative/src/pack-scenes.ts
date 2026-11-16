/**
 * Pixi pack scenes — WebGL design surface for Creatives Pack.
 * Canvas is only the blit/encode buffer (via Application canvas).
 */
import { Container, type Renderer } from 'pixi.js';
import type { PackSceneInput } from './pack-copy';
import { createBankWorld } from './pack-bank';
import { createPuliseWorld } from './pack-pulise';
import { createDustWorld, type DustPoints, type DustWorld } from './pack-dust';
import { createRisoWorld, type RisoWorld } from './pack-riso';
import { createWindowWorld, type WindowWorld } from './pack-window';
import { createTreatmentWorld } from './pack-treatment';
import type { RisoPhoto } from './riso-photo';

export type { PackSceneInput } from './pack-copy';

export type PackScene = {
  root: Container;
  update(input: PackSceneInput, renderer?: Renderer): void;
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
  // Riso and Window are built for one card (its seed, and Riso its photo) and given back as soon as another style or card is drawn:
  // the shelf draws one poster after another on this one scene.
  let riso: { photo: RisoPhoto; seed: number; world: RisoWorld } | null = null;
  let knockout: { seed: number; world: WindowWorld } | null = null;
  const treatment = createTreatmentWorld();
  const printLayer = new Container();
  root.addChild(picture.root, pulise.root, dustLayer, printLayer, treatment.root);

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

  function updateRiso(input: PackSceneInput) {
    if (!input.risoPhoto || !input.inks) throw new Error('Riso needs a picture and its inks.');
    if (riso?.photo !== input.risoPhoto || riso.seed !== input.seed) {
      riso?.world.destroy();
      riso = { photo: input.risoPhoto, seed: input.seed, world: createRisoWorld(input.risoPhoto, input.seed) };
      printLayer.addChild(riso.world.root);
    }
    riso.world.update({ ms: input.ms, beatsMs: input.beatsMs, downbeatsMs: input.downbeatsMs, cues: input.cues, inks: input.inks, font: input.font });
  }

  function updateWindow(input: PackSceneInput) {
    if (!input.windowPicture || !input.windowPalette) throw new Error('Window needs a picture and a screen colour.');
    if (knockout?.seed !== input.seed) {
      knockout?.world.destroy();
      knockout = { seed: input.seed, world: createWindowWorld(input.seed) };
      printLayer.addChild(knockout.world.root);
    }
    knockout.world.update({
      ms: input.ms, beatsMs: input.beatsMs, downbeatsMs: input.downbeatsMs, cues: input.cues,
      palette: input.windowPalette, allowed: input.windowAllowed, font: input.font, picture: input.windowPicture,
    });
  }

  return {
    root,
    update(input, renderer) {
      if (input.style !== 'riso') { riso?.world.destroy(); riso = null; }
      if (input.style !== 'window') { knockout?.world.destroy(); knockout = null; }
      picture.root.visible = input.style === 'bank' || input.style === 'filter';
      pulise.root.visible = input.style === 'pulise';
      dustLayer.visible = input.style === 'dust';
      treatment.root.visible = input.style === 'treatment';
      if (input.style === 'dust') updateDust(input);
      else if (input.style === 'riso') updateRiso(input);
      else if (input.style === 'window') updateWindow(input);
      else if (input.style === 'pulise') pulise.update(input);
      else if (input.style === 'treatment') {
        if (!renderer) throw new Error('A treatment needs the renderer to draw its Directed pass.');
        treatment.update(input, renderer);
      }
      else picture.update(input);
    },
    destroy() {
      picture.destroy();
      pulise.destroy();
      dust?.world.destroy();
      riso?.world.destroy();
      knockout?.world.destroy();
      treatment.destroy();
      root.destroy({ children: true });
    },
  };
}
