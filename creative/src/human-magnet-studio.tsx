import { useEffect, useMemo, useState } from 'react';
import { FRAMES, type Composition } from './composition';
import type { CreativeProfileV1 } from './creative-profile';
import { directorExecutionEdit, type ExecutableEdit } from './director-plan';
import { mediaRequest } from './media-admin';
import { buildVisionMusicProfile } from './vision-music-profile';
import { inspectHumanFootage } from './human-observation';
import { createStudioRenderer, Preview } from './media-studio';
import { renderMp4 } from './browser-export';

const TREATMENTS = [{ id: 'face', label: 'Face First' }, { id: 'movement', label: 'Movement' }, { id: 'fashion', label: 'Fashion Moment' }, { id: 'presence', label: 'Cinematic Presence' }] as const;
type Treatment = typeof TREATMENTS[number]['id'];
type Asset = { id: string; query: string; sourceUrl: string; creator: string };

export function HumanMagnetStudio({ profile, composition, audio, token, position, playing, playbackError, onPlay, onStop, onBack, onOther, onRetry }: {
  profile: CreativeProfileV1; composition: Composition; audio: AudioBuffer; token: string; position: number; playing: boolean; playbackError: string;
  onPlay: () => void; onStop: () => void; onBack: () => void; onOther: () => void; onRetry: () => void;
}) {
  const [treatment, setTreatment] = useState<Treatment>('face'); const [seed] = useState(() => crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff);
  const [attempt, setAttempt] = useState(0);
  const [edit, setEdit] = useState<ExecutableEdit | null>(null); const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [ready, setReady] = useState(false); const [progress, setProgress] = useState<number>();
  const visionProfile = useMemo(() => buildVisionMusicProfile(profile), [profile]);
  const profileKey = JSON.stringify(visionProfile);
  useEffect(() => {
    if (!visionProfile || !token) { setEdit(null); setAssets([]); setReady(false); return; }
    let cancelled = false; const controller = new AbortController(); const urls: string[] = [];
    setBusy(true); setError(''); setEdit(null); setAssets([]); setReady(false);
    void (async () => {
      const initial = await mediaRequest(token, { operation: 'human-plan', profile: visionProfile, treatment, seed, observations: [] });
      if (initial?.status !== 'ready') throw new Error('Not enough suitable footage was found for this style. Try another.');
      if (!Array.isArray(initial.assets)) throw new Error('The footage plan is unavailable.');
      const pending = new Map<string, string>(initial.assets.map((asset: Asset) => [asset.id, `blob:pending-${asset.id}`]));
      const first = directorExecutionEdit(profile.clip, initial, pending, composition, visionProfile.clipSha256);
      const loaded = new Map<string, string>(); const observations = [];
      for (const asset of initial.assets as Asset[]) {
        if (controller.signal.aborted) return;
        const response = await fetch('/api/media-catalog', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-Mumoo-Brain-Access': token }, body: JSON.stringify({ operation: 'research-asset', id: asset.id, query: asset.query }) });
        if (!response.ok) throw new Error(response.status === 429 ? 'Please wait a minute before trying another style.' : 'Footage could not be loaded. Please try again.');
        const blob = await response.blob(); if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob); urls.push(url); loaded.set(asset.id, url);
        const shot = first.shots.find(item => item.assetId === asset.id); if (!shot) throw new Error('The footage plan is incomplete.');
        const samples = await inspectHumanFootage(url, shot.sourceOutMs - shot.sourceInMs, controller.signal);
        observations.push({ id: asset.id, samples });
      }
      if (controller.signal.aborted) return;
      const result = await mediaRequest(token, { operation: 'human-plan', profile: visionProfile, treatment, seed, observations });
      if (cancelled) return;
      const finalEdit = directorExecutionEdit(profile.clip, result, loaded, composition, visionProfile.clipSha256);
      setAssets(result.assets as Asset[]); setEdit(finalEdit);
    })().catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'The video could not be prepared.'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; controller.abort(); urls.forEach(URL.revokeObjectURL); };
  }, [profileKey, token, treatment, seed, attempt]);

  async function download() {
    if (!edit || progress !== undefined) return;
    onStop(); setProgress(0); setError(''); let renderer: Awaited<ReturnType<typeof createStudioRenderer>> | undefined;
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      const video = await renderMp4(composition, audio, frame => setProgress(Math.floor(frame / FRAMES * 100)), async (target, frame) => {
        renderer ??= await createStudioRenderer(target, edit, composition); await renderer.render(frame);
      });
      const url = URL.createObjectURL(video); const link = document.createElement('a'); link.href = url; link.download = `mumoo-human-${treatment}.mp4`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The video could not be exported.'); }
    finally { renderer?.destroy(); setProgress(undefined); }
  }
  return <main className="desktop gallery-page"><section className="gallery-shell">
    <p className="eyebrow">YOUR MUSIC VIDEO</p><h1>Human Magnet</h1><p className="intro">Real people, movement and presence, set to your music.</p>
    <div className="trim-actions"><button className="secondary" disabled={progress !== undefined} onClick={onBack}>Back to music</button><button className="secondary" disabled={progress !== undefined} onClick={onOther}>{profile.videoType === 'lyric' ? 'Lyric formats' : 'Other visuals'}</button></div>
    <p className="hint">Staging research only. Footage has not been cleared for advertising or release. Videos by <a href="https://pixabay.com/" target="_blank" rel="noreferrer">Pixabay</a>.</p>
    <div className="daily-designs" role="group" aria-label="Choose a Human Magnet style">{TREATMENTS.map(style => <button key={style.id} type="button" disabled={progress !== undefined} aria-pressed={treatment === style.id} onClick={() => { onStop(); setTreatment(style.id); }}>{style.label}</button>)}</div>
    {!token && <p role="alert">Staging access is unavailable. Go back and sign in again.</p>}
    {(profile.musicAnalysis.status === 'pending' || profile.musicAnalysis.status === 'unavailable') && <p role="status">Analyzing your selected music…</p>}
    {profile.musicAnalysis.status === 'error' && <><p role="alert">Music analysis is unavailable.</p><button onClick={onRetry}>Retry music analysis</button></>}
    {profile.musicAnalysis.status === 'ready' && !visionProfile && <p role="alert">The music analysis does not match this selection. Please select your clip again.</p>}
    {busy && <p role="status">Finding and preparing footage…</p>}{error && <><p role="alert">{error}</p><button className="secondary" disabled={busy || progress !== undefined} onClick={() => setAttempt(value => value + 1)}>Try again</button></>}{playbackError && <p role="alert">{playbackError}</p>}
    {edit && <><div className="gallery-user-preview">{progress === undefined && <Preview edit={edit} composition={composition} position={position} onReady={setReady} />}</div>
      <div className="trim-actions"><button disabled={!ready || progress !== undefined} onClick={() => playing ? onStop() : onPlay()}>{playing ? 'Pause' : 'Play'}</button><button disabled={!ready || progress !== undefined} onClick={() => void download()}>Download MP4</button></div>
      {progress !== undefined && <p role="status">Rendering video · {progress}%</p>}
      <details><summary>Footage sources</summary>{assets.map(asset => <p key={asset.id}>{/^https:\/\/pixabay\.com\//u.test(asset.sourceUrl) ? <a href={asset.sourceUrl} target="_blank" rel="noreferrer">{asset.creator || 'Pixabay contributor'}</a> : 'Pixabay contributor'} · Pixabay</p>)}</details></>}
  </section></main>;
}
