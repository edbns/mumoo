import { useEffect, useRef, useState } from 'react';
import { playheadFrame, type Composition } from '../composition';
import type { ReactiveTimeline } from '../assembly';
import { createEditorialScene } from './scene';

export function PixiPreview({ position, timeline, composition, seed, footageUrl, footageKind, surfaceExperiment }: { position: number; timeline: ReactiveTimeline | null; composition: Composition; seed: number; footageUrl?: string; footageKind?: 'image' | 'video'; surfaceExperiment?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<{ render: (frame: number) => Promise<unknown>; destroy: () => void } | null>(null);
  const requested = useRef(0);
  const busy = useRef(false);
  const [message, setMessage] = useState('Preparing visual…');
  const cueKey = JSON.stringify(composition.version === 1 ? [composition.lyric] : composition.cues);
  function renderLatest() {
    if (busy.current || !scene.current) return;
    busy.current = true;
    const activeScene = scene.current;
    void (async () => {
      try {
        while (scene.current === activeScene) {
          const next = requested.current;
          await activeScene.render(next);
          if (next === requested.current) break;
        }
      } catch { if (scene.current === activeScene) setMessage('The visual could not display this frame.'); }
      finally { busy.current = false; if (scene.current && scene.current !== activeScene) renderLatest(); }
    })();
  }
  useEffect(() => {
    let cancelled = false;
    let instance: { render: (frame: number) => Promise<unknown>; destroy: () => void } | null = null;
    const target = canvas.current;
    if (!target) return;
    const create = surfaceExperiment && footageUrl && footageKind === 'image'
      ? import('../pixi-surface/scene').then(({ createSurfaceScene }) => createSurfaceScene(target, timeline, seed, composition, footageUrl))
      : createEditorialScene(target, timeline, seed, true, composition, footageUrl, footageKind);
    void create.then(value => {
      instance = value;
      if (cancelled) { value.destroy(); return; }
      scene.current = value;
      setMessage(value.compatibility === 'hardware' ? 'Hardware-accelerated preview' : value.compatibility === 'software' ? 'This device is using software graphics; preview and export may be slow.' : 'Graphics acceleration could not be verified; performance may vary.');
      renderLatest();
    }).catch(() => { if (!cancelled) setMessage('This media could not be previewed. Try another image or video.'); });
    return () => { cancelled = true; scene.current = null; if (instance) instance.destroy(); };
  // Scene inputs change only when the selected clip, analysis, cues or variation changes.
  }, [timeline, seed, cueKey, composition.clipStartMs, composition.sourceSha256, footageUrl, footageKind, surfaceExperiment]);
  useEffect(() => {
    requested.current = playheadFrame(position);
    renderLatest();
  }, [position]);
  return <><canvas key={`${seed}:${footageUrl ?? 'image'}:${surfaceExperiment}`} ref={canvas} width={1080} height={1920} aria-label="Pixi visual preview" /><p role="status">{message}</p></>;
}
