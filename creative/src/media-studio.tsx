import { useEffect, useMemo, useRef, useState } from 'react';
import { FRAMES, HEIGHT, WIDTH, playheadFrame, type Composition } from './composition';
import type { CreativeProfileV1 } from './creative-profile';
import { assembleMediaEdit, type MediaAsset, type MediaEdit } from './media-timeline';
import { createMediaRenderer } from './media-renderer';
import { mediaRequest } from './media-admin';

type Candidate = { id: string; type: 'image'; title: string; previewUrl: string; sourceUrl: string; status: 'approved'; commercialUseEligible: boolean; explanation: string; tags: string[] };
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
  const requested = useRef(0); const busy = useRef(false); const [error, setError] = useState('');
  const cueKey = JSON.stringify(composition.version === 2 ? composition.cues : [composition.lyric]);
  function renderLatest() {
    if (busy.current || !renderer.current) return;
    const active = renderer.current; busy.current = true;
    void (async () => { try { while (renderer.current === active) { const frame = requested.current; await active.render(frame); if (frame === requested.current) break; } }
      catch { if (renderer.current === active) setError('The preview could not display this frame.'); }
      finally { busy.current = false; if (renderer.current && renderer.current !== active) renderLatest(); } })();
  }
  useEffect(() => {
    const target = canvas.current; if (!target) return;
    let cancelled = false; let instance: Awaited<ReturnType<typeof createMediaRenderer>> | null = null;
    onReady(false); setError('');
    void createMediaRenderer(target, edit, composition).then(value => { instance = value; if (cancelled) { value.destroy(); return; } renderer.current = value; onReady(true); renderLatest(); })
      .catch(() => { if (!cancelled) setError('One or more media files could not be loaded.'); });
    return () => { cancelled = true; renderer.current = null; if (instance) instance.destroy(); onReady(false); };
  }, [edit, cueKey, composition.sourceSha256, composition.clipStartMs]);
  useEffect(() => { requested.current = playheadFrame(position); renderLatest(); }, [position]);
  return <><canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label="Automatic video preview" onContextMenu={event => event.preventDefault()} /><span className="preview-mark">PREVIEW</span>{error && <p role="alert">{error}</p>}</>;
}
export function MediaStudio({ profile, composition, audio, token, position, playing, onPlay, onStop, onBack }: { profile: CreativeProfileV1; composition: Composition; audio: AudioBuffer; token: string; position: number; playing: boolean; onPlay: () => void; onStop: () => void; onBack: () => void }) {
  const [result, setResult] = useState<{ intent: unknown; candidates: Candidate[] } | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [edit, setEdit] = useState<MediaEdit | null>(null);
  const [userAssets, setUserAssets] = useState<MediaAsset[]>([]); const urls = useRef<string[]>([]);
  const catalogUrls = useRef<string[]>([]); const [loadingMedia, setLoadingMedia] = useState(false);
  const [previewReady, setPreviewReady] = useState(false); const [progress, setProgress] = useState<number>();
  const profileData = useMemo(() => mediaProfile(profile), [profile.musicAnalysis, profile.videoType, profile.creator.primaryGenre.value, profile.creator.influence?.value]);
  const request = JSON.stringify(profileData);
  useEffect(() => () => { urls.current.forEach(URL.revokeObjectURL); }, []);
  useEffect(() => () => { catalogUrls.current.forEach(URL.revokeObjectURL); }, []);
  useEffect(() => {
    if (!profileData || !token) { setResult(null); return; }
    let cancelled = false; setBusy(true); setError(''); setResult(null); setEdit(null);
    void mediaRequest(token, { operation: 'recommend', profile: profileData }).then(data => {
      if (cancelled) return;
      if (!Array.isArray(data?.candidates)) throw new Error('Invalid response.');
      const candidates: Candidate[] = data.candidates.filter((item: Candidate) => item?.status === 'approved' && item.commercialUseEligible === true && item.type === 'image' && /^https:\/\/images\.metmuseum\.org\//.test(item.previewUrl));
      setResult({ intent: data.intent, candidates });
    }).catch(() => { if (!cancelled) setError('Recommendations are unavailable. Try again later.'); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [request, token]);
  function makeEdit(assets: MediaAsset[]) { try { onStop(); setEdit(assembleMediaEdit(profile.clip, profile.musicAnalysis, assets)); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The edit could not be made.'); } }
  async function makeCatalogEdit(items: Candidate[]) {
    setLoadingMedia(true); setError(''); onStop();
    const created: string[] = [];
    try {
      const assets: MediaAsset[] = [];
      for (const item of items) {
        const response = await fetch('/api/media-catalog', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mumoo-Brain-Access': token }, body: JSON.stringify({ operation: 'asset', id: item.id }) });
        if (!response.ok) throw new Error('An approved image could not be loaded. Please try again.');
        const blob = await response.blob(); const url = URL.createObjectURL(blob); created.push(url);
        assets.push({ id: item.id, type: 'image', url, title: item.title });
      }
      catalogUrls.current.forEach(URL.revokeObjectURL); catalogUrls.current = created;
      makeEdit(assets);
    } catch (cause) { created.forEach(URL.revokeObjectURL); setError(cause instanceof Error ? cause.message : 'Approved media could not be loaded.'); }
    finally { setLoadingMedia(false); }
  }
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
  return <main className="desktop gallery-page"><section className="gallery-shell"><p className="eyebrow">YOUR VIDEO</p><h1>Recommended for your music</h1>
    <button className="secondary" onClick={onBack}>Back to music</button>
    {profile.musicAnalysis.status === 'pending' && <p role="status">Analyzing your selected music…</p>}
    {(profile.musicAnalysis.status === 'unavailable' || profile.musicAnalysis.status === 'error') && <p role="alert">Music analysis is unavailable. A music-timed edit and recommendations cannot be generated yet.</p>}
    {busy && <p role="status">Finding approved media…</p>}{error && <p role="alert">{error}</p>}
    {result && <>{result.candidates.length ? <><p>Media selected from the approved collection.</p><div className="gallery-grid">{result.candidates.map(item => <article className="gallery-card" key={item.id}><img src={item.previewUrl} alt={item.title} loading="lazy" style={{ width: '100%', aspectRatio: '9 / 16', objectFit: 'cover' }} /><strong>{item.title}</strong><p className="hint">{item.explanation}</p></article>)}</div><button onClick={() => void makeCatalogEdit(result.candidates.slice(0, 4))} disabled={result.candidates.length < 2 || loadingMedia}>{loadingMedia ? 'Preparing your video…' : 'Create video from recommendations'}</button></> : <p>No approved media is available yet.</p>}</>}
    <h2>Use your own media</h2><label>Add images or videos<input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={event => { selectFiles(event.target.files); event.target.value = ''; }} /></label><p className="hint">Choose 2–10 files, up to 250 MB total. Your files stay on this device.</p>{userAssets.length > 0 && <p>{userAssets.length} files selected</p>}<button disabled={userAssets.length < 2 || profile.musicAnalysis.status !== 'ready'} onClick={() => makeEdit(userAssets)}>Create video from your media</button>
    {edit && <section className="lyric-review"><h2>Your video</h2><div className="gallery-user-preview">{progress === undefined && <Preview edit={edit} composition={composition} position={position} onReady={setPreviewReady} />}</div><div className="trim-actions"><button disabled={!previewReady || progress !== undefined} onClick={() => playing ? onStop() : onPlay()}>{playing ? 'Pause' : 'Play'}</button><button disabled={!previewReady || progress !== undefined} onClick={() => void exportEdit()}>Download MP4</button></div>{progress !== undefined && <p role="status">Rendering video · {progress}%</p>}</section>}
    {debug && token && <details><summary>Staging: inspect media decisions</summary><pre>{JSON.stringify({ musicAnalysis: observedAnalysis, brainRequest: profileData, brainResponse: result, edit: edit ? { version: edit.version, shots: edit.shots } : null }, null, 2)}</pre></details>}
  </section></main>;
}
