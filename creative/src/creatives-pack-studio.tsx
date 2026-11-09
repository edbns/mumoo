import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type MutableRefObject } from 'react';
import { FPS, playheadFrame, type Composition, type ImpactMusic } from './composition';
import type { CreativeProfileV1 } from './creative-profile';
import { posterFrame } from './lyric-motion';
import { adPunchFallbackText, recommendRow, SHELF_ROWS, type CreativesPackSlot, type PlateRef, type ShelfRow } from './creatives-pack';
import { CART_LIMIT, cardThumbnail, songKeyOf, type Cart, type CartItem } from './cart';
import type { CartDownload } from './use-cart-download';
import { friendlyError } from './friendly-error';
import { PictureUpload } from './picture-upload';
import type { PictureUse, Upload } from './uploads';
import type { Uploads } from './use-uploads';
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
import { clipToMonoWav, submitCloudJob } from './pack-cloud-export';
import { loadPunchPlatesManifest } from './punch-plates';
import { IS_ALIGNMENT_STAGING } from './staging-alignment';

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

/** The links a shelf card needs to draw the person's own picture (instead of our approved photo): Dust a photo and its cut-out, Our photography a photo or a clip. */
type Picture = Pick<PackRendererOpts, 'photoUrl' | 'cutoutUrl' | 'motionUrl' | 'motionShots'>;

function drawingFrom(upload: Upload | null): Picture | undefined {
  if (!upload?.url) return undefined;
  if (upload.motionUrl) return { motionUrl: upload.motionUrl, ...(upload.shots ? { motionShots: upload.shots } : {}) };
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
    ...(slot.bankId ? { bankId: slot.bankId } : {}),
    ...(slot.typeStyle ? { typeStyle: slot.typeStyle } : {}),
    ...(slot.cutSeed != null ? { cutSeed: slot.cutSeed } : {}),
    // With lyrics off nothing about the words is used or sent anywhere, not even what they mean.
    ...(slot.grade && lyrics ? { grade: slot.grade } : {}),
    cues: lyrics ? composition.cues : [],
    music,
    fallbackText: lyrics ? fallbackText : '',
    lyrics,
    // Our approved photo (Dust) or its baked effect (Our photography), unless the person chose their own picture, which replaces it.
    ...(picture ?? (slot.plateId ? { plateId: slot.plateId } : slot.effectId ? { effectId: slot.effectId } : {})),
  };
}

/** The moment a still card shows: the words at their strongest, or, with lyrics off, just after a beat. */
function posterAt(composition: Composition, music: ImpactMusic | null, lyrics: boolean) {
  return lyrics ? posterFrame(composition.cues) : Math.round(((music?.beatsMs[1] ?? 500) + 120) * FPS / 1000);
}

function yieldFrame() {
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}

type RowView = { slots: CreativesPackSlot[]; note: string };
type RowControls = { generation: number; lyrics: boolean };

const FRESH_ROWS = Object.fromEntries(SHELF_ROWS.map(row => [row.id, { generation: 0, lyrics: true }])) as Record<ShelfRow, RowControls>;

