import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FRAMES, HEIGHT, WIDTH, playheadFrame, type Composition, type DailyScreenVariant } from './composition';
import type { CreativeProfileV1 } from './creative-profile';
import { SCREEN_DESIGNS } from './daily-screens';
import { paintDailyScreen } from './daily-screens-paint';
import { renderMp4 } from './browser-export';
import { loadFont } from './render';

export function DailyScreensStudio({ profile, composition, audio, token, position, getPosition, playing, playbackError, onPlay, onStop, onSeek, onBack, onOther, onImpact, onHuman, onCuriosity, onMontage }: {
  profile: CreativeProfileV1; composition: Composition; audio: AudioBuffer; token: string; position: number;
  getPosition?: () => number;
  playing: boolean; playbackError: string; onPlay: () => void; onStop: () => void; onSeek: (ms: number) => void; onBack: () => void; onOther: () => void; onImpact: () => void; onHuman: () => void; onCuriosity: () => void; onMontage: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const getPositionRef = useRef(getPosition ?? (() => position));
  getPositionRef.current = getPosition ?? (() => position);
  const cuesRef = useRef(profile.approvedLyrics?.cues ?? []);
  const [eligible, setEligible] = useState(false); const [error, setError] = useState('');
  const [impactEligible, setImpactEligible] = useState(false);
  const [progress, setProgress] = useState<number>();
  const [variant, setVariant] = useState<DailyScreenVariant>('messages');
  const [capturedAtMs] = useState(() => Date.now());
  const [deviceSeed] = useState(() => crypto.getRandomValues(new Uint32Array(1))[0]);
  const [exportLabel, setExportLabel] = useState('');
  const cues = profile.approvedLyrics?.cues ?? [];
  cuesRef.current = cues;
  const cueKey = JSON.stringify(cues);
  const genre = profile.creator.primaryGenre.value;
  const influence = profile.creator.influence?.value;

  useEffect(() => {
    if (profile.videoType !== 'lyric' || !token || !cues.length) { setEligible(false); return; }
    const controller = new AbortController(); setEligible(false); setImpactEligible(false); setError('');
    void fetch('/api/brain-recommendations', { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Mumoo-Brain-Access': token },
      body: JSON.stringify({ version: 1, videoType: 'lyric', primaryGenre: genre, ...(influence && { influence }) }) })
      .then(async response => {
        if (!response.ok) throw new Error('Recommendations are unavailable.');
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!Array.isArray(data.catalog)) throw new Error('Recommendations are unavailable.');
        const hasImpact = data.catalog.some((entry: { id?: unknown; renderer?: { template?: unknown } }) => entry.id === 'lyric-impact' && entry.renderer?.template === 'lyric-impact');
        setImpactEligible(hasImpact);
        if (!data.catalog.some((entry: { id?: unknown; renderer?: { template?: unknown } }) => entry.id === 'daily-screens' && entry.renderer?.template === 'daily-screens')) throw new Error('Daily Screens is not available for this song yet.');
        await loadFont(cues.map(cue => cue.text).join(' '));
        if (controller.signal.aborted) return;
        setEligible(true);
      }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Recommendations are unavailable.'); });
    return () => controller.abort();
  }, [token, genre, influence, cueKey, profile.videoType]);

  // Paint from the live audio playhead (not React state) so lyrics stay locked to WhisperX.
  // key={variant} remounts the canvas so a stale GPU/bitmap cannot stick black after switching.
  useLayoutEffect(() => {
    if (!eligible) return;
    if (!canvas.current) return;
    let alive = true;
    let raf = 0;
    const options = { variant, capturedAtMs, deviceSeed };
    const paint = () => {
      if (!alive || !canvas.current) return;
      try {
        const ms = getPositionRef.current();
        void paintDailyScreen(canvas.current, cuesRef.current, playheadFrame(ms), options);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Preview failed to draw.');
      }
    };
    paint();
    if (playing) {
      const loop = () => {
        paint();
        if (alive) raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [eligible, playing, variant, cueKey, capturedAtMs, deviceSeed, position, progress]);

  async function download(all = false) {
    if (!eligible || !cues.length) return;
    onStop(); setError(''); setProgress(0);
    try {
      const selected = all ? SCREEN_DESIGNS : SCREEN_DESIGNS.filter(design => design.id === variant);
      const files: Record<string, Uint8Array> = {};
      let blob: Blob | undefined;
      for (let index = 0; index < selected.length; index++) {
        const design = selected[index]; setExportLabel(all ? `${design.name} · ${index + 1} of ${selected.length}` : design.name);
        const dailyScreen = { variant: design.id, capturedAtMs, deviceSeed };
        blob = await renderMp4({ ...composition, template: 'daily-screens', dailyScreen }, audio,
          exportFrame => setProgress(Math.floor((index + exportFrame / FRAMES) / selected.length * 100)),
          (target, exportFrame) => paintDailyScreen(target, cues, exportFrame, dailyScreen));
        if (all) files[`mumoo-${design.id}.mp4`] = new Uint8Array(await blob.arrayBuffer());
      }
      if (all) { const { zipSync } = await import('fflate'); blob = new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' }); }
      if (!blob) throw new Error('No video was created.');
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = all ? 'mumoo-daily-screens.zip' : `mumoo-${variant}.mp4`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The video could not be exported.'); }
    finally { setProgress(undefined); }
  }

  return <main className="desktop gallery-page"><section className="gallery-shell">
    <p className="eyebrow">YOUR LYRIC VIDEO</p><h1>Daily Screens</h1>
    <p className="intro">Your lyrics, in a familiar everyday moment.</p>
    <div className="trim-actions"><button className="secondary" disabled={progress !== undefined} onClick={onBack}>Back to lyrics</button>{impactEligible && <button className="secondary" disabled={progress !== undefined} onClick={onImpact}>Lyric Impact</button>}<button className="secondary" disabled={progress !== undefined} onClick={onHuman}>Human Magnet</button><button className="secondary" disabled={progress !== undefined} onClick={onCuriosity}>Visual Curiosity</button><button className="secondary" disabled={progress !== undefined} onClick={onMontage}>Rhythmic Montage</button><button className="secondary" disabled={progress !== undefined} onClick={onOther}>Other visuals</button></div>
    {!eligible && !error && <p role="status">Preparing your recommendation…</p>}
    {error && <p role="alert">{error}</p>}
    {playbackError && <p role="alert">{playbackError}</p>}
    {eligible && <><div className="daily-designs" role="group" aria-label="Choose a screen design">{SCREEN_DESIGNS.map(design => <button type="button" key={design.id} disabled={progress !== undefined} aria-pressed={variant === design.id} onClick={() => setVariant(design.id)}>{design.name}</button>)}</div>
      <div className="gallery-user-preview">
        <canvas key={variant} ref={canvas} width={WIDTH} height={HEIGHT} aria-label="Daily Screens preview" onContextMenu={event => event.preventDefault()} />
        <span className="preview-mark">PREVIEW</span>
      </div>
      <div className="trim-actions"><button disabled={progress !== undefined} onClick={() => playing ? onStop() : onPlay()}>{playing ? 'Pause' : 'Play'}</button>
        <button disabled={progress !== undefined} onClick={() => void download()}>Download MP4</button>
        <button className="secondary" disabled={progress !== undefined} onClick={() => void download(true)}>Download all screens</button></div>
      <label className="daily-seek">Seek preview<input type="range" min={0} max={15000} step={1} value={Math.floor(position)} disabled={progress !== undefined} onChange={event => onSeek(event.target.valueAsNumber)} /></label>
      {progress !== undefined && <p role="status">Creating {exportLabel} · {progress}%</p>}</>}
  </section></main>;
}
