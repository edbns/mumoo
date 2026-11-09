import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { FPS, playheadFrame, type Composition, type ImpactMusic } from './composition';
import type { CreativeProfileV1 } from './creative-profile';
import { posterFrame } from './lyric-motion';
import { adPunchFallbackText, recommendRow, SHELF_ROWS, type CreativesPackSlot, type PlateRef, type ShelfRow } from './creatives-pack';
import { PictureDialog } from './picture-dialog';
import { PICTURE_RULES, type PictureUse, type Upload } from './uploads';
import { useUploads } from './use-uploads';
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

/** The links a shelf card needs to draw the person's own picture (instead of our approved photo): Dust a photo and its cut-out, a Filter a photo or a clip. */
type Picture = Pick<PackRendererOpts, 'photoUrl' | 'cutoutUrl' | 'motionUrl'>;

function drawingFrom(upload: Upload | null): Picture | undefined {
  if (!upload?.url) return undefined;
  if (upload.motionUrl) return { motionUrl: upload.motionUrl };
  return { photoUrl: upload.url, ...(upload.cutoutUrl ? { cutoutUrl: upload.cutoutUrl } : {}) };
}

function packOpts(
  slot: CreativesPackSlot,
  composition: Composition,
  music: ImpactMusic | null,
  fallbackText: string,
  lyrics: boolean,
  picture?: Picture,
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
    // With lyrics off nothing about the words is used or sent anywhere, not even what they mean.
    ...(slot.grade && lyrics ? { grade: slot.grade } : {}),
    cues: lyrics ? composition.cues : [],
    music,
    fallbackText: lyrics ? fallbackText : '',
    lyrics,
    // Our approved photo, unless the person chose their own.
    ...(picture ? picture : slot.plateId ? { plateId: slot.plateId } : {}),
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

type RowView = { slots: CreativesPackSlot[]; note: string };
type RowControls = { generation: number; lyrics: boolean };

const FRESH_ROWS = Object.fromEntries(SHELF_ROWS.map(row => [row.id, { generation: 0, lyrics: true }])) as Record<ShelfRow, RowControls>;

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
  const canvasRefs = useRef(new Map<string, HTMLCanvasElement>());
  const [picked, setPicked] = useState<string[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [fontReady, setFontReady] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number>();
  const [progressLabel, setProgressLabel] = useState('');
  /** Every row has its own Refresh and (where it makes sense) its own Lyrics switch, so a change repaints one row only. */
  const [controls, setControls] = useState(FRESH_ROWS);
  const uploads = useUploads();
  const [dialog, setDialog] = useState<PictureUse | null>(null);
  /** Which picture each own-picture row draws from: the id of one of the person's pictures, or null for our approved photography. */
  const [chosen, setChosen] = useState<Record<PictureUse, string | null>>({ dust: null, filter: null });
  /** The approved photos; null until they have been read. */
  const [plates, setPlates] = useState<PlateRef[] | null>(null);
  /** A row appears when all four of its posters are finished. */
  const [readyRows, setReadyRows] = useState<ShelfRow[]>([]);
  const [shelfStatus, setShelfStatus] = useState('');
  const music = useMemo(() => impactMusic(profile), [profile.musicAnalysis]);
  const intent = useMemo(
    () => (profile.musicAnalysis.status === 'ready' ? deriveMusicIntent(profile.musicAnalysis.result) : null),
    [profile.musicAnalysis],
  );
  const fallbackText = useMemo(() => adPunchFallbackText(profile, intent), [profile, intent]);
  const hasLyrics = Boolean(profile.approvedLyrics?.cues.length);
  const lyricsOn = (row: ShelfRow) => SHELF_ROWS.find(def => def.id === row)?.lyrics === 'always' || controls[row].lyrics;

  // The picture each own-picture row draws from. Links are renewed from time to time, so rows are keyed by id, not link.
  const useOf = (row: ShelfRow) => SHELF_ROWS.find(def => def.id === row)?.upload;
  const own = (use: PictureUse) => (uploads.list ?? []).filter(item => item.use === use);
  const pictures: Record<PictureUse, Upload | null> = {
    dust: own('dust').find(item => item.id === chosen.dust && item.status === 'ready' && item.url) ?? null,
    filter: own('filter').find(item => item.id === chosen.filter && item.status === 'ready' && item.url) ?? null,
  };
  const pictureOf = (row: ShelfRow) => {
    const use = useOf(row);
    return use ? drawingFrom(pictures[use]) : undefined;
  };
  const pictureIds = `${pictures.dust?.id ?? 'ours'}|${pictures.filter?.id ?? 'ours'}`;

  const view = useMemo(() => Object.fromEntries(SHELF_ROWS.map((def): [ShelfRow, RowView] => {
    let note = '';
    if (def.upload) {
      const mine = own(def.upload);
      if (pictures[def.upload]) {
        // Drawn from their own picture.
      } else if (plates === null) {
        return [def.id, { slots: [], note: '' }];
      } else if (!plates.some(plate => def.upload === 'filter' || plate.cutout)) {
        const ask = def.upload === 'dust' ? 'Upload one photo to see Dust made from it.' : 'Upload a photo, video or GIF to see it here.';
        return [def.id, { slots: [], note: !uploads.signedIn && !uploads.pending ? 'We have no approved photos for this yet. Sign in (top right) to use your own.' : `We have no approved photos for this yet. ${ask}` }];
      }
      if (mine.some(item => item.status === 'preparing')) note = 'Preparing your picture. It replaces ours as soon as it is ready.';
    }
    if (lyricsOn(def.id) && !hasLyrics) {
      return [def.id, { slots: [], note: def.lyrics === 'always' ? 'Pulise is made of your lyrics. Approve your synced lyrics first.' : 'Approve your synced lyrics, or switch this row’s lyrics off.' }];
    }
    return [def.id, { slots: recommendRow(def.id, profile, controls[def.id].generation, plates ?? []), note }];
  })) as Record<ShelfRow, RowView>, [
    profile.clip.sourceSha256, profile.musicAnalysis, profile.lyricMeaning, profile.creator.cover,
    controls, plates, hasLyrics, pictureIds, uploads.signedIn, uploads.pending,
    uploads.list?.map(item => `${item.id}:${item.status}`).join(),
  ]);
  const pack = SHELF_ROWS.flatMap(def => view[def.id].slots);
  const paintedRows = SHELF_ROWS.filter(def => view[def.id].slots.length > 0);
  const allReady = paintedRows.every(def => readyRows.includes(def.id));

  const cueKey = JSON.stringify(composition.cues);
  // What every card depends on besides its own row: the song and its words.
  const songKey = `${profile.clip.sourceSha256}|${cueKey}|${fallbackText}|${music?.beatsMs.join(',') ?? ''}`;
  const rowKey = (row: ShelfRow) => {
    const { slots } = view[row];
    if (!slots.length) return '';
    return `${songKey}|${lyricsOn(row)}|${pictureIds}|${slots.map(slot => `${slot.id}:${slot.grade ? Object.values(slot.grade).join(',') : ''}`).join(',')}`;
  };
  const rowKeys = SHELF_ROWS.map(def => rowKey(def.id)).join('\n');

  const getPositionRef = useRef(getPosition ?? (() => position));
  getPositionRef.current = getPosition ?? (() => position);
  const latest = useRef({ view, composition, music, fallbackText, lyricsOn, pictureOf, rowKey });
  latest.current = { view, composition, music, fallbackText, lyricsOn, pictureOf, rowKey };
  const painted = useRef(new Map<ShelfRow, string>());
  const playingSlot = pack.find(item => item.id === playingId) ?? null;

  useEffect(() => {
    let alive = true;
    void loadPunchPlatesManifest().then(manifest => {
      if (!alive) return;
      setPlates(manifest?.plates.map(plate => ({ id: plate.id, cutout: Boolean(plate.cutout) })) ?? []);
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

  // A picture the person has just added is the one they want to see; ones that were already there stay unused until chosen.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (uploads.list === null) { seen.current = null; return; }
    const readyNow = uploads.list.filter(item => item.status === 'ready');
    if (seen.current === null) { seen.current = new Set(readyNow.map(item => item.id)); return; }
    for (const item of readyNow) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      stopPlayback();
      setChosen(current => ({ ...current, [item.use]: item.id }));
    }
  }, [uploads.list]);

  // Cards that no longer exist cannot stay picked or playing.
  useEffect(() => {
    setPicked(current => (current.every(id => pack.some(slot => slot.id === id)) ? current : current.filter(id => pack.some(slot => slot.id === id))));
    setPlayingId(current => (current && !pack.some(slot => slot.id === current) ? null : current));
  }, [pack.map(slot => slot.id).join()]);

  // Tear down shared WebGL when leaving the pack screen.
  useEffect(() => () => destroySharedPackRenderer(), []);

  // Posters: only rows whose own inputs changed are painted again; a row appears when its last card is done.
  useEffect(() => {
    if (!fontReady) return;
    const keys = new Map(SHELF_ROWS.map(def => [def.id, latest.current.rowKey(def.id)] as const));
    const stale = SHELF_ROWS.filter(def => painted.current.get(def.id) !== keys.get(def.id));
    for (const def of stale) painted.current.delete(def.id);
    setReadyRows(rows => rows.filter(id => !stale.some(def => def.id === id)));
    let cancelled = false;
    void (async () => {
      // Wait a frame so the cards' canvases are mounted.
      await yieldFrame();
      for (const def of stale) {
        const key = keys.get(def.id);
        const { slots } = latest.current.view[def.id];
        if (!key || !slots.length) continue;
        setError('');
        for (let index = 0; index < slots.length; index++) {
          if (cancelled) return;
          setShelfStatus(`Preparing ${def.title}, creative ${index + 1} of ${slots.length}…`);
          await yieldFrame();
          const canvas = canvasRefs.current.get(slots[index].id);
          if (!canvas) continue;
          const { composition: base, music: impact, fallbackText: fallback } = latest.current;
          const withLyrics = latest.current.lyricsOn(def.id);
          try {
            await blitPackFrame(canvas, packOpts(slots[index], base, impact, fallback, withLyrics, latest.current.pictureOf(def.id)), posterAt(base, impact, withLyrics));
          } catch (cause) {
            if (!cancelled) setError(friendlyError(cause, 'One creative could not be prepared.'));
          }
          await yieldFrame();
        }
        if (cancelled) return;
        painted.current.set(def.id, key);
        setReadyRows(rows => [...rows, def.id]);
      }
      if (!cancelled) setShelfStatus('');
    })();
    return () => { cancelled = true; };
  }, [fontReady, rowKeys]);

  // Live preview: only when everything is painted and the playhead frame changes.
  useEffect(() => {
    if (!allReady || !fontReady || !playing || !playingSlot) return;
    const canvas = canvasRefs.current.get(playingSlot.id);
    if (!canvas) return;
    let alive = true;
    let raf = 0;
    const opts = packOpts(playingSlot, composition, music, fallbackText, lyricsOn(playingSlot.row), pictureOf(playingSlot.row));
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
  }, [allReady, fontReady, playing, playingSlot?.id, rowKeys, composition, music, fallbackText]);

  function paintPoster(id: string | null) {
    const slot = pack.find(item => item.id === id);
    const canvas = slot && canvasRefs.current.get(slot.id);
    if (!slot || !canvas || !allReady || !fontReady) return;
    const withLyrics = lyricsOn(slot.row);
    void blitPackFrame(canvas, packOpts(slot, composition, music, fallbackText, withLyrics, pictureOf(slot.row)), posterAt(composition, music, withLyrics))
      .catch(cause => setError(friendlyError(cause, 'Preview failed (WebGL).')));
  }

  /** Any change to a row stops playback first, so the one shared drawing surface is never used twice at once. */
  function stopPlayback() {
    onStop();
    setPlayingId(null);
  }

  function change(row: ShelfRow, next: Partial<RowControls>) {
    stopPlayback();
    setControls(current => ({ ...current, [row]: { ...current[row], ...next } }));
  }

  function togglePick(id: string) {
    setPicked(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
      const slot = pack.find(item => item.id === id);
      if (slot && next.includes(id)) reportPackFeedback(token, profile, 'select', slot, { selectedIds: next, generation: controls[slot.row].generation });
      return next;
    });
  }

  function togglePlay(id: string, event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
    if (!allReady || !fontReady || progress !== undefined) return;
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
    if (slot) reportPackFeedback(token, profile, 'play', slot, { generation: controls[slot.row].generation });
    onPlay();
  }

  async function downloadSelected() {
    const selectedSlots = pack.filter(item => picked.includes(item.id));
    if (progress !== undefined || !selectedSlots.length) return;
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
        const use = useOf(slot.row);
        const picture = use ? pictures[use] : null;
        const id = await submitCloudJob({
          token,
          wav,
          opts: packOpts(slot, composition, music, fallbackText, lyricsOn(slot.row), pictureOf(slot.row)),
          uploadId: picture?.id,
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
        reportPackFeedback(token, profile, 'download', job.slot, { selectedIds: picked, generation: controls[job.slot.row].generation });
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

  const exporting = progress !== undefined;
  return <main className="desktop gallery-page studio-shell"><section className="gallery-shell panel">
    <p className="eyebrow">Creatives pack</p>
    <h1>{pack.length ? `${pack.length} recommended creatives` : 'Recommended creatives'}</h1>
    <p className="intro">Ranked for this song, one row at a time. Each row has its own controls, so changing one row only redraws that row. Pick the creatives you like and download them. Downloads render in the cloud, so your computer stays free.</p>
    <div className="trim-actions">
      <button className="secondary" disabled={exporting} onClick={onBack}>Back</button>
    </div>
    {!token && <p role="alert">Staging access is unavailable.</p>}
    {profile.musicAnalysis.status === 'pending' && <p role="status">Finishing music analysis for better ranking…</p>}
    {profile.lyricMeaning?.status === 'pending' && <p role="status">Reading what your lyrics say…</p>}
    {profile.lyricMeaning?.status === 'error' && <p className="hint">We could not read what your lyrics say, so these are matched to the sound alone.</p>}
    {error && <p role="alert">{error}</p>}
    {playbackError && <p role="alert">{playbackError}</p>}
    {shelfStatus && <p role="status">{shelfStatus}</p>}
    {SHELF_ROWS.filter(def => def.upload || view[def.id].slots.length || view[def.id].note).map(def => {
      const { slots, note } = view[def.id];
      const rowReady = readyRows.includes(def.id);
      return (
        <section key={def.id} className="creatives-pack-row" aria-label={def.title} aria-busy={slots.length > 0 && !rowReady}>
          <div className="creatives-pack-row-head">
            <h2>{def.title}</h2>
            <div className="row-controls">
              {def.lyrics === 'switch' && <label className="lyrics-switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={controls[def.id].lyrics}
                  disabled={exporting}
                  onChange={event => change(def.id, { lyrics: event.target.checked })}
                />
                <span>Lyrics</span>
              </label>}
              {def.upload && <button type="button" className="secondary" disabled={exporting} onClick={() => { stopPlayback(); setDialog(def.upload ?? null); }}>
                {def.upload === 'dust' ? 'Upload photo' : 'Upload photo, video or GIF'}
              </button>}
              <button
                type="button"
                className="secondary"
                disabled={exporting || !rowReady}
                onClick={() => change(def.id, { generation: controls[def.id].generation + 1 })}
                aria-label={`Refresh ${def.title}`}
              >Refresh</button>
            </div>
          </div>
          {note && <p className="hint creatives-pack-row-note" role="status">{note}</p>}
          {slots.length > 0 && <div className="creatives-pack-grid" role="list">
            {slots.map((item, index) => {
              const selected = picked.includes(item.id);
              const isPlaying = playing && playingId === item.id;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`creatives-pack-card${rowReady ? '' : ' pending'}`}
                  role="listitem"
                  disabled={!rowReady || exporting}
                  aria-pressed={selected}
                  aria-label={`${def.title} creative ${index + 1}${selected ? ', selected' : ''}`}
                  onClick={() => togglePick(item.id)}
                >
                  <canvas
                    ref={node => { if (node) canvasRefs.current.set(item.id, node); else canvasRefs.current.delete(item.id); }}
                    width={PREVIEW_WIDTH}
                    height={PREVIEW_HEIGHT}
                    aria-hidden="true"
                  />
                  <span
                    className="creatives-pack-play"
                    role="button"
                    tabIndex={allReady ? 0 : -1}
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
          </div>}
        </section>
      );
    })}
    {(Object.keys(PICTURE_RULES) as PictureUse[]).map(use => (
      <PictureDialog
        key={use}
        use={use}
        open={dialog === use}
        onClose={() => setDialog(current => (current === use ? null : current))}
        uploads={uploads}
        chosenId={pictures[use]?.id ?? null}
        onChoose={id => { stopPlayback(); setChosen(current => ({ ...current, [use]: id })); }}
      />
    ))}
    {allReady && picked.length > 0 && (
      <div className="trim-actions creatives-pack-download">
        <button
          className="primary-accent"
          disabled={!fontReady || exporting || profile.musicAnalysis.status === 'pending' || profile.lyricMeaning?.status === 'pending'}
          onClick={() => void downloadSelected()}
        >
          Download {picked.length === 1 ? 'MP4' : `${picked.length} creatives`}
        </button>
      </div>
    )}
    {exporting && <p role="status">{progressLabel || 'Working…'} · {progress}%</p>}
  </section></main>;
}
