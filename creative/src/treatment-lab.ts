/**
 * Treatment Lab — development only (not part of the build). Shows every video treatment side by side on one Directed
 * still, so finishes can be tuned without walking the shelf. `?only=sideways,typewriter` shows only those, `?nolyrics` without words, `?thumb=540` bigger stills.
 */
import { Application, ImageSource, Sprite, Texture } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { ensureFonts } from './ad-fonts';
import { PRESETS, type PresetId } from './edit-presets';
import { createPresetPass, REC_FONT, type PresetPass } from './pack-preset';
import { presetFrame } from './preset-motion';
import { createTreatmentWorld } from './pack-treatment';
import { TYPEWRITER_FONT } from './pack-typewriter';
import { SCREENSHOT_FONT } from './pack-screenshot';
import { TREATMENTS, type TreatmentId } from './treatment-deal';
import type { PackSceneInput } from './pack-copy';
import { typeFamilies } from './pack-type';
import { MONO_ACCENT, TYPE_FINISHES } from './type-finish';

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

/** A real picture to judge the treatments on (`?photo=` a path the dev server serves), cover-fit to the frame. */
async function photo(): Promise<HTMLCanvasElement | null> {
  const src = new URLSearchParams(location.search).get('photo') ?? '/punch-plates/masters/burnnet-woman-1547507_1920.jpg';
  const image = new Image();
  image.src = src;
  try { await image.decode(); } catch { return null; }
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const scale = Math.max(WIDTH / image.naturalWidth, HEIGHT / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  canvas.getContext('2d')!.drawImage(image, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
  return canvas;
}

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
  texture = new Texture({ source: new ImageSource({ resource: await photo() ?? PLACEHOLDER }) });
  await ensureFonts(['Anton', TYPEWRITER_FONT, SCREENSHOT_FONT]);
}

const LAB_LYRICS = 'I keep on running back to you | every night the city calls my name | hold me close until the morning | we were young and we were wild | dancing on the edge of something | never let the music stop';
/** Every word of the lab song, a phrase every two seconds and a word every 300 ms. */
const LAB_CUES = LAB_LYRICS.split(' | ').flatMap((line, row) => line.split(' ').map((text, k) => ({ text, startMs: row * 2000 + k * 300, endMs: row * 2000 + k * 300 + 280 })));
const params = new URLSearchParams(location.search);
const ONLY = params.get('only')?.split(',');
const LYRICS = !params.has('nolyrics');

type TypeLook = Pick<PackSceneInput, 'typeStyle' | 'typeFinish' | 'typeAccent' | 'beatIndex'>;

function inputOf(treatment: TreatmentId, variant: string, ms = 2400, look: Partial<TypeLook> = {}): PackSceneInput {
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
    lyrics: LYRICS,
    beatsMs: [0, 480, 960, 1440, 1920, 2400],
    downbeatsMs: [0, 1920],
    dustWord: null,
    cues: LYRICS ? LAB_CUES : [],
    seed: 42,
    treatment,
    treatmentVariant: variant,
    clock: '21:07',
    ...look,
  };
}

async function still(treatment: TreatmentId, variant: string, ms = 2400, look: Partial<TypeLook> = {}): Promise<string> {
  await ensure();
  world!.update(inputOf(treatment, variant, ms, look), app!.renderer);
  app!.render();
  return app!.canvas.toDataURL('image/png');
}

/** A song at 120 bpm with its drop at 2 s, cut every 2 beats, for the presets' moving parts. */
const LAB_MUSIC = {
  kicksMs: Array.from({ length: 12 }, (_, i) => i * 500),
  heavyMs: [0, 2000, 4000],
  dropsMs: [2000],
  downbeatsMs: [0, 2000, 4000],
  energy: Array.from({ length: 60 }, (_, i) => ({ timeMs: i * 100, rms: i >= 20 ? 0.9 : 0.2 })),
};
const LAB_CUTS = [0, 1000, 2000, 3000, 4000];

