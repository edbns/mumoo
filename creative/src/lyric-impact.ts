import type { ImpactMusic, ImpactVariant, ImpactWorldId, LyricCue } from './composition';
import { drawImpactStyle } from './lyric-impact-catalog';
import { prepareDraw, setImpactWorldFillHook } from './lyric-impact-motion';
import {
  beginImpactWorld,
  endImpactWorld,
  paintActiveWorldBackground,
  paintWorldForeground,
  prepareWorldPlate,
  worldCompatible,
  worldNeedsPlate,
} from './lyric-impact-worlds';

export { IMPACT_STYLES } from './lyric-impact-catalog';
export { fitImpactText, impactFrame, impactSignals } from './lyric-impact-motion';
export {
  IMPACT_WORLDS_META,
  IMPACT_WORLD_FEATURES,
  worldCompatible,
  worldMeta,
  worldNeedsPlate,
} from './lyric-impact-worlds';
export { preloadImpactPlates } from './lyric-impact-plate';

setImpactWorldFillHook(paintActiveWorldBackground);

/** Deterministic frame renderer for Lyric Impact (+ optional visual world / baked plate). */
export async function drawLyricImpact(
  canvas: HTMLCanvasElement,
  cues: readonly LyricCue[],
  frame: number,
  options: { style: ImpactVariant; music: ImpactMusic | null; world?: ImpactWorldId | null } = { style: 'monument', music: null },
) {
  const draw = prepareDraw(canvas, cues, frame, options.music);
  if (!draw) return;
  const world = options.world && worldCompatible(options.world, options.style) ? options.world : null;
  const plate = world && worldNeedsPlate(world) ? await prepareWorldPlate(draw, world) : null;
  beginImpactWorld(world, draw, plate);
  try {
    drawImpactStyle(draw, options.style);
    if (world) paintWorldForeground(draw, world);
  } finally {
    endImpactWorld();
  }
}
