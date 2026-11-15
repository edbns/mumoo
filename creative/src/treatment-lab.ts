/**
 * Treatment Lab — development only (not part of the build). Shows all eight video treatments side by side
 * on one Directed still, so finishes can be tuned without walking the shelf.
 */
import { Application, ImageSource, Texture } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { ensureFonts } from './ad-fonts';
import { createTreatmentWorld } from './pack-treatment';
import { TREATMENTS, type TreatmentId } from './treatment-deal';
import type { PackSceneInput } from './pack-copy';

const PLACEHOLDER = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  g.addColorStop(0, '#1a3a5c');
  g.addColorStop(0.5, '#c45c26');
  g.addColorStop(1, '#0d0d12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#f2f0ea';
  ctx.font = 'bold 120px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MUMOO', WIDTH / 2, HEIGHT * 0.45);
  ctx.font = '48px sans-serif';
  ctx.fillText('treatment lab', WIDTH / 2, HEIGHT * 0.52);
  return canvas;
})();

let app: Application | null = null;
let world: ReturnType<typeof createTreatmentWorld> | null = null;
let texture: Texture | null = null;

async function ensure() {
  if (app) return;
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  app = new Application();
  await app.init({
    canvas, width: WIDTH, height: HEIGHT, preference: 'webgl',
    autoStart: false, sharedTicker: false, antialias: true, background: '#000000', resolution: 1,
  });
  app.ticker.stop();
  world = createTreatmentWorld();
  app.stage.addChild(world.root);
  texture = new Texture({ source: new ImageSource({ resource: PLACEHOLDER }) });
  await ensureFonts(['Anton']);
}

function inputOf(treatment: TreatmentId, variant: string, ms = 2400): PackSceneInput {
  return {
    style: 'treatment',
    beat: 0.4,
    energy: 0.55,
    beatIndex: 8,
    beatGapMs: 480,
    frame: Math.round(ms * 30 / 1000),
    layout: { rotate: 0, scaleBias: 1, cut: 0, seed: 42 },
    font: 'Anton',
    fontSecondary: 'Anton',
    phrase: 'HELLO WORLD',
    word: 'HELLO',
    wordEnter: 1,
    ms,
    words: [{ text: 'HELLO', startMs: 0, endMs: 400 }, { text: 'WORLD', startMs: 400, endMs: 900 }],
    background: texture,
    typeStyle: 'karaoke',
    lyrics: true,
    beatsMs: [0, 480, 960, 1440, 1920, 2400],
    downbeatsMs: [0, 1920],
    dustWord: null,
    cues: [{ text: 'hello world', startMs: 0, endMs: 900, words: [{ text: 'hello', startMs: 0, endMs: 400 }, { text: 'world', startMs: 400, endMs: 900 }] }],
    seed: 42,
    treatment,
    treatmentVariant: variant,
  };
}

async function still(treatment: TreatmentId, variant: string, ms = 2400): Promise<string> {
  await ensure();
  world!.update(inputOf(treatment, variant, ms), app!.renderer);
  app!.render();
  return app!.canvas.toDataURL('image/png');
}

async function contactSheet(): Promise<string> {
  const cells: { title: string; url: string }[] = [];
  for (const def of TREATMENTS) {
    for (const variant of def.variants) {
      cells.push({ title: `${def.title} · ${variant.title}`, url: await still(def.id, variant.id) });
    }
  }
  const thumbW = 180;
  const thumbH = Math.round((thumbW * HEIGHT) / WIDTH);
  const columns = 4;
  const gap = 12;
  const labelH = 28;
  const rows = Math.ceil(cells.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = columns * thumbW + (columns + 1) * gap;
  canvas.height = rows * (thumbH + labelH) + (rows + 1) * gap;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = '#ddd';
  ctx.textAlign = 'center';
  for (const [at, cell] of cells.entries()) {
    const col = at % columns;
    const row = Math.floor(at / columns);
    const x = gap + col * (thumbW + gap);
    const y = gap + row * (thumbH + labelH + gap);
    const image = new Image();
    image.src = cell.url;
    await image.decode();
    ctx.drawImage(image, x, y, thumbW, thumbH);
    ctx.fillText(cell.title, x + thumbW / 2, y + thumbH + 16);
  }
  return canvas.toDataURL('image/png');
}

async function mount() {
  const sheet = await contactSheet();
  const img = new Image();
  img.src = sheet;
  img.alt = 'All eight treatments × four variants';
  img.style.display = 'block';
  img.style.maxWidth = '100%';
  document.body.appendChild(img);
}

Object.assign(window, { treatmentLab: { still, contactSheet, treatments: TREATMENTS } });
void mount();
