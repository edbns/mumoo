import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { draw } from './render';
import { playheadFrame, type Composition } from './composition';
import type { CreativeProfileV1 } from './creative-profile';
import { VISUAL_CATALOG } from './visual-catalog';

type Entry = { id: string; name: string; description: string; renderer: { kind: 'existing_canvas'; template: 'scribble' | 'elastic' | 'glitch' }; explanation?: string };
type Result = { recommendations: Entry[]; catalog: Entry[] };

export function profileForBrain(profile: CreativeProfileV1) {
  const state = profile.musicAnalysis;
  const base = { version: 1, videoType: profile.videoType, primaryGenre: profile.creator.primaryGenre.value,
    ...(profile.creator.influence && { influence: profile.creator.influence.value }) };
  if (state.status !== 'ready' || !state.result.features.frames.length) return base;
  const data = state.result, frames = data.features.frames;
  return { ...base, music: { beatsMs: data.rhythm.beatsMs, tempoStatus: data.rhythm.tempo.status,
    gridBpm: data.rhythm.tempo.gridBpm, rmsMean: frames.reduce((sum, f) => sum + f.rms, 0) / frames.length,
    onsetCount: data.features.transientsMs.length, centroidHz: frames.reduce((sum, f) => sum + f.centroidHz, 0) / frames.length,
    dynamics: 'unavailable' } };
}

