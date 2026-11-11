import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { FPS, playheadFrame, type Composition, type ImpactMusic } from './composition';
import type { CreativeProfileV1 } from './creative-profile';
import { posterFrame } from './lyric-motion';
import { adPunchFallbackText, isLookRow, recommendRow, rowsFor, SHELF_ROWS, windowHand, type CreativesPackSlot, type PlateRef, type ShelfRow } from './creatives-pack';
import { CART_LIMIT, cardThumbnail, songKeyOf, type Cart, type CartItem } from './cart';
import type { CartDownload } from './use-cart-download';
import { friendlyError } from './friendly-error';
import { PauseIcon, PlayIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RollingButton } from '@/components/ui/rolling-button';
import { PictureUpload } from './picture-upload';
import { needsCutoutLibrary, type PictureUse, type Upload } from './uploads';
import type { Uploads } from './use-uploads';
import { useWindowOwn } from './use-window-own';
import { loadDisplayFonts } from './ad-fonts';
import { deriveMusicIntent } from './music-intent';
import { reportPackFeedback, reportRefresh } from './pack-feedback';
import {
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  blitPackFrame,
  destroySharedPackRenderer,
  type PackRendererOpts,
} from './pack-renderer';
import { clipToMonoWav, submitCloudJob } from './pack-cloud-export';
import { LoadingMask } from './loading-mask';
import { loadPunchPlatesManifest } from './punch-plates';
import { useLibrary } from './use-library';
import { useWindowReadings } from './use-window-library';
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

/** The links a shelf card needs to draw the person's own picture (instead of our approved photo): Dust a photo and its cut-out, Riso a photo with cut-out or a clip, Our photography a photo or a clip, Window either (the cut-out is used by the cards that have her in front). */
type Picture = Pick<PackRendererOpts, 'photoUrl' | 'cutoutUrl' | 'motionUrl' | 'motionShots'>;

function drawingFrom(upload: Pick<Upload, 'url' | 'cutoutUrl' | 'motionUrl' | 'shots'> | null): Picture | undefined {
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
  const drawn = picture ?? (slot.plateId ? { plateId: slot.plateId } : slot.effectId ? { effectId: slot.effectId } : {});
  return {
    style: slot.style,
    font: slot.font,
    fontSecondary: slot.fontSecondary,
    layout: slot.layout,
    ...(slot.colors ? { colors: slot.colors } : {}),
    ...(slot.inkSet ? { inkSet: slot.inkSet } : {}),
    ...(slot.sprayPalette ? { sprayPalette: slot.sprayPalette } : {}),
    ...(slot.doodleId ? { doodleId: slot.doodleId, doodlePaper: slot.doodlePaper, doodleMood: slot.doodleMood } : {}),
    ...(slot.windowMode ? { windowMode: slot.windowMode, windowPalette: slot.windowPalette, windowAllowed: slot.windowAllowed } : {}),
    ...(slot.bankId ? { bankId: slot.bankId } : {}),
    ...(slot.typeStyle ? { typeStyle: slot.typeStyle } : {}),
    // A live look goes on a picture (the library's or the person's own), never on a baked effect.
    ...(slot.look && !('effectId' in drawn) ? { look: slot.look } : {}),
    ...(slot.cutSeed != null ? { cutSeed: slot.cutSeed } : {}),
    // With lyrics off nothing about the words is used or sent anywhere, not even what they mean.
    ...(slot.grade && lyrics ? { grade: slot.grade } : {}),
    cues: lyrics ? composition.cues : [],
    music,
    fallbackText: lyrics ? fallbackText : '',
    lyrics,
    // Our approved photo (Dust, Riso, Window) or its baked effect (Our photography, Window; a Window may also draw a baked background), unless the person chose their own picture, which replaces it.
    ...drawn,
  };
}

