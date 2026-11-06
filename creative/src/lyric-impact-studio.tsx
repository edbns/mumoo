import { useEffect, useMemo, useRef, useState } from 'react';
import { FRAMES, HEIGHT, WIDTH, playheadFrame, type Composition, type ImpactMusic, type ImpactVariant } from './composition';
import type { CreativeProfileV1 } from './creative-profile';
import { IMPACT_STYLES } from './lyric-impact';
import { draw, loadFont } from './render';
import { renderMp4 } from './browser-export';

function clipMusic(profile: CreativeProfileV1): ImpactMusic | null {
  if (profile.musicAnalysis.status !== 'ready') return null;
  const data = profile.musicAnalysis.result;
  return { beatsMs: data.rhythm.beatsMs.slice(0, 500), energy: data.features.frames.slice(0, 2000).map(point => ({ timeMs: Math.max(0, Math.min(15000, Math.round(point.timeMs))), rms: Math.max(0, Math.min(1, point.rms)) })) };
}

export function LyricImpactStudio({ profile, composition, audio, token, position, playing, playbackError, onPlay, onStop, onSeek, onBack, onDaily, onHuman, onCuriosity }: {
  profile: CreativeProfileV1; composition: Composition; audio: AudioBuffer; token: string; position: number; playing: boolean; playbackError: string;
  onPlay: () => void; onStop: () => void; onSeek: (ms: number) => void; onBack: () => void; onDaily: () => void; onHuman: () => void; onCuriosity: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [style, setStyle] = useState<ImpactVariant>('poster');
  const [eligible, setEligible] = useState(false); const [error, setError] = useState('');
  const [progress, setProgress] = useState<number>(); const [label, setLabel] = useState('');
  const cues = profile.approvedLyrics?.cues ?? []; const cueKey = JSON.stringify(cues);
  const genre = profile.creator.primaryGenre.value; const influence = profile.creator.influence?.value;
  const preparingMusic = profile.musicAnalysis.status === 'pending';
  const music = useMemo(() => clipMusic(profile), [profile.musicAnalysis]);
  const impactComposition: Composition = { ...composition, template: 'lyric-impact', dailyScreen: undefined, lyricImpact: { style, music } };

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
  }, [eligible, position, cueKey, style, music]);

  async function download(all = false) {
    if (!eligible || !cues.length || preparingMusic) return;
    onStop(); setError(''); setProgress(0);
    try {
      const selected = all ? IMPACT_STYLES : IMPACT_STYLES.filter(item => item.id === style);
      const files: Record<string, Uint8Array> = {}; let blob: Blob | undefined;
      for (let index = 0; index < selected.length; index++) {
        const item = selected[index]; setLabel(all ? `${item.name} · ${index + 1} of ${selected.length}` : item.name);
        const edit: Composition = { ...impactComposition, lyricImpact: { style: item.id, music } };
        blob = await renderMp4(edit, audio, frame => setProgress(Math.floor((index + frame / FRAMES) / selected.length * 100)));
        if (all) files[`mumoo-lyric-impact-${item.id}.mp4`] = new Uint8Array(await blob.arrayBuffer());
      }
      if (all) { const { zipSync } = await import('fflate'); blob = new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' }); }
      if (!blob) throw new Error('No video was created.');
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url;
      link.download = all ? 'mumoo-lyric-impact.zip' : `mumoo-lyric-impact-${style}.mp4`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The video could not be exported.'); }
    finally { setProgress(undefined); }
  }

  return <main className="desktop gallery-page"><section className="gallery-shell">
    <p className="eyebrow">YOUR LYRIC VIDEO</p><h1>Lyric Impact</h1>
    <p className="intro">Your words take center stage.</p>
    <div className="trim-actions"><button className="secondary" disabled={progress !== undefined} onClick={onBack}>Back to lyrics</button><button className="secondary" disabled={progress !== undefined} onClick={onDaily}>Daily Screens</button><button className="secondary" disabled={progress !== undefined} onClick={onHuman}>Human Magnet</button><button className="secondary" disabled={progress !== undefined} onClick={onCuriosity}>Visual Curiosity</button></div>
    {!eligible && !error && <p role="status">Preparing your styles…</p>}
    {error && <p role="alert">{error}</p>}{playbackError && <p role="alert">{playbackError}</p>}
    {eligible && preparingMusic && <p role="status">Finishing music analysis for your styles…</p>}
    {eligible && <><div className="daily-designs" role="group" aria-label="Choose a lyric style">{IMPACT_STYLES.map(item => <button type="button" key={item.id} disabled={progress !== undefined} aria-pressed={style === item.id} onClick={() => setStyle(item.id)}>{item.name}</button>)}</div>
      <p className="hint">{IMPACT_STYLES.find(item => item.id === style)?.description}</p>
      <div className="gallery-user-preview"><canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label="Lyric Impact preview" onContextMenu={event => event.preventDefault()} /><span className="preview-mark">PREVIEW</span></div>
      <div className="trim-actions"><button disabled={progress !== undefined} onClick={() => playing ? onStop() : onPlay()}>{playing ? 'Pause' : 'Play'}</button>
        <button disabled={progress !== undefined || preparingMusic} onClick={() => void download()}>Download MP4</button>
        <button className="secondary" disabled={progress !== undefined || preparingMusic} onClick={() => void download(true)}>Download all styles</button></div>
      <label className="daily-seek">Seek preview<input type="range" min={0} max={15000} step={1} value={Math.floor(position)} disabled={progress !== undefined} onChange={event => onSeek(event.target.valueAsNumber)} /></label>
      {progress !== undefined && <p role="status">Creating {label} · {progress}%</p>}</>}
  </section></main>;
}
