import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { FPS, playheadFrame, type Composition, type ImpactMusic } from './composition';
import type { CreativeProfileV1 } from './creative-profile';
import { posterFrame } from './lyric-motion';
import { adPunchFallbackText, recommendCreativesPack, recommendOwnPhotoPack, SHELF_ROWS, type CreativesPackSlot, type ShelfRow } from './creatives-pack';
import { OwnPhotos } from './own-photos';
import type { Upload } from './uploads';
import { loadDisplayFonts } from './ad-fonts';
import { deriveMusicIntent } from './music-intent';
import { reportPackFeedback } from './pack-feedback';
import {
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  blitPackFrame,
  destroySharedPackRenderer,
  type PackRendererOpts,
} from './pack-renderer';
import { awaitCloudJob, clipToMonoWav, submitCloudJob } from './pack-cloud-export';
import { loadPunchPlatesManifest } from './punch-plates';

function impactMusic(profile: CreativeProfileV1): ImpactMusic | null {
  if (profile.musicAnalysis.status !== 'ready') return null;
  const data = profile.musicAnalysis.result;
  return {
    beatsMs: data.rhythm.beatsMs.slice(0, 500),
    downbeatsMs: data.rhythm.downbeatsMs.slice(0, 200),
    energy: data.features.frames.slice(0, 2000).map(point => ({
      timeMs: Math.max(0, Math.min(15000, Math.round(point.timeMs))),
      rms: Math.max(0, Math.min(1, point.rms)),
    })),
  };
}

function packOpts(
  slot: CreativesPackSlot,
  composition: Composition,
  music: ImpactMusic | null,
  fallbackText: string,
  lyrics: boolean,
  photoUrl?: string,
): PackRendererOpts {
  return {
    style: slot.style,
    font: slot.font,
    fontSecondary: slot.fontSecondary,
    layout: slot.layout,
    ...(slot.colors ? { colors: slot.colors } : {}),
    ...(slot.filter ? { filter: slot.filter } : {}),
    ...(slot.bankId ? { bankId: slot.bankId } : {}),
    ...(slot.typeStyle ? { typeStyle: slot.typeStyle } : {}),
    ...(slot.grade ? { grade: slot.grade } : {}),
    // With lyrics off nothing about the words is used or sent anywhere.
    cues: lyrics ? composition.cues : [],
    music,
    fallbackText: lyrics ? fallbackText : '',
    lyrics,
    ...(photoUrl ? { photoUrl } : {}),
  };
}

/** The moment a still card shows: the words at their strongest, or, with lyrics off, just after a beat. */
function posterAt(composition: Composition, music: ImpactMusic | null, lyrics: boolean) {
  return lyrics ? posterFrame(composition.cues) : Math.round(((music?.beatsMs[1] ?? 500) + 120) * FPS / 1000);
}

/** After a new deploy, an already-open tab asks for chunk files that no longer exist. */
function friendlyError(cause: unknown, fallback: string): string {
  const message = cause instanceof Error ? cause.message : '';
  if (/dynamically imported module|Importing a module script failed|Loading chunk/i.test(message)) {
    return 'MUMOO was just updated. Reload this page to continue.';
  }
  return message || fallback;
}

function yieldFrame() {
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}

