import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { HEIGHT, WIDTH, type DomDailyScreenVariant, type LyricCue } from './composition';
import { DomDailyScreen } from './daily-screens-dom';

type CaptureOptions = {
  variant: DomDailyScreenVariant;
  capturedAtMs: number;
  deviceSeed?: number;
};

let host: HTMLDivElement | undefined;
let root: Root | undefined;
let lastKey = '';

function ensureHost() {
  if (host && root) return { host, root };
  host = document.createElement('div');
  host.id = 'mumoo-dom-daily-capture-host';
  host.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'width:1080px',
    'height:1920px',
    'margin:0',
    'padding:0',
    'overflow:hidden',
    'pointer-events:none',
    'z-index:-1',
  ].join(';');
  document.body.appendChild(host);
  root = createRoot(host);
  return { host, root };
}

async function paintDomTree(cues: readonly LyricCue[], frame: number, options: CaptureOptions) {
  const nodes = ensureHost();
  const key = `${options.variant}|${options.capturedAtMs}|${options.deviceSeed ?? ''}|${frame}|${cues.map(cue => `${cue.text}:${cue.startMs}`).join('|')}`;
  if (key !== lastKey) {
    lastKey = key;
    nodes.root.render(createElement(DomDailyScreen, {
      variant: options.variant,
      cues,
      frame,
      capturedAtMs: options.capturedAtMs,
      deviceSeed: options.deviceSeed,
    }));
    // Let React commit layout before capture.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
  return nodes.host;
}

/** Capture one React/CSS Daily Screen frame into the Mediabunny canvas. */
export async function captureDomDailyScreen(
  canvas: HTMLCanvasElement,
  cues: readonly LyricCue[],
  frame: number,
  options: CaptureOptions,
) {
  const source = await paintDomTree(cues, frame, options);
  const snapped = await html2canvas(source, {
    width: WIDTH,
    height: HEIGHT,
    windowWidth: WIDTH,
    windowHeight: HEIGHT,
    scale: 1,
    backgroundColor: null,
    logging: false,
    useCORS: true,
    imageTimeout: 0,
  });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(snapped, 0, 0, WIDTH, HEIGHT);
}

export function disposeDomDailyScreenCapture() {
  root?.unmount();
  host?.remove();
  root = undefined;
  host = undefined;
  lastKey = '';
}
