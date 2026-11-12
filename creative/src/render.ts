import '@fontsource-variable/inter';
import { evaluate, WIDTH, HEIGHT, type Composition } from './composition';

const FONT = '800 112px "Inter Variable"';

export async function loadFont(text: string) {
  const fonts = await document.fonts.load(FONT, text || 'MUMOO');
  if (!fonts.length) throw new Error('The bundled Inter font could not load.');
}

export function draw(canvas: HTMLCanvasElement, composition: Composition, frame: number) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  const { text, phase } = evaluate(composition, frame);
  context.fillStyle = '#f7f7f8';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  if (!text) return;

  context.save();
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
  context.fillStyle = '#151515';
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
