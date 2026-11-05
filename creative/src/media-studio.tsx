import { useEffect, useMemo, useRef, useState } from 'react';
import { FRAMES, HEIGHT, WIDTH, playheadFrame, type Composition } from './composition';
import type { CreativeProfileV1 } from './creative-profile';
import { assembleMediaEdit, directorEdit, researchDirectorEdit, type MediaAsset, type MediaEdit } from './media-timeline';
import { createMediaRenderer } from './media-renderer';
import { mediaRequest } from './media-admin';
import { trace, traces } from './staging-diagnostics';

export function mediaProfile(profile: CreativeProfileV1) {
  if (profile.musicAnalysis.status !== 'ready') return null;
  const data = profile.musicAnalysis.result, frames = data.features.frames;
  if (!frames.length) return null;
  return { version: 1, videoType: profile.videoType, primaryGenre: profile.creator.primaryGenre.value,
    ...(profile.creator.influence && { influence: profile.creator.influence.value }),
    music: { beatsMs: data.rhythm.beatsMs, tempoStatus: data.rhythm.tempo.status, gridBpm: data.rhythm.tempo.gridBpm,
      rmsMean: frames.reduce((sum, frame) => sum + frame.rms, 0) / frames.length,
      onsetCount: data.features.transientsMs.length, centroidHz: frames.reduce((sum, frame) => sum + frame.centroidHz, 0) / frames.length, dynamics: 'unavailable' } };
}
function Preview({ edit, composition, position, onReady }: { edit: MediaEdit; composition: Composition; position: number; onReady: (ready: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null); const renderer = useRef<Awaited<ReturnType<typeof createMediaRenderer>> | null>(null);
  const requested = useRef(0); const busy = useRef(false); const [error, setError] = useState(''); const [hasFrame, setHasFrame] = useState(false);
  const firstFrame = useRef(false); const previewStarted = useRef(0);
  const cueKey = JSON.stringify(composition.version === 2 ? composition.cues : [composition.lyric]);
  function renderLatest() {
    if (busy.current || !renderer.current) return;
    const active = renderer.current; busy.current = true;
    void (async () => { try { while (renderer.current === active) { const frame = requested.current; await active.render(frame); if (renderer.current === active && !firstFrame.current) { firstFrame.current = true; setHasFrame(true); trace('preview_ready', { durationMs: Math.round(performance.now() - previewStarted.current) }); onReady(true); } if (frame === requested.current) break; } }
      catch { if (renderer.current === active) { trace('preview_failed', { category: 'frame_render' }); onReady(false); setError('The preview could not display this frame.'); } }
      finally { busy.current = false; if (renderer.current && renderer.current !== active) renderLatest(); } })();
  }
  useEffect(() => {
    const target = canvas.current; if (!target) return;
    let cancelled = false; let instance: Awaited<ReturnType<typeof createMediaRenderer>> | null = null;
    onReady(false); setError(''); setHasFrame(false); firstFrame.current = false;
    const started = performance.now(); previewStarted.current = started; trace('preview_loading');
    void createMediaRenderer(target, edit, composition).then(value => { instance = value; if (cancelled) { value.destroy(); return; } trace('preview_renderer_ready', { durationMs: Math.round(performance.now() - started) }); renderer.current = value; renderLatest(); })
      .catch(() => { if (!cancelled) { trace('preview_failed', { category: 'media_load', durationMs: Math.round(performance.now() - started) }); setError('One or more media files could not be loaded.'); } });
    return () => { cancelled = true; renderer.current = null; if (instance) instance.destroy(); onReady(false); };
  }, [edit, cueKey, composition.sourceSha256, composition.clipStartMs]);
  useEffect(() => { requested.current = playheadFrame(position); renderLatest(); }, [position]);
  return <><canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label="Automatic video preview" onContextMenu={event => event.preventDefault()} /><span className="preview-mark">PREVIEW</span>{!hasFrame && !error && <p role="status">Preparing preview…</p>}{error && <p role="alert">{error}</p>}</>;
}
export function MediaStudio({ profile, composition, audio, token, position, playing, playbackError, onPlay, onStop, onBack, onRetry }: { profile: CreativeProfileV1; composition: Composition; audio: AudioBuffer; token: string; position: number; playing: boolean; playbackError: string; onPlay: () => void; onStop: () => void; onBack: () => void; onRetry: () => void }) {
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [edit, setEdit] = useState<MediaEdit | null>(null);
  const [userAssets, setUserAssets] = useState<MediaAsset[]>([]); const urls = useRef<string[]>([]);
  const [previewReady, setPreviewReady] = useState(false); const [progress, setProgress] = useState<number>();
  const profileData = useMemo(() => mediaProfile(profile), [profile.musicAnalysis, profile.videoType, profile.creator.primaryGenre.value, profile.creator.influence?.value]);
  const request = JSON.stringify(profileData);
  useEffect(() => () => { urls.current.forEach(URL.revokeObjectURL); }, []);
  useEffect(() => {
    if (!profileData || !token) { setResult(null); trace('director_not_started', { category: !token ? 'access_missing' : 'analysis_not_ready' }); return; }
    let cancelled = false; const researchUrls: string[] = []; setBusy(true); setError(''); setResult(null); setEdit(null);
    const started = performance.now(); trace('director_started');
    const onsetsMs = profile.musicAnalysis.status === 'ready' ? profile.musicAnalysis.result.features.transientsMs : [];
    const research = (location.hostname === 'mumoo-staging.netlify.app' || (import.meta.env.DEV && location.hostname === '127.0.0.1')) && new URLSearchParams(location.search).get('catalog-eval') === '1';
    const stagingOwned = research && new URLSearchParams(location.search).get('staging-owned') === '1';
    void mediaRequest(token, { operation: research ? 'research-plan' : 'director', profile: profileData, onsetsMs, ...(stagingOwned && { stagingOwned: true }) }).then(async data => {
      if (cancelled) return;
      trace('director_response', { durationMs: Math.round(performance.now() - started), category: data?.status === 'ready' ? 'ready' : 'unavailable' });
      setResult(data);
      if (data?.status !== 'ready') { setError('Not enough approved footage or music timing is available yet.'); return; }
      if (!research) { setEdit(directorEdit(profile.clip, data)); return; }
      if (!Array.isArray(data.assets) || data.assets.length < 2 || data.assets.length > 4) throw new Error('Invalid catalog plan.');
      const loaded = new Map<string, string>();
      for (const asset of data.assets) {
        if (typeof asset?.id !== 'string' || !/^(?:cma-\d+|si-[a-f0-9]{24}|commons2-\d+|owned-[a-f0-9]{24})$/.test(asset.id)) throw new Error('Invalid catalog asset.');
        const assetStarted = performance.now(); trace('asset_fetch_started');
        const response = await fetch('/api/media-catalog', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mumoo-Brain-Access': token }, body: JSON.stringify({ operation: 'research-asset', id: asset.id }) });
        trace('asset_fetch_response', { status: response.status, durationMs: Math.round(performance.now() - assetStarted) });
        if (!response.ok) throw new Error('Approved media is unavailable.');
        const blob = await response.blob(); if (cancelled) return;
        const url = URL.createObjectURL(blob); researchUrls.push(url); loaded.set(asset.id, url);
      }
      if (!cancelled) setEdit(researchDirectorEdit(profile.clip, data, loaded));
    }).catch(() => { if (!cancelled) { trace('director_failed', { durationMs: Math.round(performance.now() - started), category: 'request_or_validation' }); setError('The video could not be prepared. Try again later.'); } }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; researchUrls.forEach(URL.revokeObjectURL); };
  }, [request, token]);
  function makeEdit(assets: MediaAsset[]) { try { onStop(); setEdit(assembleMediaEdit(profile.clip, profile.musicAnalysis, assets)); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The edit could not be made.'); } }
  function selectFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files); const allowed = ['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'];
    if (list.length > 10 || list.some(file => !allowed.includes(file.type) || !file.size) || list.reduce((sum, file) => sum + file.size, 0) > 250 * 1024 * 1024) { setError('Choose up to 10 JPG, PNG, WebP, MP4 or WebM files, totaling no more than 250 MB.'); return; }
    onStop(); setEdit(null); urls.current.forEach(URL.revokeObjectURL); urls.current = list.map(file => URL.createObjectURL(file));
    setUserAssets(list.map((file, i) => ({ id: `user-${i}`, type: file.type.startsWith('image/') ? 'image' : 'video', url: urls.current[i], title: file.name })));
    setError('');
  }
  async function exportEdit() {
    if (!edit || progress !== undefined) return;
    onStop(); setProgress(0); setError(''); let renderer: Awaited<ReturnType<typeof createMediaRenderer>> | undefined;
    try { await new Promise<void>(resolve => setTimeout(resolve, 0)); const { renderMp4 } = await import('./browser-export');
      const video = await renderMp4(composition, audio, frame => setProgress(Math.floor(frame / FRAMES * 100)), async (target, frame) => {
        renderer ??= await createMediaRenderer(target, edit, composition); await renderer.render(frame);
      });
      const url = URL.createObjectURL(video); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'mumoo-video.mp4'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The video could not be exported.'); }
    finally { renderer?.destroy(); setProgress(undefined); }
  }
  const debug = new URLSearchParams(location.search).get('media-debug') === '1';
  const observedAnalysis = profile.musicAnalysis.status === 'ready' ? { status: 'ready', beatsMs: profile.musicAnalysis.result.rhythm.beatsMs,
    transientsMs: profile.musicAnalysis.result.features.transientsMs, tempo: profile.musicAnalysis.result.rhythm.tempo,
    energyFrames: profile.musicAnalysis.result.features.frames.map(({ timeMs, rms, onsetStrength, centroidHz }) => ({ timeMs, rms, onsetStrength, centroidHz })) } : { status: profile.musicAnalysis.status };
  const diagnostic = { musicAnalysis: observedAnalysis, brainRequest: { profile: profileData, onsetsMs: profile.musicAnalysis.status === 'ready' ? profile.musicAnalysis.result.features.transientsMs : [] }, directorBlueprint: result, edit: edit ? { version: edit.version, shots: edit.shots } : null, diagnostics: traces() };
  function downloadDiagnostic() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(diagnostic, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'mumoo-director-blueprint.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return <main className="desktop gallery-page"><section className="gallery-shell"><p className="eyebrow">YOUR VIDEO</p><h1>Your music video</h1>
    {new URLSearchParams(location.search).get('staging-owned') === '1' && <p className="hint">Private staging test: owner-provided footage has not been cleared for advertising or release.</p>}
    <button className="secondary" onClick={onBack}>Back to music</button>
    {(profile.musicAnalysis.status === 'pending' || (profile.musicAnalysis.status === 'unavailable' && token)) && <p role="status">Analyzing your selected music…</p>}
    {profile.musicAnalysis.status === 'error' && <p role="alert">Music analysis is unavailable. A music-timed edit and recommendations cannot be generated yet.</p>}
    {profile.musicAnalysis.status === 'error' && <button onClick={onRetry}>Retry music analysis</button>}
    {!token && <p role="alert">Staging access is unavailable. Go back and sign in again.</p>}
    {profile.musicAnalysis.status === 'ready' && !profileData && <p role="alert">Music analysis did not include the features needed for this video.</p>}
    {busy && <p role="status">Creating your video…</p>}{error && <p role="alert">{error}</p>}
    {playbackError && <p role="alert">{playbackError}</p>}
    <h2>Use your own media</h2><label>Add images or videos<input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={event => { selectFiles(event.target.files); event.target.value = ''; }} /></label><p className="hint">Choose 2–10 files, up to 250 MB total. Your files stay on this device.</p>{userAssets.length > 0 && <p>{userAssets.length} files selected</p>}<button disabled={userAssets.length < 2 || profile.musicAnalysis.status !== 'ready'} onClick={() => makeEdit(userAssets)}>Create video from your media</button>
    {edit && <section className="lyric-review"><h2>Your video</h2><div className="gallery-user-preview">{progress === undefined && <Preview edit={edit} composition={composition} position={position} onReady={setPreviewReady} />}</div><div className="trim-actions"><button disabled={!previewReady || progress !== undefined} onClick={() => playing ? onStop() : onPlay()}>{playing ? 'Pause' : 'Play'}</button><button disabled={!previewReady || progress !== undefined} onClick={() => void exportEdit()}>Download MP4</button></div>{progress !== undefined && <p role="status">Rendering video · {progress}%</p>}</section>}
    {debug && token && <details><summary>Staging: inspect Director Blueprint</summary><p>This file contains music-analysis results and your selected genre; it does not contain your audio, lyrics or password.</p><button className="secondary" onClick={downloadDiagnostic}>Download Blueprint</button><pre>{JSON.stringify(diagnostic, null, 2)}</pre></details>}
  </section></main>;
}
