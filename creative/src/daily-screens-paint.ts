import { isDomDailyScreen, type DailyScreenVariant, type LyricCue } from './composition';
import { drawDomDailyScreen } from './daily-screens-dom-canvas';
import { drawDailyScreen } from './daily-screens';

/**
 * Paint any Daily Screens design into the Mediabunny canvas.
 * Messaging designs stay on the original Canvas path. Dating/ride/food use a
 * solid-color Canvas painter matched to the React preview (fast + export-stable).
 */
export async function paintDailyScreen(
  canvas: HTMLCanvasElement,
  cues: readonly LyricCue[],
  frame: number,
  options: { variant: DailyScreenVariant; capturedAtMs: number; deviceSeed?: number } = { variant: 'messages', capturedAtMs: 0 },
) {
  if (isDomDailyScreen(options.variant)) {
    drawDomDailyScreen(canvas, cues, frame, {
      variant: options.variant,
      capturedAtMs: options.capturedAtMs,
      deviceSeed: options.deviceSeed,
    });
    return;
  }
  drawDailyScreen(canvas, cues, frame, options);
}
