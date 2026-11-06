import type { ImpactMusic, ImpactVariant, LyricCue } from './composition';
import { drawImpactStyle } from './lyric-impact-catalog';
import { prepareDraw } from './lyric-impact-motion';

export { IMPACT_STYLES } from './lyric-impact-catalog';
export { fitImpactText, impactFrame, impactSignals } from './lyric-impact-motion';

/** Deterministic frame renderer for the Lyric Impact motion catalog. */
export function drawLyricImpact(
  canvas: HTMLCanvasElement,
  cues: readonly LyricCue[],
  frame: number,
  options: { style: ImpactVariant; music: ImpactMusic | null } = { style: 'monument', music: null },
) {
  const draw = prepareDraw(canvas, cues, frame, options.music);
  if (!draw) return;
  drawImpactStyle(draw, options.style);
}
