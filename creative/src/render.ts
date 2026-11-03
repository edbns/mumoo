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
  context.translate(WIDTH / 2, HEIGHT / 2 + Math.sin(phase * 11) * 12);
  context.rotate(Math.sin(phase * 8) * 0.035);
  context.font = FONT;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
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
