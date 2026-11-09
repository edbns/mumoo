/**
 * Dust Lab: a prototype page for the Dust scene. Exposes window.dustLab so a script can draw any
 * moment of a song with any pair of colours and read the frame back.
 */
import { Application, Assets } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { loadDisplayFonts } from './ad-fonts';
import { impactSignals } from './lyric-motion';
import { createDustWorld, sampleDust, type DustWorld } from './pack-dust';
import { dustColors, type DustColors } from './dust-colors';

type Setup = { imageUrl: string; beatsMs: number[]; downbeatsMs: number[]; grains?: number; antialias?: boolean };
type Moment = { ms: number; colors?: DustColors; seed?: number; hue?: number; word?: string; power?: number };

let app: Application | null = null;
let world: DustWorld | null = null;
let beatsMs: number[] = [];
let downbeatsMs: number[] = [];

const lab = {
  async prepare(setup: Setup) {
    await loadDisplayFonts('HELLO');
    world?.destroy();
    app?.destroy(true, { children: true });
    app = new Application();
    await app.init({ width: WIDTH, height: HEIGHT, preference: 'webgl', autoStart: false, sharedTicker: false, antialias: setup.antialias ?? true, background: '#000000', resolution: 1 });
    document.body.appendChild(app.canvas);
    const image = await Assets.load(setup.imageUrl) as { source: { resource: CanvasImageSource & { width: number; height: number } } };
    const started = performance.now();
    const points = sampleDust(image.source.resource, setup.grains);
    world = createDustWorld(points);
    app.stage.addChild(world.root);
    beatsMs = setup.beatsMs;
    downbeatsMs = setup.downbeatsMs;
    return { grains: points.count, sampleMs: Math.round(performance.now() - started) };
  },
  /** Draws one moment; returns the draw time in ms and, when asked, the frame as JPEG (read in the same task it was drawn in). */
  frame(moment: Moment, capture = false) {
    if (!app || !world) throw new Error('Call prepare() first.');
    const started = performance.now();
    const { beat } = impactSignals({ beatsMs, energy: [] }, moment.ms);
    world.update({
      ms: moment.ms,
      beatsMs,
      downbeatsMs,
      beat,
      colors: moment.colors ?? dustColors(moment.seed ?? 1, moment.hue),
      word: moment.word ?? 'HELLO',
      font: 'Anton',
      power: moment.power,
    });
    app.render();
    // Force the GPU to finish so the time is the real cost of the frame.
    const gl = app.canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    gl?.finish();
    return { ms: performance.now() - started, jpeg: capture ? app.canvas.toDataURL('image/jpeg', 0.92).split(',', 2)[1] : '' };
  },
  colors: dustColors,
};

Object.assign(window, { dustLab: lab });