function Frame({ composition, active, position }: { composition: Composition; active: boolean; position: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cueKey = JSON.stringify(composition.version === 2 ? composition.cues : [composition.lyric]);
  const still = composition.version === 2 ? composition.cues[0]?.startMs ?? 0 : composition.lyric.startMs;
  const frame = active ? playheadFrame(position) : Math.min(449, Math.ceil(still * 30 / 1000));
  useEffect(() => { if (ref.current) draw(ref.current, composition, frame); }, [composition.template, cueKey, frame]);
  return <canvas ref={ref} width={1080} height={1920} aria-label="Composition preview" onContextMenu={event => event.preventDefault()} />;
}

export function RecommendationGallery({ profile, composition, position, playing, activeId, selected, onPlay, onToggle, onBack, onGenerate, exporting, progress, exportError, footageUrl, onFootage, userPreview, surfaceEnabled }: {
  profile: CreativeProfileV1; composition: Composition; position: number; playing: boolean; activeId: string | null;
  selected: string[]; onPlay: (id: string) => void; onToggle: (id: string) => void; onBack: () => void;
  onGenerate: () => void; exporting: boolean; progress?: number; exportError: string;
  footageUrl?: string; onFootage: (file?: File) => void; userPreview: ReactNode; surfaceEnabled: boolean;
}) {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const data = useMemo(() => JSON.stringify(profileForBrain(profile)), [profile.videoType, profile.creator.primaryGenre.value, profile.creator.influence?.value, profile.musicAnalysis]);
  useEffect(() => {
    if (!token) return;
    const abort = new AbortController();
    setLoading(true); setMessage(''); setResult(null);
    void fetch('/api/brain-recommendations', { method: 'POST', signal: abort.signal,
      headers: { 'Content-Type': 'application/json', 'X-Mumoo-Brain-Access': token }, body: data })
      .then(async response => {
        if (response.status === 401) { setToken(''); throw new Error('Your staging access expired. Please sign in again.'); }
        if (!response.ok) throw new Error('Recommendations are temporarily unavailable. Please try again.');
        return response.json();
      }).then(value => {
        const eligible = new Map(VISUAL_CATALOG.filter(e => e.videoTypes.includes(profile.videoType)).map(e => [e.id, e]));
        const safe = (entry: Entry) => eligible.has(entry.id) && entry.renderer?.kind === 'existing_canvas' && entry.renderer.template === entry.id;
        if (!Array.isArray(value.catalog) || !Array.isArray(value.recommendations)) throw new Error('Recommendations are temporarily unavailable.');
        const catalog: Entry[] = value.catalog.filter(safe);
        const ids = new Set(catalog.map(e => e.id));
        setResult({ catalog, recommendations: value.recommendations.filter((e: Entry) => safe(e) && ids.has(e.id)).slice(0, 8) });
      }).catch(error => { if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : 'Recommendations are temporarily unavailable.'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [token, data, profile.videoType, retry]);
  const displayComposition = useMemo(() => composition, [composition]);
  const validSelection = selected.length === 1 && (['user-video', 'surface-experiment'].includes(selected[0]) ? Boolean(footageUrl) && (selected[0] !== 'surface-experiment' || surfaceEnabled) : Boolean(result?.catalog.some(entry => entry.id === selected[0])));
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setMessage('');
    try {
      const response = await fetch('/api/brain-tester-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      setPassword('');
      if (!response.ok) throw new Error('Staging access could not be verified.');
      const value = await response.json(); if (typeof value.token !== 'string') throw new Error('Staging access could not be verified.');
      setToken(value.token);
    } catch (error) { setPassword(''); setMessage(error instanceof Error ? error.message : 'Staging access could not be verified.'); }
  }
  function cards(items: Entry[], keyPrefix: string) {
    return <div className="gallery-grid">{items.map(entry => <article className="gallery-card" key={`${keyPrefix}-${entry.id}`}>
      <div className="gallery-frame"><Frame composition={{ ...displayComposition, template: entry.renderer.template }} active={activeId === `${keyPrefix}:${entry.id}`} position={position} /><span className="preview-mark">PREVIEW</span></div>
      <strong>{entry.name}</strong>{entry.explanation && <p className="hint">{entry.explanation}</p>}
      <div className="gallery-actions"><button type="button" onClick={() => onPlay(`${keyPrefix}:${entry.id}`)}>{activeId === `${keyPrefix}:${entry.id}` && playing ? 'Pause' : 'Play'}</button>
      <button type="button" className={selected.includes(entry.id) ? 'selected' : 'secondary'} aria-pressed={selected.includes(entry.id)} onClick={() => onToggle(entry.id)}>{selected.includes(entry.id) ? 'Selected ✓' : 'Select'}</button></div>
    </article>)}</div>;
  }
  return <main className="desktop gallery-page"><section className="gallery-shell">
    <p className="eyebrow">YOUR VIDEO</p><h1>Choose your visuals</h1><p className="intro">Preview and select compositions for your 15-second track.</p>
    <button className="secondary" onClick={onBack}>Back to music</button>
    {!token && <form className="staging-access" onSubmit={event => void signIn(event)}><label>Staging tester password<input type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} /></label><button disabled={!password}>Continue</button></form>}
    {profile.musicAnalysis.status === 'pending' && <p role="status">Analyzing your music…</p>}
    {(profile.musicAnalysis.status === 'error' || profile.musicAnalysis.status === 'unavailable') && <p className="hint">Music analysis is unavailable; recommendations can still use your selected genre.</p>}
    {loading && <p role="status">Finding your visuals…</p>}{message && <><p role="alert">{message}</p>{token && <button onClick={() => setRetry(value => value + 1)}>Try recommendations again</button>}</>}
    {result && <><h2>Recommended for you</h2>{result.recommendations.length ? cards(result.recommendations, 'recommended') : <p>No eligible recommendations are available yet.</p>}
      {result.recommendations.length > 0 && result.recommendations.length < 8 && <p className="hint">{result.recommendations.length} eligible recommendations are available right now.</p>}
      <h2>All available compositions</h2>{result.catalog.length ? cards(result.catalog, 'catalog') : <p>No compositions are available for this video type yet.</p>}</>}
    <h2>Use your own media</h2><label>Add an image or video<input type="file" accept="video/mp4,video/webm,image/jpeg,image/png,image/webp" disabled={exporting} onChange={event => { onFootage(event.target.files?.[0]); event.target.value = ''; }} /></label>
    <p className="hint">One image or video, up to 250 MB, stays on this device. It fills the frame; short videos repeat.</p>
    {footageUrl && <div className="gallery-actions"><button onClick={() => onPlay('user-video')}>{activeId === 'user-video' && playing ? 'Pause your media' : 'Play your media'}</button><button className={selected.includes('user-video') ? 'selected' : 'secondary'} aria-pressed={selected.includes('user-video')} onClick={() => onToggle('user-video')}>{selected.includes('user-video') ? 'Selected ✓' : 'Select your media'}</button></div>}
    {surfaceEnabled && <><p className="hint">{profile.musicAnalysis.status === 'ready' ? 'Experiment uses analyzed beats, transients and energy.' : 'Experiment uses repeatable test signals because music analysis is unavailable.'}</p><div className="gallery-actions"><span>Internal image-surface experiment</span><button onClick={() => onPlay('surface-experiment')}>{activeId === 'surface-experiment' && playing ? 'Pause experiment' : 'Play experiment'}</button><button className={selected.includes('surface-experiment') ? 'selected' : 'secondary'} aria-pressed={selected.includes('surface-experiment')} onClick={() => onToggle('surface-experiment')}>{selected.includes('surface-experiment') ? 'Selected ✓' : 'Select experiment'}</button></div></>}
    {footageUrl && (activeId === 'user-video' || activeId === 'surface-experiment') && <div className="gallery-user-preview">{userPreview}<span className="preview-mark">PREVIEW</span></div>}
    <div className="generate-bar"><span>{selected.length} selected</span><button disabled={!validSelection || exporting} onClick={onGenerate}>Generate Selected</button>{selected.length > 1 && <span>Single-video export is available now. Select one to generate it.</span>}</div>
    {exporting && <p role="status">Rendering MP4 · {progress}%</p>}{exportError && <p role="alert">{exportError}</p>}
  </section></main>;
}
