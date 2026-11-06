import { useEffect, useMemo, useRef, useState } from 'react';
import { FRAMES, HEIGHT, WIDTH, playheadFrame, type Composition, type ImpactMusic, type ImpactVariant, type ImpactWorldId } from './composition';
import type { CreativeProfileV1 } from './creative-profile';
import { IMPACT_STYLES, IMPACT_WORLD_FEATURES, worldCompatible, worldMeta } from './lyric-impact';
import { draw, loadFont } from './render';
import { renderMp4 } from './browser-export';

function clipMusic(profile: CreativeProfileV1): ImpactMusic | null {
  if (profile.musicAnalysis.status !== 'ready') return null;
  const data = profile.musicAnalysis.result;
  const spectrum = data.features.frames.slice(0, 2000).map(point => {
    const band = data.temporalV1?.bins?.find(bin => point.timeMs >= bin.startMs && point.timeMs < bin.endMs);
    return {
      timeMs: Math.max(0, Math.min(15000, Math.round(point.timeMs))),
      centroidHz: Math.max(0, point.centroidHz),
      lowShare: Math.max(0, Math.min(1, band?.bandShares.low ?? Math.max(0, Math.min(1, 1 - point.centroidHz / 8000)))),
    };
  });
  return {
    beatsMs: data.rhythm.beatsMs.slice(0, 500),
    energy: data.features.frames.slice(0, 2000).map(point => ({
      timeMs: Math.max(0, Math.min(15000, Math.round(point.timeMs))),
      rms: Math.max(0, Math.min(1, point.rms)),
    })),
    onsetsMs: data.features.transientsMs.filter(ms => Number.isSafeInteger(ms) && ms >= 0 && ms <= 15000).slice(0, 800),
    spectrum,
  };
}