export function CreativesPackStudio({
  profile, composition, audio, token, position, getPosition, playing, playbackError,
  cart, download, uploads, downloadRef, onPlay, onStop, onBack,
}: {
  profile: CreativeProfileV1;
  composition: Composition;
  audio: AudioBuffer;
  token: string;
  position: number;
  getPosition?: () => number;
  playing: boolean;
  playbackError: string;
  /** The cart and the download live in the app, so they are the same on every page. */
  cart: Cart;
  download: CartDownload;
  uploads: Uploads;
  /** Where the app finds this page's download, which needs the music and pictures only this page has. */
  downloadRef: MutableRefObject<(() => void) | null>;
  onPlay: () => void;
  onStop: () => void;
  onSeek?: (ms: number) => void;
  onBack: () => void;
}) {
  const canvasRefs = useRef(new Map<string, HTMLCanvasElement>());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [fontReady, setFontReady] = useState(false);
  const [error, setError] = useState('');
  /** Every row has its own Refresh and (where it makes sense) its own Lyrics switch, so a change repaints one row only. */
  const [controls, setControls] = useState(FRESH_ROWS);
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

  // The picture each own-picture row draws from: the person's own, once it is ready (a new one replaces it), else ours.
  // Links are renewed from time to time, so rows are keyed by id, not link.
  const useOf = (row: ShelfRow) => SHELF_ROWS.find(def => def.id === row)?.upload;
  const ownPicture = (use: PictureUse) => (uploads.list ?? []).find(item => item.use === use && item.status === 'ready' && item.url) ?? null;
  const pictures: Record<PictureUse, Upload | null> = { dust: ownPicture('dust'), filter: ownPicture('filter') };
  const pictureOf = (row: ShelfRow) => {
    const use = useOf(row);
    return use ? drawingFrom(pictures[use]) : undefined;
  };
  const pictureIds = `${pictures.dust?.id ?? 'ours'}|${pictures.filter?.id ?? 'ours'}`;

  const view = useMemo(() => Object.fromEntries(SHELF_ROWS.map((def): [ShelfRow, RowView] => {
    // Dust is made from approved photos that have a cut-out; Our photography needs no photo of ours, its looks are baked.
    if (def.id === 'dust' && !pictures.dust) {
      if (plates === null) {
        return [def.id, { slots: [], note: '' }];
      } else if (!plates.some(plate => plate.cutout)) {
        return [def.id, { slots: [], note: !uploads.signedIn && !uploads.pending ? 'We have no approved photos for this yet. Sign in (top right) to use your own.' : 'We have no approved photos for this yet. Upload one photo to see Dust made from it.' }];
      }
    }
    if (lyricsOn(def.id) && !hasLyrics) {
      return [def.id, { slots: [], note: def.lyrics === 'always' ? 'Pulise is made of your lyrics. Approve your synced lyrics first.' : 'Approve your synced lyrics, or switch this row’s lyrics off.' }];
    }
    return [def.id, { slots: recommendRow(def.id, profile, controls[def.id].generation, plates ?? []), note: '' }];
  })) as Record<ShelfRow, RowView>, [
    profile.clip.sourceSha256, profile.musicAnalysis, profile.lyricMeaning, profile.creator.cover,
    controls, plates, hasLyrics, pictureIds, uploads.signedIn, uploads.pending,
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

  // A picture that has just become ready is drawn at once, and the one shared drawing surface must not be in use.
  useEffect(() => { if (playingId) stopPlayback(); }, [pictureIds]);

  // A card that no longer exists cannot stay playing. (Cards in the cart are kept on purpose.)
  useEffect(() => {
    setPlayingId(current => (current && !pack.some(slot => slot.id === current) ? null : current));
  }, [pack.map(slot => slot.id).join()]);

  // Tear down shared WebGL when leaving the pack screen.
  const leaving = useRef(false);
  useEffect(() => () => { leaving.current = true; destroySharedPackRenderer(); }, []);

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
            if (!cancelled) setError(`${def.title}: ${friendlyError(cause, 'One creative could not be prepared.')}`);
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
    const withLyrics = lyricsOn(playingSlot.row);
    const picture = pictureOf(playingSlot.row);
    const opts = packOpts(playingSlot, composition, music, fallbackText, withLyrics, picture);
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
      // The card goes back to its own poster. Drawing is queued after the last live frame, so a late frame can never land on top of it.
      if (!leaving.current) {
        void blitPackFrame(canvas, packOpts(playingSlot, composition, music, fallbackText, withLyrics, picture), posterAt(composition, music, withLyrics))
          .catch(cause => setError(friendlyError(cause, 'Preview failed (WebGL).')));
      }
    };
  }, [allReady, fontReady, playing, playingSlot?.id, rowKeys, composition, music, fallbackText]);

  /** Any change to a row stops playback first, so the one shared drawing surface is never used twice at once. */
  function stopPlayback() {
    onStop();
    setPlayingId(null);
  }

  function change(row: ShelfRow, next: Partial<RowControls>) {
    stopPlayback();
    setControls(current => ({ ...current, [row]: { ...current[row], ...next } }));
  }

  /** A card goes into the cart exactly as it is now, so refreshing its row afterwards cannot lose it. */
  function toggleCart(slot: CreativesPackSlot) {
    if (cart.has(slot.id)) {
      cart.remove(slot.id);
      return;
    }
    const use = useOf(slot.row);
    const card = canvasRefs.current.get(slot.id);
    if (!card) return;
    const item: CartItem = {
      id: slot.id,
      row: slot.row,
      slot,
      lyrics: lyricsOn(slot.row),
      uploadId: use ? (pictures[use]?.id ?? null) : null,
      generation: controls[slot.row].generation,
      thumb: cardThumbnail(card),
    };
    cart.add(item);
    reportPackFeedback(token, profile, 'select', slot, { selectedIds: [...cart.items.map(held => held.id), slot.id], generation: item.generation });
  }

  /** What a cart item is drawn from now: the person's own picture (if it is still there) or our photography. */
  function pictureFor(item: CartItem): { available: boolean; picture?: Picture } {
    if (item.uploadId === null) return { available: true };
    const upload = (uploads.list ?? []).find(candidate => candidate.id === item.uploadId && candidate.status === 'ready' && candidate.url);
    return upload ? { available: true, picture: drawingFrom(upload) } : { available: false };
  }

  function togglePlay(id: string, event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
    if (!allReady || !fontReady) return;
    if (playing && playingId === id) {
      onStop();
      setPlayingId(null);
      return;
    }
    setPlayingId(id);
    if (playing) onStop();
    const slot = pack.find(item => item.id === id);
    if (slot) reportPackFeedback(token, profile, 'play', slot, { generation: controls[slot.row].generation });
    onPlay();
  }

  /**
   * Starts one cloud render per cart item. Waiting for them, handing over the file and emptying the cart happen in
   * the app, so they survive a refresh and work from any page.
   */
  function downloadCart() {
    const items = cart.items.filter(item => pictureFor(item).available);
    if (download.progress !== null || !items.length) return;
    onStop(); setPlayingId(null); setError('');
    download.start(songKeyOf(profile.clip.sourceSha256, profile.clip.offsetMs), items, async report => {
      report('Preparing audio…');
      // Let React paint the progress state before any work.
      await yieldFrame();
      // One small WAV for the whole batch (≈960 KB).
      const wav = await clipToMonoWav(audio, composition.clipStartMs);
      report(items.length > 1 ? `Starting ${items.length} cloud renders…` : 'Starting cloud render…');
      // Every job is submitted now; the cloud renders them in parallel and we only hold job ids.
      const ids: string[] = [];
      for (const item of items) {
        await yieldFrame();
        ids.push(await submitCloudJob({
          token,
          wav,
          opts: packOpts(item.slot, composition, music, fallbackText, item.lyrics, pictureFor(item).picture),
          ...(item.uploadId ? { uploadId: item.uploadId } : {}),
        }));
        reportPackFeedback(token, profile, 'download', item.slot, { selectedIds: cart.items.map(held => held.id), generation: item.generation });
      }
      return ids;
    });
  }
  downloadRef.current = downloadCart;
  useEffect(() => () => { downloadRef.current = null; }, []);

  return <main className="desktop gallery-page studio-shell"><section className="gallery-shell panel">
    <p className="eyebrow">Creatives pack</p>
    <h1>{pack.length ? `${pack.length} recommended creatives` : 'Recommended creatives'}</h1>
    <p className="intro">Ranked for this song, one row at a time. Each row has its own controls, so changing one row only redraws that row. Add the creatives you like to your cart, refresh for more, and download them together from the cart. Videos render in the cloud, so your computer stays free.</p>
    <div className="trim-actions">
      <button className="secondary" onClick={onBack}>Back</button>
    </div>
    {!token && !IS_ALIGNMENT_STAGING && <p role="alert">Staging access is unavailable.</p>}
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
                  onChange={event => change(def.id, { lyrics: event.target.checked })}
                />
                <span>Lyrics</span>
              </label>}
              <button
                type="button"
                className="secondary"
                disabled={!rowReady}
                onClick={() => change(def.id, { generation: controls[def.id].generation + 1 })}
                aria-label={`Refresh ${def.title}`}
              >Refresh</button>
            </div>
          </div>
          {def.upload && <PictureUpload use={def.upload} uploads={uploads} active={pictures[def.upload]} onChange={stopPlayback} />}
          {note && <p className="hint creatives-pack-row-note" role="status">{note}</p>}
          {slots.length > 0 && <div className="creatives-pack-grid" role="list">
            {slots.map((item, index) => {
              const inCart = cart.has(item.id);
              const isPlaying = playing && playingId === item.id;
              return (
                <div key={item.id} className="creatives-pack-item" role="listitem">
                  <div className={`creatives-pack-card${rowReady ? '' : ' pending'}`}>
                    <canvas
                      ref={node => { if (node) canvasRefs.current.set(item.id, node); else canvasRefs.current.delete(item.id); }}
                      width={PREVIEW_WIDTH}
                      height={PREVIEW_HEIGHT}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      className="creatives-pack-play"
                      disabled={!rowReady}
                      aria-label={`${isPlaying ? 'Pause' : 'Play'} ${def.title} creative ${index + 1}`}
                      onClick={event => togglePlay(item.id, event)}
                    >{isPlaying ? '❚❚' : '▶'}</button>
                  </div>
                  <button
                    type="button"
                    className={inCart ? 'creatives-pack-add in-cart' : 'creatives-pack-add secondary'}
                    disabled={!rowReady || (!inCart && cart.full)}
                    aria-pressed={inCart}
                    title={!inCart && cart.full ? `Your cart is full (${CART_LIMIT})` : undefined}
                    onClick={() => toggleCart(item)}
                  >{inCart ? 'In cart ✓' : 'Add to cart'}</button>
                </div>
              );
            })}
          </div>}
        </section>
      );
    })}
  </section></main>;
}
