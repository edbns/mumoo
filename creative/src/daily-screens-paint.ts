import { isDomDailyScreen, isSceneDailyScreen, type DailyScreenVariant, type LyricCue } from './composition';
import { drawDomDailyScreen } from './daily-screens-dom-canvas';
import { drawSceneDailyScreen } from './daily-screens-scenes-canvas';
import { drawDailyScreen } from './daily-screens';

/**
 * Paint any Daily Screens design into the Mediabunny canvas.
 * Messaging stays on the original Canvas path. Dating/ride/food and the newer
 * scene layouts use solid-color Canvas painters (fast + export-stable).
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
  if (isSceneDailyScreen(options.variant)) {
    drawSceneDailyScreen(canvas, cues, frame, {
      variant: options.variant,
      capturedAtMs: options.capturedAtMs,
      deviceSeed: options.deviceSeed,
    });
    return;
  }
  drawDailyScreen(canvas, cues, frame, options);
}