export function LyricImpactStudio({ profile, composition, audio, token, position, playing, playbackError, onPlay, onStop, onSeek, onBack, onDaily, onHuman, onCuriosity, onMontage }: {
  profile: CreativeProfileV1; composition: Composition; audio: AudioBuffer; token: string; position: number; playing: boolean; playbackError: string;
  onPlay: () => void; onStop: () => void; onSeek: (ms: number) => void; onBack: () => void; onDaily: () => void; onHuman: () => void; onCuriosity: () => void; onMontage: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [style, setStyle] = useState<ImpactVariant>('monument');
  const [world, setWorld] = useState<ImpactWorldId | null>(null);
  const [eligible, setEligible] = useState(false); const [error, setError] = useState('');
  const [progress, setProgress] = useState<number>(); const [label, setLabel] = useState('');
  const [lastExport, setLastExport] = useState('');
  const cues = profile.approvedLyrics?.cues ?? []; const cueKey = JSON.stringify(cues);
  const genre = profile.creator.primaryGenre.value; const influence = profile.creator.influence?.value;
  const preparingMusic = profile.musicAnalysis.status === 'pending';
  const music = useMemo(() => clipMusic(profile), [profile.musicAnalysis]);
  const activeWorld = world && worldCompatible(world, style) ? world : null;
  const impactComposition: Composition = { ...composition, template: 'lyric-impact', dailyScreen: undefined, lyricImpact: { style, music, world: activeWorld } };
  const selectedMeta = IMPACT_STYLES.find(item => item.id === style) ?? IMPACT_STYLES[0];
  const selectedWorld = activeWorld ? worldMeta(activeWorld) : null;

  useEffect(() => {
    if (profile.videoType !== 'lyric' || !token || !cues.length) { setEligible(false); return; }
    const controller = new AbortController(); setEligible(false); setError('');
    void fetch('/api/brain-recommendations', { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Mumoo-Brain-Access': token },
      body: JSON.stringify({ version: 1, videoType: 'lyric', primaryGenre: genre, ...(influence && { influence }) }) })
      .then(async response => {
        if (!response.ok) throw new Error('Lyric Impact is unavailable.');
        const data = await response.json();
        if (!Array.isArray(data.catalog) || !data.catalog.some((item: { id?: unknown; renderer?: { template?: unknown } }) => item.id === 'lyric-impact' && item.renderer?.template === 'lyric-impact')) throw new Error('Lyric Impact is not available yet.');
        await loadFont(cues.map(cue => cue.text).join(' '));
        if (!controller.signal.aborted) setEligible(true);
      }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Lyric Impact is unavailable.'); });
    return () => controller.abort();
  }, [token, genre, influence, cueKey, profile.videoType]);

  useEffect(() => {
    if (eligible && canvas.current) draw(canvas.current, impactComposition, playheadFrame(position));
  }, [eligible, position, cueKey, style, music, activeWorld]);

  function selectWorldFeature(feature: typeof IMPACT_WORLD_FEATURES[number]) {
    setWorld(feature.world);
    setStyle(feature.style);
  }

  function selectStyle(next: ImpactVariant) {
    setStyle(next);
    // Typography catalog is typography-only; worlds are selected from the featured row.
    setWorld(null);
  }

  async function download(mode: 'current' | 'styles' | 'worlds' = 'current') {
    if (!eligible || !cues.length || preparingMusic) return;
    onStop(); setError(''); setProgress(0); setLastExport('');
    try {
      const jobs = mode === 'worlds'
        ? IMPACT_WORLD_FEATURES.map(item => ({ style: item.style, world: item.world as ImpactWorldId | null, name: item.title, file: `mumoo-lyric-world-${item.world}.mp4` }))
        : mode === 'styles'
          ? IMPACT_STYLES.map(item => ({ style: item.id, world: null as ImpactWorldId | null, name: item.name, file: `mumoo-lyric-impact-${item.id}.mp4` }))
          : [{ style, world: activeWorld, name: selectedWorld ? `${selectedWorld.name} · ${selectedMeta.name}` : selectedMeta.name, file: activeWorld ? `mumoo-lyric-world-${activeWorld}.mp4` : `mumoo-lyric-impact-${style}.mp4` }];
      const files: Record<string, Uint8Array> = {}; let blob: Blob | undefined;
      const started = performance.now();
      let peakHeap = 0;
      for (let index = 0; index < jobs.length; index++) {
        const item = jobs[index]; setLabel(jobs.length > 1 ? `${item.name} · ${index + 1} of ${jobs.length}` : item.name);
        const edit: Composition = { ...impactComposition, lyricImpact: { style: item.style, music, world: item.world } };
        blob = await renderMp4(edit, audio, frame => setProgress(Math.floor((index + frame / FRAMES) / jobs.length * 100)));
        if (jobs.length > 1) files[item.file] = new Uint8Array(await blob.arrayBuffer());
        const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
        if (heap) peakHeap = Math.max(peakHeap, heap);
      }
      if (jobs.length > 1) { const { zipSync } = await import('fflate'); blob = new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' }); }
      if (!blob) throw new Error('No video was created.');
      const seconds = (performance.now() - started) / 1000;
      setLastExport(peakHeap
        ? `Exported in ${seconds.toFixed(1)}s · peak JS heap ${(peakHeap / 1048576).toFixed(0)} MB`
        : `Exported in ${seconds.toFixed(1)}s`);
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url;
      link.download = jobs.length > 1 ? (mode === 'worlds' ? 'mumoo-lyric-worlds.zip' : 'mumoo-lyric-impact.zip') : jobs[0].file;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The video could not be exported.'); }
    finally { setProgress(undefined); }
  }

  return <main className="desktop gallery-page"><section className="gallery-shell">
    <p className="eyebrow">YOUR LYRIC VIDEO</p><h1>Lyric Impact</h1>
    <p className="intro">Kinetic typography — and cinematic visual worlds that wrap around it.</p>
    <div className="trim-actions"><button className="secondary" disabled={progress !== undefined} onClick={onBack}>Back to lyrics</button><button className="secondary" disabled={progress !== undefined} onClick={onDaily}>Daily Screens</button><button className="secondary" disabled={progress !== undefined} onClick={onHuman}>Human Magnet</button><button className="secondary" disabled={progress !== undefined} onClick={onCuriosity}>Visual Curiosity</button><button className="secondary" disabled={progress !== undefined} onClick={onMontage}>Rhythmic Montage</button></div>
    {!eligible && !error && <p role="status">Preparing your styles…</p>}
    {error && <p role="alert">{error}</p>}{playbackError && <p role="alert">{playbackError}</p>}
    {eligible && preparingMusic && <p role="status">Finishing music analysis for your styles…</p>}
    {eligible && <>
      <p className="impact-section-label">Cinematic worlds</p>
      <div className="impact-worlds" role="group" aria-label="Choose a cinematic world">
        {IMPACT_WORLD_FEATURES.map(item => {
          const meta = worldMeta(item.world);
          const pressed = activeWorld === item.world && style === item.style;
          return (
            <button
              type="button"
              key={item.world}
              className="impact-card impact-world-card"
              disabled={progress !== undefined}
              aria-label={item.title}
              aria-pressed={pressed}
              onClick={() => selectWorldFeature(item)}
              style={{ ['--impact-paper' as string]: meta.paper, ['--impact-ink' as string]: '#fff', ['--impact-accent' as string]: meta.accent }}
            >
              <span className="impact-swatch" aria-hidden="true">
                <span className="impact-swatch-type">{item.title.slice(0, 1)}</span>
              </span>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </button>
          );
        })}
      </div>
      <p className="impact-section-label">Typography catalog</p>
      <div className="impact-gallery" role="group" aria-label="Choose a lyric style">
        {IMPACT_STYLES.map(item => (
          <button
            type="button"
            key={item.id}
            className="impact-card"
            disabled={progress !== undefined}
            aria-label={item.name}
            aria-pressed={style === item.id}
            onClick={() => selectStyle(item.id)}
            style={{ ['--impact-paper' as string]: item.paper, ['--impact-ink' as string]: item.ink, ['--impact-accent' as string]: item.accent }}
          >
            <span className="impact-swatch" aria-hidden="true">
              <span className="impact-swatch-type">{item.name.slice(0, 1)}</span>
            </span>
            <strong>{item.name}</strong>
            <small>{item.description}</small>
          </button>
        ))}
      </div>
      <p className="hint">{selectedWorld ? `${selectedWorld.name} · ${selectedMeta.name}` : selectedMeta.name} · {selectedWorld ? selectedWorld.description : selectedMeta.description} · {IMPACT_STYLES.length} designs</p>
      <div className="gallery-user-preview"><canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label="Lyric Impact preview" onContextMenu={event => event.preventDefault()} /><span className="preview-mark">PREVIEW</span></div>
      <div className="trim-actions"><button disabled={progress !== undefined} onClick={() => playing ? onStop() : onPlay()}>{playing ? 'Pause' : 'Play'}</button>
        <button disabled={progress !== undefined || preparingMusic} onClick={() => void download('current')}>Download MP4</button>
        <button className="secondary" disabled={progress !== undefined || preparingMusic} onClick={() => void download('worlds')}>Download 3 worlds</button>
        <button className="secondary" disabled={progress !== undefined || preparingMusic} onClick={() => void download('styles')}>Download all styles</button></div>
      <label className="daily-seek">Seek preview<input type="range" min={0} max={15000} step={1} value={Math.floor(position)} disabled={progress !== undefined} onChange={event => onSeek(event.target.valueAsNumber)} /></label>
      {progress !== undefined && <p role="status">Creating {label} · {progress}%</p>}
      {lastExport && progress === undefined && <p className="hint" role="status">{lastExport}</p>}
    </>}
  </section></main>;
}
