/**
 * Signs that the person's browser, not mumoo, is what keeps the previews from playing: it draws without the graphics card,
 * has no WebGL at all, or plays the live preview at a crawl. Our own failures are not counted here (they go to the admin as
 * problems); this only decides when to suggest another browser, once per visit, and tells the admin which browser it was.
 */
import { useSyncExternalStore } from 'react';
import { reportProblem } from './report-problem';

export type Trouble = 'no-graphics' | 'software' | 'slow';

const DISMISSED = 'mumoo-browser-trouble-dismissed';
/** A live preview that finishes fewer frames than this each second, over `SLOW_WINDOW_MS` of playing, is a crawl. */
const SLOW_FPS = 4;
const SLOW_WINDOW_MS = 5000;
/** A live preview with no frame finished for this long, while the page is on screen, is stuck. */
const STUCK_MS = 5000;
const WARM_MS = 3000;

let trouble: Trouble | null = null;
const listeners = new Set<() => void>();

export function browserName(): string {
  const nav = navigator as Navigator & { brave?: unknown; userAgentData?: { brands?: { brand: string }[] } };
  if (nav.brave) return 'Brave';
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Other';
}

function dismissed(): boolean {
  try { return sessionStorage.getItem(DISMISSED) === '1'; } catch { return false; }
}

export function noteTrouble(kind: Trouble, detail: string) {
  if (trouble) return;
  trouble = kind;
  reportProblem('render', `Browser trouble (${kind}) in ${browserName()}: ${detail}`);
  if (!dismissed()) for (const listener of listeners) listener();
}

export function dismissTrouble() {
  try { sessionStorage.setItem(DISMISSED, '1'); } catch { /* private mode: it shows again next visit */ }
  for (const listener of listeners) listener();
}

/** The trouble to tell the person about, or null (none, or they dismissed it this visit). */
export function useBrowserTrouble(): Trouble | null {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => (dismissed() ? null : trouble),
    () => null,
  );
}

/** What to tell the person: the browser's part and what they can do, never ours. */
export function troubleMessage(kind: Trouble): string {
  const brave = browserName() === 'Brave';
  if (kind === 'no-graphics') return 'This browser can’t play video previews. Open mumoo in Chrome or Safari to see your videos.';
  if (kind === 'software') return 'This browser is set to play video without graphics acceleration, so previews will be slow. Turn on “Use graphics acceleration” in its settings, or open mumoo in Chrome or Safari.';
  return brave
    ? 'Video previews are struggling in Brave. Turn off Shields for mumoo, or open it in Chrome or Safari.'
    : 'Video previews are struggling in this browser. For smooth playback, open mumoo in Chrome or Safari.';
}

let checked = false;

/** Asks the browser once whether it can draw with the graphics card at all. */
export function checkGraphics() {
  if (checked) return;
  checked = true;
  try {
    const canvas = document.createElement('canvas');
    const strict = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ?? canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (strict) { (strict as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext(); return; }
    const any = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    if (any) { (any as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext(); noteTrouble('software', 'WebGL only without the graphics card'); return; }
    noteTrouble('no-graphics', 'no WebGL');
  } catch {
    noteTrouble('no-graphics', 'WebGL threw');
  }
}

/**
 * Watches one live preview: call `drawn()` each time a frame finishes and `tick()` on every animation frame while it plays.
 * A crawl or a stall is noted as trouble; `stop()` when the preview stops.
 */
export function watchPlayback() {
  const start = performance.now();
  let last = start;
  let frames = 0;
  let windowStart = start;
  let done = false;
  return {
    drawn() {
      last = performance.now();
      frames++;
    },
    tick() {
      const now = performance.now();
      // The first seconds read the card's clips; a hidden tab draws nothing on purpose.
      if (done || now - start < WARM_MS || document.visibilityState !== 'visible') { windowStart = now; frames = 0; last = now; return; }
      if (now - last > STUCK_MS) { done = true; noteTrouble('slow', `no frame for ${Math.round((now - last) / 1000)} s`); return; }
      if (now - windowStart >= SLOW_WINDOW_MS) {
        const fps = frames / ((now - windowStart) / 1000);
        if (fps < SLOW_FPS) { done = true; noteTrouble('slow', `${fps.toFixed(1)} frames a second`); return; }
        windowStart = now;
        frames = 0;
      }
    },
    stop() { done = true; },
  };
}