export function CreativesPackStudio({
  profile, composition, audio, token, position, getPosition, playing, playbackError,
  onPlay, onStop, onBack,
}: {
  profile: CreativeProfileV1;
  composition: Composition;
  audio: AudioBuffer;
  token: string;
  position: number;
  getPosition?: () => number;
  playing: boolean;
  playbackError: string;
  onPlay: () => void;
  onStop: () => void;
  onSeek?: (ms: number) => void;
  onBack: () => void;
}) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [generation, setGeneration] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [fontReady, setFontReady] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number>();
  const [progressLabel, setProgressLabel] = useState('');
  /** Whose pictures the shelf is made from: the photography we hold, or one of the person's own photos. */
  const [source, setSource] = useState<'ours' | 'own'>('ours');
  const [photo, setPhoto] = useState<Upload | null>(null);
  const photoUrl = source === 'own' ? photo?.url : undefined;
  /** Ids of the cleared library photos; null until the library has been read. */
  const [plates, setPlates] = useState<string[] | null>(null);
  /** A row appears when all four of its posters are finished; the shelf is ready when every row is. */
  const [readyRows, setReadyRows] = useState<ShelfRow[]>([]);
  const [shelfReady, setShelfReady] = useState(false);
  const [shelfStatus, setShelfStatus] = useState('Preparing creatives…');
  /** The person can switch the lyrics off to get plain moving visuals for any post. */
  const [lyrics, setLyrics] = useState(true);
  const music = useMemo(() => impactMusic(profile), [profile.musicAnalysis]);
  const pack = useMemo(
    () => (source === 'own'
      ? (photo ? recommendOwnPhotoPack(profile, generation) : [])
      : (plates ? recommendCreativesPack(profile, generation, plates, lyrics) : [])),
    [profile.clip.sourceSha256, profile.musicAnalysis, profile.approvedLyrics, profile.lyricMeaning, profile.creator.cover, generation, plates, lyrics, source, photo?.id],
  );
  const picturesReady = source === 'own' || Boolean(plates);
  // The colours the lyrics ask for are part of what each card looks like, so a new grade repaints the shelf.
  const packKey = pack.map(item => `${item.id}:${item.grade ? Object.values(item.grade).join(',') : ''}`).join('|');
  const cueKey = JSON.stringify(composition.cues);
  const intent = useMemo(
    () => (profile.musicAnalysis.status === 'ready' ? deriveMusicIntent(profile.musicAnalysis.result) : null),
    [profile.musicAnalysis],
  );
  const fallbackText = useMemo(() => adPunchFallbackText(profile, intent), [profile, intent]);
  // Lyrics are only needed when they are on.
  const approved = !lyrics || Boolean(profile.approvedLyrics?.cues.length);
  const activeId = playingId || pack[0]?.id || null;
  const activeSlot = pack.find(item => item.id === activeId) ?? pack[0];
  const getPositionRef = useRef(getPosition ?? (() => position));
  getPositionRef.current = getPosition ?? (() => position);
  const playingIdRef = useRef(playingId);
  playingIdRef.current = playingId;
  const paintArgsRef = useRef({ pack, composition, music, fallbackText, photoUrl, lyrics });
  paintArgsRef.current = { pack, composition, music, fallbackText, photoUrl, lyrics };

  useEffect(() => {
    let alive = true;
    void loadPunchPlatesManifest().then(manifest => {
      if (!alive) return;
      setPlates(manifest?.plates.map(plate => plate.id) ?? []);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setFontReady(false);
    const sample = composition.cues.map(cue => cue.text).join(' ') || fallbackText;
    void loadDisplayFonts(sample)
      .then(() => { if (alive) setFontReady(true); })
      .catch(() => { if (alive) setFontReady(true); });
    return () => { alive = false; };
  }, [cueKey, fallbackText]);

  useEffect(() => {
    setPicked([]);
    setPlayingId(null);
    setReadyRows([]);
    setShelfReady(false);
    setShelfStatus('Preparing creatives…');
  }, [generation, profile.clip.sourceSha256, source, photo?.id]);

  // Tear down shared WebGL when leaving the pack screen.
  useEffect(() => () => destroySharedPackRenderer(), []);

  // Posters: paint card by card; each row is revealed as soon as its last card is done.
  useEffect(() => {
    if (!fontReady || !approved || !picturesReady) return;
    let cancelled = false;
    setReadyRows([]);
    setShelfReady(false);
    setShelfStatus('Preparing creatives…');
    setError('');
    void (async () => {
      const { pack: slots, composition: base, music: impact, fallbackText: fallback, lyrics: withLyrics } = paintArgsRef.current;
      // Wait a frame so hidden canvases are mounted with refs.
      await yieldFrame();
      for (let index = 0; index < slots.length; index++) {
        if (cancelled) return;
        const slot = slots[index];
        setShelfStatus(`Preparing creative ${index + 1} of ${slots.length}…`);
        // Allow React to paint status before heavy blit / possible Noir bake.
        await yieldFrame();
        const canvas = canvasRefs.current[index];
        if (!canvas) continue;
        try {
          await blitPackFrame(
            canvas,
            packOpts(slot, base, impact, fallback, withLyrics, paintArgsRef.current.photoUrl),
            posterAt(base, impact, withLyrics),
          );
        } catch (cause) {
          if (!cancelled) {
            setError(friendlyError(cause, 'One creative could not be prepared.'));
          }
        }
        await yieldFrame();
        if (cancelled) return;
        if (slots[index + 1]?.row !== slot.row) setReadyRows(rows => [...rows, slot.row]);
      }
      if (!cancelled) {
        setShelfStatus('');
        setShelfReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [fontReady, approved, picturesReady, packKey, cueKey, music, fallbackText, photoUrl, lyrics]);

  // Live preview — only when shelf is ready + playhead frame changes.
  useEffect(() => {
    if (!shelfReady || !fontReady || !approved || !playing || !playingId) return;
    const index = pack.findIndex(item => item.id === playingId);
    if (index < 0) return;
    const slot = pack[index];
    const canvas = canvasRefs.current[index];
    if (!canvas) return;
    let alive = true;
    let raf = 0;
    const edit = composition;
    const opts = packOpts(slot, edit, music, fallbackText, lyrics, photoUrl);
    let painting = false;
    let lastFrame = -1;

    const paint = (frame: number) => {
      if (!alive || painting || frame === lastFrame) return;
      painting = true;
      lastFrame = frame;
      void blitPackFrame(canvas, opts, frame)
        .catch((cause) => {
          if (alive) {
            setError(friendlyError(cause, 'Live preview is temporarily unavailable. Reload and try again.'));
          }
        })
        .finally(() => { painting = false; });
    };
    paint(playheadFrame(getPositionRef.current()));
    const loop = () => {
      paint(playheadFrame(getPositionRef.current()));
      if (alive) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [shelfReady, fontReady, approved, pack, composition, music, playing, playingId, fallbackText, photoUrl, lyrics]);

  function paintPoster(id: string | null) {
    if (!id || !shelfReady || !fontReady || !approved) return;
    const index = pack.findIndex(item => item.id === id);
    if (index < 0) return;
    const slot = pack[index];
    const canvas = canvasRefs.current[index];
    if (!canvas) return;
    void blitPackFrame(canvas, packOpts(slot, composition, music, fallbackText, lyrics, photoUrl), posterAt(composition, music, lyrics))
      .catch(cause => setError(friendlyError(cause, 'Preview failed (WebGL).')));
  }

  function togglePick(id: string) {
    setPicked(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
      const slot = pack.find(item => item.id === id);
      if (slot && next.includes(id)) reportPackFeedback(token, profile, 'select', slot, { selectedIds: next, generation });
      return next;
    });
  }

  function togglePlay(id: string, event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
    if (!shelfReady || !fontReady || !approved || progress !== undefined) return;
    if (playing && playingId === id) {
      onStop();
      setPlayingId(null);
      paintPoster(id);
      return;
    }
    const previous = playingId;
    setPlayingId(id);
    if (playing) onStop();
    if (previous && previous !== id) paintPoster(previous);
    const slot = pack.find(item => item.id === id);
    if (slot) reportPackFeedback(token, profile, 'play', slot, { generation });
    onPlay();
  }

  async function downloadSelected() {
    const selectedSlots = pack.filter(item => picked.includes(item.id));
    if (!approved || progress !== undefined || !selectedSlots.length || (source === 'own' && !photo)) return;
    onStop(); setPlayingId(null); setError('');
    setProgress(0);
    setProgressLabel('Preparing audio…');
    // Let React paint the progress state before any work.
    await yieldFrame();
    try {
      // 1) One small WAV for the whole batch (≈960 KB).
      const wav = await clipToMonoWav(audio, composition.clipStartMs);
      // 2) Submit every job now — the cloud renders them in parallel; we only hold job ids.
      setProgressLabel(selectedSlots.length > 1 ? `Starting ${selectedSlots.length} cloud renders…` : 'Starting cloud render…');
      const jobs: { slot: CreativesPackSlot; id: string }[] = [];
      for (const slot of selectedSlots) {
        await yieldFrame();
        const id = await submitCloudJob({
          token,
          wav,
          opts: packOpts(slot, composition, music, fallbackText, lyrics, photoUrl),
          photoId: source === 'own' ? photo?.id : undefined,
        });
        jobs.push({ slot, id });
      }
      // 3) Poll. Nothing heavy runs here.
      let done = 0;
      setProgressLabel(selectedSlots.length > 1 ? `Rendering 0 of ${selectedSlots.length} in the cloud…` : 'Rendering in the cloud…');
      const blobs = await Promise.all(jobs.map(async job => {
        const blob = await awaitCloudJob(token, job.id);
        done += 1;
        setProgress(Math.floor((done / jobs.length) * 100));
        if (jobs.length > 1) setProgressLabel(`Rendering ${done} of ${jobs.length} in the cloud…`);
        reportPackFeedback(token, profile, 'download', job.slot, { selectedIds: picked, generation });
        return blob;
      }));

      const multi = blobs.length > 1;
      let blob = blobs[0];
      if (multi) {
        setProgressLabel('Zipping…');
        await yieldFrame();
        const files: Record<string, Uint8Array> = {};
        for (let index = 0; index < blobs.length; index++) {
          files[`mumoo-creative-${index + 1}.mp4`] = new Uint8Array(await blobs[index].arrayBuffer());
        }
        const { zipSync } = await import('fflate');
        blob = new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' });
      }
      if (!blob) throw new Error('No video was created.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = multi ? 'mumoo-creatives.zip' : 'mumoo-creative.mp4';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (cause) {
      setError(friendlyError(cause, 'The creative could not be exported.'));
    } finally {
      setProgress(undefined);
      setProgressLabel('');
    }
  }

  return <main className="desktop gallery-page studio-shell"><section className="gallery-shell panel">
    <p className="eyebrow">Creatives pack</p>
    <h1>{pack.length ? `${pack.length} recommended creatives` : 'Recommended creatives'}</h1>
    <p className="intro">Ranked for this song, one row at a time. Pick the ones you like and download them. Downloads render in the cloud, so your computer stays free.</p>
    <div className="trim-actions">
      <button className="secondary" disabled={progress !== undefined} onClick={onBack}>Back</button>
      <div className="source-switch" role="group" aria-label="Pictures">
        {([['ours', 'Our photography'], ['own', 'Your photo']] as const).map(([id, name]) => (
          <button key={id} type="button" aria-pressed={source === id} disabled={progress !== undefined} onClick={() => { onStop(); setPlayingId(null); setSource(id); }}>{name}</button>
        ))}
      </div>
      <label className="lyrics-switch">
        <input
          type="checkbox"
          role="switch"
          checked={lyrics}
          disabled={progress !== undefined}
          onChange={event => { onStop(); setPlayingId(null); setLyrics(event.target.checked); }}
        />
        <span>Lyrics</span>
      </label>
      {shelfReady && (
        <button
          className="secondary"
          disabled={progress !== undefined}
          onClick={() => {
            onStop();
            setPlayingId(null);
            setGeneration(n => n + 1);
          }}
          aria-label="Refresh recommendations"
        >
          Refresh
        </button>
      )}
    </div>
    {source === 'own' && <OwnPhotos chosen={photo} onChoose={setPhoto} disabled={progress !== undefined} />}
    {!token && <p role="alert">Staging access is unavailable.</p>}
    {!approved && <p role="alert">Approve synced lyrics before downloading lyric creatives, or switch the lyrics off.</p>}
    {profile.musicAnalysis.status === 'pending' && <p role="status">Finishing music analysis for better ranking…</p>}
    {profile.lyricMeaning?.status === 'pending' && <p role="status">Reading what your lyrics say…</p>}
    {profile.lyricMeaning?.status === 'error' && <p className="hint">We could not read what your lyrics say, so these are matched to the sound alone.</p>}
    {error && <p role="alert">{error}</p>}
    {playbackError && <p role="alert">{playbackError}</p>}
    {!shelfReady && approved && fontReady && (
      <p role="status">{shelfStatus || 'Preparing creatives…'}</p>
    )}
    {SHELF_ROWS.filter(row => pack.some(item => item.row === row.id)).map(row => {
      const rowReady = readyRows.includes(row.id);
      return (
        <section key={row.id} className="creatives-pack-row" aria-label={row.title} aria-busy={!rowReady}>
          <h2>{row.title}</h2>
          <div className="creatives-pack-grid" role="list">
            {pack.map((item, index) => {
              if (item.row !== row.id) return null;
              const selected = picked.includes(item.id);
              const isPlaying = playing && playingId === item.id;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`creatives-pack-card${rowReady ? '' : ' pending'}`}
                  role="listitem"
                  disabled={!rowReady || progress !== undefined}
                  aria-pressed={selected}
                  aria-label={`${row.title} creative ${index + 1}${selected ? ', selected' : ''}`}
                  onClick={() => togglePick(item.id)}
                >
                  <canvas
                    ref={node => { canvasRefs.current[index] = node; }}
                    width={PREVIEW_WIDTH}
                    height={PREVIEW_HEIGHT}
                    aria-hidden="true"
                  />
                  <span
                    className="creatives-pack-play"
                    role="button"
                    tabIndex={shelfReady ? 0 : -1}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    onClick={event => togglePlay(item.id, event)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        togglePlay(item.id, event);
                      }
                    }}
                  >{isPlaying ? '❚❚' : '▶'}</span>
                </button>
              );
            })}
          </div>
        </section>
      );
    })}
    {shelfReady && picked.length > 0 && (
      <div className="trim-actions creatives-pack-download">
        <button
          className="primary-accent"
          disabled={!fontReady || !approved || progress !== undefined || profile.musicAnalysis.status === 'pending' || profile.lyricMeaning?.status === 'pending'}
          onClick={() => void downloadSelected()}
        >
          Download {picked.length === 1 ? 'MP4' : `${picked.length} creatives`}
        </button>
      </div>
    )}
    {progress !== undefined && <p role="status">{progressLabel || 'Working…'} · {progress}%</p>}
    {activeSlot && shelfReady && <span className="visually-hidden">Previewing creative {pack.findIndex(item => item.id === activeSlot.id) + 1}</span>}
  </section></main>;
}
