import '@fontsource-variable/inter';
import { evaluate, isDomDailyScreen, isSceneDailyScreen, lyricsFor, WIDTH, HEIGHT, type Composition } from './composition';
import { drawDailyScreen } from './daily-screens';
import { drawLyricImpact } from './lyric-impact';
import { activeLayers, reaction, variation } from './assembly';

const FONT = '800 112px "Inter Variable"';
// Original MUMOO vector artwork, decoded as image layers; no third-party assets.
const art = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#191026"/><circle cx="720" cy="580" r="320" fill="#ff753f"/><path d="M0 1400L380 760 650 1200 850 930 1080 1310V1920H0" fill="#422344"/><path d="M0 1550Q400 1250 1080 1480V1920H0" fill="#151323"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#14252b"/><circle cx="300" cy="500" r="260" fill="#e1cf9b"/><path d="M0 1120L230 920 500 1210 760 800 1080 1100V1920H0" fill="#25615e"/><path d="M0 1530Q500 1250 1080 1550V1920H0" fill="#102b35"/></svg>',
];
const images: HTMLImageElement[] = [];
let artworkReady: Promise<void> | undefined;
function loadArtwork() {
  return artworkReady ??= Promise.all(art.map(async (svg, index) => {
    const image = new Image(); image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    await image.decode(); images[index] = image;
  })).then(() => undefined);
}

export async function loadFont(text: string) {
  const fonts = await document.fonts.load(FONT, `${text} 9:41 Lyrics NOW PLAYING`);
  if (!fonts.length) throw new Error('The bundled Inter font could not load.');
  await loadArtwork();
}

export function draw(canvas: HTMLCanvasElement, composition: Composition, frame: number) {
  if (composition.template === 'daily-screens') {
    const daily = composition.dailyScreen ?? { variant: 'messages' as const, capturedAtMs: 0 };
    if (isDomDailyScreen(daily.variant) || isSceneDailyScreen(daily.variant)) {
      throw new Error('Scene Daily Screens require paintDailyScreen for export.');
    }
    drawDailyScreen(canvas, lyricsFor(composition), frame, daily);
    return;
  }
  if (composition.template === 'lyric-impact') {
    return drawLyricImpact(canvas, lyricsFor(composition), frame, composition.lyricImpact);
  }
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  const { text, phase } = evaluate(composition, frame);
  context.fillStyle = '#f7f7f8';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  const layers = composition.assembly ? activeLayers(composition.assembly.layers, frame) : [];
  if (composition.template === 'horizon' && composition.assembly) {
    const response = reaction(composition.assembly.timeline, frame);
    const direction = variation(composition.assembly.variationSeed, 2) < 0.5 ? -1 : 1;
    for (const { layer, opacity } of layers) {
      if (layer.kind !== 'image') continue;
      const image = images[layer.asset === 'horizon-a' ? 0 : 1];
      if (!image) throw new Error('The original image asset is unavailable.');
      const zoom = 1.08 + response.beat * 0.025 + frame / 450 * 0.04;
      context.save(); context.globalAlpha = opacity; context.translate(WIDTH / 2 + direction * Math.sin(frame / 130) * 35, HEIGHT / 2); context.scale(zoom, zoom);
      context.drawImage(image, -WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT); context.restore();
    }
  }
  const orbitLayer = layers.find(item => item.layer.kind === 'procedural' && item.layer.effect === 'orbit');
  if ((composition.template === 'orbit' || composition.template === 'horizon') && composition.assembly && orbitLayer) {
    context.save(); context.globalAlpha = orbitLayer.opacity;
    const { beat, onset, energy } = reaction(composition.assembly.timeline, frame);
    const time = frame / 30;
    const seed = composition.assembly.variationSeed;
    const count = 8 + Math.floor(variation(seed, 0) * 6);
    const direction = variation(seed, 1) < 0.5 ? -1 : 1;
    if (composition.template === 'orbit') { context.fillStyle = '#10131d'; context.fillRect(0, 0, WIDTH, HEIGHT); }
    context.save(); context.translate(WIDTH / 2, HEIGHT / 2);
    context.rotate(time * 0.08 * direction);
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count + time * 0.35 * direction;
      const radius = 280 + 95 * beat + 90 * energy;
      context.save(); context.rotate(angle); context.translate(radius, 0);
      context.fillStyle = i % 2 ? '#ff5b26' : '#f1d4a8';
      context.fillRect(-20, -120 - onset * 50, 40, 240 + onset * 100); context.restore();
    }
    context.strokeStyle = '#f7f7f8'; context.lineWidth = 7 + beat * 8;
    context.beginPath(); context.arc(0, 0, 205 + beat * 35, 0, Math.PI * 2); context.stroke();
    context.restore();
    context.restore();
  }
  if (!text || (composition.assembly && !layers.some(item => item.layer.kind === 'lyrics'))) return;

  context.save();
  if (composition.assembly) context.globalAlpha = layers.find(item => item.layer.kind === 'lyrics')?.opacity ?? 0;
  context.translate(WIDTH / 2, HEIGHT / 2);
  context.font = FONT;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if (composition.template === 'elastic') {
    const bounce = Math.cos(phase * 15) * Math.exp(-phase * 3);
    context.scale(1 + bounce * 0.20, 1 - bounce * 0.32);
    context.fillStyle = '#551abc';
    context.fillText(text, 0, 0, 880);
    context.restore();
    return;
  }
  if (composition.template === 'glitch') {
    const tick = Math.floor(frame / 3);
    const shift = 12 + (tick * 17 % 29);
    context.fillStyle = '#e02362';
    context.fillText(text, -shift, 4, 840);
    context.fillStyle = '#008caa';
    context.fillText(text, shift, -4, 840);
    context.fillStyle = '#151515';
    context.fillText(text, tick % 3 * 4 - 4, 0, 840);
    context.restore();
    return;
  }
  context.translate(0, Math.sin(phase * 11) * 12);
  context.rotate(Math.sin(phase * 8) * 0.035);
  context.fillStyle = composition.assembly ? '#ffffff' : '#151515';
  context.fillText(text, 0, 0, 880);
  const halfWidth = Math.min(440, context.measureText(text).width / 2);
  context.strokeStyle = '#ff5b26';
  context.lineWidth = 10;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(-halfWidth, 76);
  context.quadraticCurveTo(-halfWidth / 3, 46 + Math.sin(phase * 14) * 18, 0, 69);
  context.quadraticCurveTo(halfWidth / 2, 92, halfWidth, 65);
  context.stroke();
  context.restore();
}
