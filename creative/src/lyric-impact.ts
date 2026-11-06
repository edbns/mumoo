import type { ImpactMusic, ImpactVariant, ImpactWorldId, LyricCue } from './composition';
import { drawImpactStyle } from './lyric-impact-catalog';
import { prepareDraw, setImpactWorldFillHook } from './lyric-impact-motion';
import {
  beginImpactWorld,
  endImpactWorld,
  paintActiveWorldBackground,
  paintWorldForeground,
  worldCompatible,
} from './lyric-impact-worlds';

export { IMPACT_STYLES } from './lyric-impact-catalog';
export { fitImpactText, impactFrame, impactSignals } from './lyric-impact-motion';
export {
  IMPACT_WORLDS_META,
  IMPACT_WORLD_FEATURES,
  worldCompatible,
  worldMeta,
} from './lyric-impact-worlds';

setImpactWorldFillHook(paintActiveWorldBackground);

/** Deterministic frame renderer for the Lyric Impact motion catalog (+ optional visual world). */
export function drawLyricImpact(
  canvas: HTMLCanvasElement,
  cues: readonly LyricCue[],
  frame: number,
  options: { style: ImpactVariant; music: ImpactMusic | null; world?: ImpactWorldId | null } = { style: 'monument', music: null },
) {
  const draw = prepareDraw(canvas, cues, frame, options.music);
  if (!draw) return;
  const world = options.world && worldCompatible(options.world, options.style) ? options.world : null;
  beginImpactWorld(world, draw);
  try {
    drawImpactStyle(draw, options.style);
    if (world) paintWorldForeground(draw, world);
  } finally {
    endImpactWorld();
  }
}
