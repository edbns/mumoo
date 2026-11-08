import type { ImpactMusic, ImpactVariant, LyricCue } from './composition';
import { drawImpactStyle } from './lyric-impact-catalog';
import { prepareDraw } from './lyric-impact-motion';
import { getPunchPlate, PUNCH_PLATE_STYLES } from './punch-plates';

export { IMPACT_STYLES } from './lyric-impact-catalog';
export { fitImpactText, impactFrame, impactSignals } from './lyric-impact-motion';

/** Deterministic frame renderer for the Lyric Impact motion catalog. */
export function drawLyricImpact(
  canvas: HTMLCanvasElement,
  cues: readonly LyricCue[],
  frame: number,
  options: { style: ImpactVariant; music: ImpactMusic | null; plateId?: string } = { style: 'monument', music: null },
) {
  const draw = prepareDraw(canvas, cues, frame, options.music);
  if (!draw) return;
  if (options.plateId && PUNCH_PLATE_STYLES.has(options.style)) {
    draw.plate = getPunchPlate(options.plateId) ?? undefined;
  }
  drawImpactStyle(draw, options.style);
}
