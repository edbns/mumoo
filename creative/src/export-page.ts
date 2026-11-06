import { DURATION_MS, FPS, FRAMES, HEIGHT, WIDTH, lyricText, validate, type Composition } from './composition';
import { draw, loadFont } from './render';

const canvas = document.querySelector('canvas')!;
canvas.width = WIDTH;
canvas.height = HEIGHT;

let composition: Composition;
Object.assign(window, {
  mumoo: {
    async prepare(value: unknown, durationMs: number) {
      validate(value, durationMs);
      await loadFont(lyricText(value));
      composition = value;
      return { frames: FRAMES, fps: FPS, durationMs: DURATION_MS, width: WIDTH, height: HEIGHT };
    },
    async frame(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= FRAMES) throw new Error('Invalid frame index.');
      await draw(canvas, composition, index);
      return canvas.toDataURL('image/png').split(',', 2)[1];
    },
  },
});
