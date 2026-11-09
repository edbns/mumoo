/**
 * Riso Lab — development only (not part of the build). `scripts/riso-frames.mjs` drives this page to draw test
 * stills of the Riso look and to lay them out on a contact sheet.
 */
import { Application } from 'pixi.js';
import { HEIGHT, WIDTH, type LyricCue } from './composition';
import { ensureFonts, type AdFont } from './ad-fonts';
import { createRisoWorld, type RisoWorld } from './pack-riso';
import { prepareRisoPhoto, type RisoPhoto } from './riso-photo';
import { plateCutoutUrl, plateUrl } from './punch-plates';
import type { RisoInkSet } from './riso-look';

export type RisoStill = {
  seed: number;
  inks: RisoInkSet['inks'];
  font: AdFont;
  ms: number;
  cues: LyricCue[];
  beatsMs: number[];
  downbeatsMs: number[];
  /** An approved photo's id, or none for a lyrics-only print. */
  plateId?: string;
};

let app: Application | null = null;
let world: { key: string; world: RisoWorld } | null = null;
const photos = new Map<string, RisoPhoto>();

async function picture(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} could not be loaded (${response.status}).`);
  return createImageBitmap(await response.blob());
}

async function photoOf(plateId: string) {
  let photo = photos.get(plateId);
  if (!photo) {
    photo = prepareRisoPhoto(await picture(plateUrl(plateId)), await picture(plateCutoutUrl(plateId)));
    photos.set(plateId, photo);
  }
  return photo;
}

async function still(request: RisoStill): Promise<string> {
  if (!app) {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    app = new Application();
    await app.init({ canvas, width: WIDTH, height: HEIGHT, preference: 'webgl', autoStart: false, sharedTicker: false, antialias: false, background: '#000000', resolution: 1 });
    app.ticker.stop();
  }
  await ensureFonts([request.font], request.cues.map(cue => cue.text).join(' '));
  const key = `${request.seed}|${request.plateId ?? ''}`;
  if (world?.key !== key) {
    world?.world.destroy();
    world = { key, world: createRisoWorld(request.plateId ? await photoOf(request.plateId) : null, request.seed) };
    app.stage.removeChildren();
    app.stage.addChild(world.world.root);
  }
  world.world.update({ ms: request.ms, beatsMs: request.beatsMs, downbeatsMs: request.downbeatsMs, cues: request.cues, inks: request.inks, font: request.font });
  app.render();
  // Encoded in the task that drew it: later the surface would be blank.
  return app.canvas.toDataURL('image/png');
}

/** Lays the stills out in rows of `columns`, `width` px wide each. */
async function contactSheet(urls: string[], columns: number, width: number, gap: number): Promise<string> {
  const height = Math.round((width * HEIGHT) / WIDTH);
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
    ctx.drawImage(image, gap + (at % columns) * (width + gap), gap + Math.floor(at / columns) * (height + gap), width, height);
  }
  return canvas.toDataURL('image/png');
}

Object.assign(window, { risoLab: { still, contactSheet } });