/** The moment a still card shows: the words at their strongest, or, with lyrics off, just after a beat. */
function posterAt(composition: Composition, music: ImpactMusic | null, lyrics: boolean) {
  return lyrics ? posterFrame(composition.cues) : Math.round(((music?.beatsMs[1] ?? 500) + 120) * FPS / 1000);
}

/** How often the Refresh word rolls by itself, so nobody misses that more can be had. */
const REFRESH_NUDGE_MS = 8000;

function yieldFrame() {
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}

type RowView = { slots: CreativesPackSlot[]; note: string };
type RowControls = { generation: number; lyrics: boolean };

const FRESH_ROWS = Object.fromEntries(SHELF_ROWS.map(row => [row.id, { generation: 0, lyrics: true }])) as Record<ShelfRow, RowControls>;

export function CreativesPackStudio({
  profile, composition, audio, token, position, getPosition, playing, playbackError,
  cart, download, uploads, downloadRef, onPlay, onStop, onBack, onProgress,
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
  /** How many posters are painted out of how many need painting; equal means the page is ready to be shown. */
  onProgress: (done: number, total: number) => void;
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
  // A song with no words shows only the rows that work without them, with no words on any.
  const noLyrics = Boolean(profile.noLyrics);
  const lyricsOn = (row: ShelfRow) => !noLyrics && (SHELF_ROWS.find(def => def.id === row)?.lyrics === 'always' || controls[row].lyrics);

  // The picture each own-picture row draws from: the person's own, once it is ready (a new one replaces it), else ours.
  // Links are renewed from time to time, so rows are keyed by id, not link.
  const useOf = (row: ShelfRow) => SHELF_ROWS.find(def => def.id === row)?.upload;
  const ownPicture = (use: PictureUse) => uploads.current.find(item => item.use === use && item.status === 'ready' && item.url) ?? null;
  const pictures: Record<PictureUse, Upload | null> = { dust: ownPicture('dust'), riso: ownPicture('riso'), filter: ownPicture('filter'), window: ownPicture('window'), thermal: ownPicture('thermal'), halftone: ownPicture('halftone'), dither: ownPicture('dither'), glow: ownPicture('glow'), streaks: ownPicture('streaks'), ascii: ownPicture('ascii'), depth: ownPicture('depth') };
  const windowOwn = useWindowOwn(pictures.window);
  // Our approved library fills Our photography until the person uses their own picture there.
  const library = useLibrary();
  // Riso draws library cut-out photos or clips; Dust only cut-out photos; Window photos with cut-out or clips.
  const libraryFor = (row: ShelfRow) => {
    const use = useOf(row);
    // Live-look rows deal from our library; a picture of the person's own is drawn on all four cards instead (see `recommendRow`).
    if (isLookRow(row)) return library ?? [];
    return (row === 'photography' || row === 'riso' || row === 'dust' || row === 'window') && use && !pictures[use] ? library ?? [] : [];
  };
  // Window deals from library pictures too, once it has read how each looks (the four it is about to deal).
  const windowPictures = useMemo(() => (pictures.window ? [] : windowHand(profile, controls.window.generation, library ?? [])), [pictures.window?.id, profile.clip.sourceSha256, profile.lyricMeaning, profile.creator, controls.window.generation, library?.map(item => item.id + (item.cutoutUrl ? '+cut' : '') + (item.motionUrl ? '+m' : '')).join(',')]);
  const windowReads = useWindowReadings(windowPictures);
  const libraryCutouts = (library ?? []).some(item => item.kind === 'photo' && item.cutoutUrl);
  const libraryRisoMotion = (library ?? []).some(item => item.kind !== 'photo' && item.motionUrl);
  const libraryItem = (id: string | undefined) => (id ? (library ?? []).find(item => item.id === id) ?? null : null);
  const pictureOf = (row: ShelfRow, slot?: CreativesPackSlot) => {
    const use = useOf(row);
    return (use ? drawingFrom(pictures[use]) : undefined) ?? (slot?.libraryId ? drawingFrom(libraryItem(slot.libraryId)) : undefined);
  };
  const pictureIds = `${pictures.dust?.id ?? 'ours'}|${pictures.riso?.id ?? 'ours'}|${pictures.filter?.id ?? 'ours'}|${pictures.window?.id ?? 'ours'}|${pictures.thermal?.id ?? 'ours'}|${pictures.halftone?.id ?? 'ours'}|${pictures.dither?.id ?? 'ours'}|${pictures.glow?.id ?? 'ours'}|${pictures.streaks?.id ?? 'ours'}|${pictures.ascii?.id ?? 'ours'}|${pictures.depth?.id ?? 'ours'}`;

  const view = useMemo(() => Object.fromEntries(SHELF_ROWS.map((def): [ShelfRow, RowView] => {
    // Made of the lyrics, and there are none: nothing is dealt, drawn or paid for.
    if (noLyrics && def.lyrics === 'always') return [def.id, { slots: [], note: '' }];
    // Dust and Depth need cut-out photos; Riso also accepts library videos/GIFs (and the person's own video).
    if (def.upload && needsCutoutLibrary(def.upload) && !pictures[def.upload]) {
      if (plates === null || library === null) {
        return [def.id, { slots: [], note: '' }];
      } else if (!plates.some(plate => plate.cutout) && !libraryCutouts && !(def.upload === 'riso' && libraryRisoMotion)) {
        return [def.id, { slots: [], note: !uploads.signedIn && !uploads.pending ? 'We have no approved photos for this yet. Sign in (top right) to use your own.' : `We have no approved photos for this yet. Upload one photo${def.upload === 'riso' ? ', video or GIF' : ''} to see ${def.title} made from it.` }];
      }
    }
    // Our photography is dealt once it knows what our library holds and which approved photo it may draw a look on.
    if (def.id === 'photography' && (library === null || plates === null)) return [def.id, { slots: [], note: '' }];
    // Thermal and Halftone are dealt once it knows what our library holds.
    if (isLookRow(def.id) && library === null && !pictures[def.id]) return [def.id, { slots: [], note: '' }];
    // Window is dealt once it knows its pictures: the person's own, once it has been read (what shows in the letters decides the colours), or our approved photos.
    if (def.id === 'window' && (pictures.window ? !windowOwn.own : plates === null || library === null || windowReads.pending)) return [def.id, { slots: [], note: windowOwn.problem }];
    if (lyricsOn(def.id) && !hasLyrics) {
      return [def.id, { slots: [], note: def.lyrics === 'always' ? `${def.title} is made of your lyrics. Approve your synced lyrics first.` : 'Approve your synced lyrics, or switch this row’s lyrics off.' }];
    }
    const slots = recommendRow(def.id, profile, controls[def.id].generation, plates ?? [], def.id === 'window' ? windowOwn.own : null, libraryFor(def.id), windowReads.readings, isLookRow(def.id) && Boolean(pictures[def.id]));
    // Thermal and Halftone are drawn on our library pictures, so with none for this song they say so instead of vanishing.
    const note = !slots.length && isLookRow(def.id) ? `${def.title} is drawn on pictures from our library, and none fits this song yet. Upload your own picture to see it here.` : '';
    return [def.id, { slots, note }];
  })) as Record<ShelfRow, RowView>, [
    profile.clip.sourceSha256, profile.musicAnalysis, profile.lyricMeaning, profile.creator.cover, profile.creator.primaryGenre.value, profile.creator.voice?.value,
    controls, plates, hasLyrics, noLyrics, pictureIds, uploads.signedIn, uploads.pending, windowOwn.own, windowOwn.problem, windowReads.pending, Object.keys(windowReads.readings).join(','),
    // What the library holds, not the links to it (they are renewed all the time).
    library?.map(item => item.id + (item.cutoutUrl ? '+cut' : '') + (item.motionUrl ? '+m' : '')).join(','),
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
  const latest = useRef({ view, composition, music, fallbackText, lyricsOn, pictureOf, rowKey, onProgress });
  latest.current = { view, composition, music, fallbackText, lyricsOn, pictureOf, rowKey, onProgress };
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
    if (!fontReady || plates === null || library === null) return;
    const keys = new Map(SHELF_ROWS.map(def => [def.id, latest.current.rowKey(def.id)] as const));
    const stale = SHELF_ROWS.filter(def => painted.current.get(def.id) !== keys.get(def.id));
    for (const def of stale) painted.current.delete(def.id);
    setReadyRows(rows => rows.filter(id => !stale.some(def => def.id === id)));
    let cancelled = false;
    const total = stale.reduce((sum, def) => sum + (keys.get(def.id) ? latest.current.view[def.id].slots.length : 0), 0);
    let done = 0;
    latest.current.onProgress(done, total);
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
          if (!canvas) {
            latest.current.onProgress(++done, total);
            continue;
          }
          const { composition: base, music: impact, fallbackText: fallback } = latest.current;
          const withLyrics = latest.current.lyricsOn(def.id);
          try {
            await blitPackFrame(canvas, packOpts(slots[index], base, impact, fallback, withLyrics, latest.current.pictureOf(def.id, slots[index])), posterAt(base, impact, withLyrics));
          } catch (cause) {
            if (!cancelled) setError(`${def.title}: ${friendlyError(cause, 'One creative could not be prepared.')}`);
          }
          await yieldFrame();
          latest.current.onProgress(++done, total);
        }
        if (cancelled) return;
        painted.current.set(def.id, key);
        setReadyRows(rows => [...rows, def.id]);
      }
      if (cancelled) return;
      setShelfStatus('');
    })();
    return () => { cancelled = true; };
  }, [fontReady, plates, library === null, rowKeys]);

  // Live preview: only when everything is painted and the playhead frame changes.
  useEffect(() => {
    if (!allReady || !fontReady || !playing || !playingSlot) return;
    const canvas = canvasRefs.current.get(playingSlot.id);
    if (!canvas) return;
    let alive = true;
    let raf = 0;
    const withLyrics = lyricsOn(playingSlot.row);
    const picture = pictureOf(playingSlot.row, playingSlot);
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
    if (next.generation !== undefined) reportRefresh(token, profile, row, next.generation);
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
    reportPackFeedback(token, profile, 'select', slot, { selectedIds: [...cart.items.map(held => held.id), slot.id], generation: item.generation, ownPicture: item.uploadId !== null });
  }

  /** What a cart item is drawn from now: the person's own picture (if it is still there) or the library / plate. */
  function pictureFor(item: CartItem): { available: boolean; picture?: Picture } {
    // Own upload wins over a library id left on the dealt slot (Riso still deals library ids under an own picture).
    if (item.uploadId !== null) {
      const upload = (uploads.list ?? []).find(candidate => candidate.id === item.uploadId && candidate.status === 'ready' && candidate.url);
      return upload ? { available: true, picture: drawingFrom(upload) } : { available: false };
    }
    if (item.slot.libraryId) {
      const picture = drawingFrom(libraryItem(item.slot.libraryId));
      return picture ? { available: true, picture } : { available: false };
    }
    return { available: true };
  }

  function togglePlay(id: string) {
    if (!allReady || !fontReady) return;
    if (playing && playingId === id) {
      onStop();
      setPlayingId(null);
      return;
    }
    setPlayingId(id);
    if (playing) onStop();
    const slot = pack.find(item => item.id === id);
    if (slot) reportPackFeedback(token, profile, 'play', slot, { generation: controls[slot.row].generation, ownPicture: Boolean(useOf(slot.row) && pictures[useOf(slot.row)!]) });
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
          // Never send both: own upload replaces the library picture on this row.
          ...(item.uploadId ? { uploadId: item.uploadId } : item.slot.libraryId ? { libraryId: item.slot.libraryId } : {}),
        }));
        reportPackFeedback(token, profile, 'download', item.slot, { selectedIds: cart.items.map(held => held.id), generation: item.generation, ownPicture: item.uploadId !== null });
      }
      return ids;
    });
  }
  downloadRef.current = downloadCart;
  useEffect(() => () => { downloadRef.current = null; }, []);

  return <main className="desktop trim flex-1 content-start">
    {!token && !IS_ALIGNMENT_STAGING && <p role="alert">Staging access is unavailable.</p>}
    {profile.lyricMeaning?.status === 'error' && <p className="hint">We could not read what your lyrics say, so these are matched to the sound alone.</p>}
    {error && <p role="alert">{error}</p>}
    {playbackError && <p role="alert">{playbackError}</p>}
    {shelfStatus && <p role="status" className="hint">{shelfStatus}</p>}
    {cart.full && <p role="status" className="hint">Your cart is full ({CART_LIMIT}). Take one out to add another.</p>}
    <p className="hint text-center">This is only a preview. All creatives will be rendered in HD.</p>
    {noLyrics && <p className="hint text-center">Your song has no lyrics, so there is no lyric type on these.</p>}
    {rowsFor(noLyrics).filter(def => def.upload || view[def.id].slots.length || view[def.id].note).map(def => {
      const { slots, note } = view[def.id];
      const rowReady = readyRows.includes(def.id);
      return (
        <section key={def.id} className="rounded-[var(--radius-panel)] bg-background p-5" aria-label={def.title} aria-busy={slots.length > 0 && !rowReady}>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {def.lyrics === 'switch' && !noLyrics && <label className="lyrics-switch">
              <input
                type="checkbox"
                role="switch"
                checked={controls[def.id].lyrics}
                onChange={event => change(def.id, { lyrics: event.target.checked })}
              />
              <span>Lyrics</span>
            </label>}
            {def.upload && <PictureUpload use={def.upload} uploads={uploads} onChange={stopPlayback} />}
            <RollingButton
              variant="secondary"
              label="Refresh"
              every={REFRESH_NUDGE_MS}
              disabled={!rowReady}
              onClick={() => change(def.id, { generation: controls[def.id].generation + 1 })}
              aria-label={`Refresh ${def.title}`}
            />
          </div>
          {note && <p className="hint mt-4" role="status">{note}</p>}
          {slots.length > 0 && <div className="creatives-pack-grid" role="list">
            {slots.map((item, index) => {
              const inCart = cart.has(item.id);
              const isPlaying = playing && playingId === item.id;
              return (
                <div key={item.id} className="creatives-pack-item" role="listitem">
                  <div className={`creatives-pack-card${rowReady ? '' : ' pending'}${inCart ? ' selected' : ''}`}>
                    <canvas
                      ref={node => { if (node) canvasRefs.current.set(item.id, node); else canvasRefs.current.delete(item.id); }}
                      width={PREVIEW_WIDTH}
                      height={PREVIEW_HEIGHT}
                      aria-hidden="true"
                    />
                    <LoadingMask loading={!rowReady} />
                    <button
                      type="button"
                      className="creatives-pack-select"
                      disabled={!rowReady || (!inCart && cart.full)}
                      aria-pressed={inCart}
                      aria-label={`${def.title} creative ${index + 1}, ${inCart ? 'in your cart' : 'add to your cart'}`}
                      onClick={() => toggleCart(item)}
                    />
                    <button
                      type="button"
                      className="creatives-pack-play"
                      disabled={!rowReady}
                      aria-label={`${isPlaying ? 'Pause' : 'Play'} ${def.title} creative ${index + 1}`}
                      onClick={() => togglePlay(item.id)}
                    >{isPlaying ? <PauseIcon aria-hidden="true" className="size-5" /> : <PlayIcon aria-hidden="true" className="size-5" />}</button>
                  </div>
                </div>
              );
            })}
          </div>}
        </section>
      );
    })}
    <div className="step-actions flex items-center">
      <Button variant="secondary" onClick={onBack}>Back</Button>
    </div>
  </main>;
}
