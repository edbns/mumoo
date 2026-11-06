import { isDomDailyScreen, type DailyScreenVariant, type LyricCue } from './composition';
import { captureDomDailyScreen } from './daily-screens-capture';
import { drawDailyScreen } from './daily-screens';

/** Paint any Daily Screens design into the Mediabunny canvas (Canvas or React/CSS). */
export async function paintDailyScreen(
  canvas: HTMLCanvasElement,
  cues: readonly LyricCue[],
  frame: number,
  options: { variant: DailyScreenVariant; capturedAtMs: number; deviceSeed?: number } = { variant: 'messages', capturedAtMs: 0 },
) {
  if (isDomDailyScreen(options.variant)) {
    await captureDomDailyScreen(canvas, cues, frame, {
      variant: options.variant,
      capturedAtMs: options.capturedAtMs,
      deviceSeed: options.deviceSeed,
    });
    return;
  }
  drawDailyScreen(canvas, cues, frame, options);
}
