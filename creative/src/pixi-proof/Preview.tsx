import { useEffect, useRef, useState } from 'react';
import { playheadFrame, type Composition } from '../composition';
import type { ReactiveTimeline } from '../assembly';
import { createEditorialScene } from './scene';

export function PixiPreview({ position, timeline, composition, seed }: { position: number; timeline: ReactiveTimeline | null; composition: Composition; seed: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Awaited<ReturnType<typeof createEditorialScene>> | null>(null);
  const requested = useRef(0);
  const busy = useRef(false);
  const [message, setMessage] = useState('Preparing visual…');
  const cueKey = JSON.stringify(composition.version === 1 ? [composition.lyric] : composition.cues);
  function renderLatest() {
    if (busy.current || !scene.current) return;
    busy.current = true;
    void (async () => {
      try {
        while (scene.current) {
          const next = requested.current;
          await scene.current.render(next);
          if (next === requested.current) break;
        }
      } catch { setMessage('The visual could not display this frame.'); }
      finally { busy.current = false; }
    })();
  }
  useEffect(() => {
    let cancelled = false;
    let instance: Awaited<ReturnType<typeof createEditorialScene>> | null = null;
    const target = canvas.current;
    if (!target) return;
    void createEditorialScene(target, timeline, seed, true, composition).then(value => {
      instance = value;
      if (cancelled) { value.destroy(); return; }
      scene.current = value;
      setMessage(value.compatibility === 'hardware' ? 'Hardware-accelerated preview' : value.compatibility === 'software' ? 'This device is using software graphics; preview and export may be slow.' : 'Graphics acceleration could not be verified; performance may vary.');
      renderLatest();
    }).catch(() => { if (!cancelled) setMessage('This browser could not start the visual. Try the existing preview instead.'); });
    return () => { cancelled = true; scene.current = null; if (instance) instance.destroy(); };
  // Scene inputs change only when the selected clip, analysis, cues or variation changes.
  }, [timeline, seed, cueKey, composition.clipStartMs, composition.sourceSha256]);
  useEffect(() => {
    requested.current = playheadFrame(position);
    renderLatest();
  }, [position]);
  return <><canvas ref={canvas} width={1080} height={1920} aria-label="Pixi visual preview" /><p role="status">{message}</p></>;
}
