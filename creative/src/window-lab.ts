/**
 * Window Lab — development only (not part of the build). `scripts/window-frames.mjs` drives this page to draw test
 * stills of the Window look and to lay them out on a contact sheet.
 */
import { Application, ImageSource, Texture } from 'pixi.js';
import { HEIGHT, WIDTH, type LyricCue } from './composition';
import { ensureFonts, type AdFont } from './ad-fonts';
import { createWindowWorld, pictureColours, readWindowPicture, type WindowPicture, type WindowReading, type WindowWorld } from './pack-window';

export type WindowStill = {
  seed: number;
  /** The palette the card starts on, and the palettes it may flip to. */
  palette: string;
  allowed: string[];
  font: AdFont;
  ms: number;
  cues: LyricCue[];
  beatsMs: number[];
  downbeatsMs: number[];
  /** Where the picture is: a photo, or a frame taken out of a video. `cutoutUrl` is the mask of a person to stand in front. */
  photoUrl: string;
  cutoutUrl?: string;
};

let app: Application | null = null;
let world: { seed: number; world: WindowWorld } | null = null;
const textures = new Map<string, Texture>();

async function textureOf(url: string) {
  let texture = textures.get(url);
  if (!texture) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url} could not be loaded (${response.status}).`);
    texture = new Texture({ source: new ImageSource({ resource: await createImageBitmap(await response.blob()) }) });
    textures.set(url, texture);
  }
  return texture;
}

const pictureOf = async (photoUrl: string, cutoutUrl?: string): Promise<WindowPicture> => ({ texture: await textureOf(photoUrl), cutout: cutoutUrl ? await textureOf(cutoutUrl) : undefined });

/** The colours of a picture as it shows in the letters, for judging which screens read against it. */
async function colours(photoUrl: string, cutoutUrl?: string): Promise<string[]> {
  return pictureColours(await pictureOf(photoUrl, cutoutUrl));
}

/** What the shelf's deal needs to know of a picture (see `readWindowPicture`). */
async function reading(photoUrl: string, cutoutUrl?: string): Promise<WindowReading> {
  return readWindowPicture(await textureOf(photoUrl), cutoutUrl ? await textureOf(cutoutUrl) : undefined);
}

async function still(request: WindowStill): Promise<string> {
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
    world = { seed: request.seed, world: createWindowWorld(request.seed) };
    app.stage.removeChildren();
    app.stage.addChild(world.world.root);
  }
  const picture = await pictureOf(request.photoUrl, request.cutoutUrl);
  world.world.update({
    ms: request.ms, beatsMs: request.beatsMs, downbeatsMs: request.downbeatsMs, cues: request.cues, palette: request.palette, allowed: request.allowed, font: request.font, picture,
  });
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

Object.assign(window, { windowLab: { still, colours, reading, contactSheet } });