let presetPass: PresetPass | null = null;

/** The picture through a preset at `ms` of the lab song: 1700 is a calm moment, 2030 just after the cut on the drop. */
async function presetStill(preset: PresetId, take: string, ms = 1700): Promise<string> {
  await ensure();
  presetPass ??= createPresetPass();
  const frame = presetFrame(preset, take, { ms, cutsMs: LAB_CUTS, music: LAB_MUSIC, energy: ms >= 2000 ? 0.9 : 0.2, seed: 42 });
  const picture = presetPass.draw(texture!, frame, ms, 42, app!.renderer);
  const sprite = new Sprite(picture);
  app!.stage.visible = false;
  app!.renderer.render({ container: sprite });
  sprite.destroy();
  app!.stage.visible = true;
  return app!.canvas.toDataURL('image/png');
}

async function presetSheet(): Promise<string> {
  await ensureFonts([REC_FONT]);
  const cells: { title: string; url: string }[] = [];
  for (const def of PRESETS) {
    for (const take of def.takes) {
      cells.push({ title: `${def.title} · ${take}`, url: await presetStill(def.id, take, 1700) });
      cells.push({ title: `${def.title} · ${take} · drop`, url: await presetStill(def.id, take, 2030) });
    }
  }
  return sheet(cells);
}

async function contactSheet(): Promise<string> {
  const cells: { title: string; url: string }[] = [];
  for (const def of TREATMENTS.filter(entry => !ONLY || ONLY.includes(entry.id))) {
    for (const variant of def.variants) {
      // Typewriter and Screenshot are shown late in the song: the page well typed, the chat well filled, the last message arriving.
      cells.push({ title: `${def.title} · ${variant.title}`, url: await still(def.id, variant.id, def.id === 'typewriter' || def.id === 'screenshot' ? 9500 : 2400) });
    }
  }
  return sheet(cells);
}

async function sheet(cells: { title: string; url: string }[]): Promise<string> {
  const thumbW = Number(params.get('thumb')) || 180;
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

/** `?type`: Swap on three beats, Poem, and every letter finish in the monochrome, red and pink song colours, on the plain grain card. */
async function typeSheet(): Promise<string> {
  await ensure();
  await ensureFonts([...typeFamilies('swap', { font: 'Anton', fontSecondary: 'Anton' }), ...typeFamilies('poem', { font: 'Anton', fontSecondary: 'Anton' })]);
  const cells: { title: string; url: string }[] = [];
  for (const beatIndex of [8, 9, 10, 11]) cells.push({ title: `Swap · beat ${beatIndex}`, url: await still('grain', 'fine', 800, { typeStyle: 'swap', beatIndex }) });
  for (const typeAccent of [MONO_ACCENT, '#e5383b', '#ff4fa3']) {
    cells.push({ title: `Poem · ${typeAccent}`, url: await still('grain', 'fine', 600, { typeStyle: 'poem', typeAccent }) });
    for (const typeFinish of TYPE_FINISHES) cells.push({ title: `${typeFinish} · ${typeAccent}`, url: await still('grain', 'fine', 600, { typeStyle: 'karaoke', typeFinish, typeAccent }) });
  }
  return sheet(cells);
}

async function mount() {
  const presets = new URLSearchParams(location.search).has('presets');
  const type = new URLSearchParams(location.search).has('type');
  const img = new Image();
  img.src = type ? await typeSheet() : presets ? await presetSheet() : await contactSheet();
  img.alt = presets ? 'Every edit preset and take, calm and on the drop' : 'Every treatment × four variants';
  img.style.display = 'block';
  img.style.maxWidth = '100%';
  document.body.appendChild(img);
}

Object.assign(window, { treatmentLab: { still, contactSheet, presetStill, presetSheet, treatments: TREATMENTS } });
void mount();
