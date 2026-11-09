/**
 * Spray Lab — development only (not part of the build). `scripts/spray-frames.mjs` drives this page to draw test
 * stills of the Spray look and to lay them out on contact sheets and sequence strips.
 */
import { Application, Mesh, type Container, type WebGLRenderer } from 'pixi.js';
import { HEIGHT, WIDTH, type LyricCue } from './composition';
import { ensureFonts, type AdFont } from './ad-fonts';
import { createSprayWorld, type SprayWorld } from './pack-spray';
import type { SprayPalette } from './spray-look';

export type SprayStill = {
  seed: number;
  palette: SprayPalette;
  font: AdFont;
  ms: number;
  cues: LyricCue[];
  beatsMs: number[];
  downbeatsMs: number[];
};

let app: Application | null = null;
let world: { seed: number; world: SprayWorld } | null = null;
/** What the latest still cost: building the words, drawing the frame (to the last pixel), and how many grains and drips were drawn. */
let lastCost = { buildMs: 0, drawMs: 0, instances: 0 };

const instancesIn = (node: Container): number =>
  (node instanceof Mesh ? node.geometry.indexBuffer.data.length / 6 : 0) + node.children.reduce((sum, child) => sum + instancesIn(child as Container), 0);

async function still(request: SprayStill): Promise<string> {
  if (!app) {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    app = new Application();
    await app.init({ canvas, width: WIDTH, height: HEIGHT, preference: 'webgl', autoStart: false, sharedTicker: false, antialias: false, background: '#000000', resolution: 1 });
    app.ticker.stop();
  }
  await ensureFonts([request.font], request.cues.map(cue => cue.text).join(' '));
  if (world?.seed !== request.seed) {
    world?.world.destroy();
    world = { seed: request.seed, world: createSprayWorld(request.seed) };
    app.stage.removeChildren();
    app.stage.addChild(world.world.root);
  }
  const started = performance.now();
  world.world.update({ ms: request.ms, beatsMs: request.beatsMs, downbeatsMs: request.downbeatsMs, cues: request.cues, palette: request.palette, font: request.font });
  const built = performance.now();
  app.render();
  // Reading one pixel back makes the browser finish the draw, so the time is the frame's real cost.
  (app.renderer as WebGLRenderer).gl.readPixels(0, 0, 1, 1, WebGL2RenderingContext.RGBA, WebGL2RenderingContext.UNSIGNED_BYTE, new Uint8Array(4));
  lastCost = { buildMs: built - started, drawMs: performance.now() - built, instances: instancesIn(world.world.root) };
  // Encoded in the task that drew it: later the surface would be blank.
  return app.canvas.toDataURL('image/png');
}

/** Lays the stills out in rows of `columns`, `width` px wide each; `crop` keeps only a horizontal band of each still. */
async function sheet(urls: string[], columns: number, width: number, gap: number, crop?: { y: number; height: number }): Promise<string> {
  const band = crop ?? { y: 0, height: HEIGHT };
  const height = Math.round((width * band.height) / WIDTH);
  const rows = Math.ceil(urls.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = columns * width + (columns + 1) * gap;
  canvas.height = rows * height + (rows + 1) * gap;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  for (const [at, url] of urls.entries()) {
    const image = new Image();
    image.src = url;
    await image.decode();
    ctx.drawImage(image, 0, band.y, WIDTH, band.height, gap + (at % columns) * (width + gap), gap + Math.floor(at / columns) * (height + gap), width, height);
  }
  return canvas.toDataURL('image/png');
}

Object.assign(window, { sprayLab: { still, sheet, cost: () => lastCost } });
