import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { DURATION_MS, FPS, playheadFrame, type Composition, type ImpactMusic } from './composition';
import { songAccents } from './pack-director';
import type { CreativeProfileV1 } from './creative-profile';
import { posterFrame } from './lyric-motion';
import { adPunchFallbackText, isLookRow, recommendRow, rowsFor, SHELF_ROWS, windowHand, type CreativesPackSlot, type OwnKind, type PlateRef, type ShelfRow } from './creatives-pack';
import { CART_LIMIT, cardThumbnail, songKeyOf, type Cart, type CartItem } from './cart';
import type { CartDownload } from './use-cart-download';
import { friendlyError } from './friendly-error';
import { PauseIcon, PlayIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PictureUpload } from './picture-upload';
import { SHELF_PICTURE, type Upload } from './uploads';
import type { Uploads } from './use-uploads';
import { useWindowOwn } from './use-window-own';
import { loadDisplayFonts } from './ad-fonts';
import { deriveMusicIntent } from './music-intent';
import { reportPackFeedback, reportRefresh, reportWatch } from './pack-feedback';
import {
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  blitPackFrame,
  destroySharedPackRenderer,
  type PackRendererOpts,
} from './pack-renderer';
import type { ReelSource } from './pack-reel';
import { clipToMonoWav, submitCloudJob } from './pack-cloud-export';
import { LoadingMask } from './loading-mask';
import { loadPunchPlatesManifest } from './punch-plates';
import { useLibrary } from './use-library';
import { useWindowReadings } from './use-window-library';
import { IS_ALIGNMENT_STAGING } from './staging-alignment';

function impactMusic(profile: CreativeProfileV1): ImpactMusic | null {
  if (profile.musicAnalysis.status !== 'ready') return null;
  const data = profile.musicAnalysis.result;
  const downbeatsMs = data.rhythm.downbeatsMs.slice(0, 200);
  const accentsMs = songAccents(data.temporalV1?.segments ?? [], profile.approvedLyrics?.cues ?? [], downbeatsMs, DURATION_MS).slice(0, 60);
  const pace = deriveMusicIntent(data)?.treatmentHint;
  return {
    beatsMs: data.rhythm.beatsMs.slice(0, 500),
    downbeatsMs,
    energy: data.features.frames.slice(0, 2000).map(point => ({
      timeMs: Math.max(0, Math.min(15000, Math.round(point.timeMs))),
      rms: Math.max(0, Math.min(1, point.rms)),
    })),
    ...(accentsMs.length ? { accentsMs } : {}),
    ...(pace ? { pace } : {}),
  };
}

/** The links a shelf card needs to draw the person's own picture (instead of our approved photo): Dust a photo and its cut-out, Riso a photo with cut-out or a clip, Our photography a photo or a clip, Window either (the cut-out is used by the cards that have her in front). */
type Picture = Pick<PackRendererOpts, 'photoUrl' | 'cutoutUrl' | 'motionUrl' | 'motionShots' | 'reel'>;

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

function yieldFrame() {
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}

type RowView = { slots: CreativesPackSlot[]; note: string };
/** `generation` is how many times the shelf has been refreshed (one Refresh deals every template again). */
type RowControls = { generation: number };

const FRESH_ROWS = Object.fromEntries(SHELF_ROWS.map(row => [row.id, { generation: 0 }])) as Record<ShelfRow, RowControls>;

/** The shelf shows one creative of each template. */
const LEAD = 1;

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
  downloadRef: MutableRefObject<(() => boolean) | null>;
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
  /** One Refresh for the whole shelf deals every template again. */
  const [controls, setControls] = useState(FRESH_ROWS);
  /** One Lyrics switch for the whole shelf: off, the templates made of the lyrics leave it and none of the rest shows words. */
  const [lyricsSwitch, setLyricsSwitch] = useState(true);
  /** The approved photos; null until they have been read. */
  const [plates, setPlates] = useState<PlateRef[] | null>(null);
  /** The cards whose posters are finished. */
  const [readyCards, setReadyCards] = useState<ReadonlySet<string>>(new Set());
  const music = useMemo(() => impactMusic(profile), [profile.musicAnalysis, profile.approvedLyrics]);
  const intent = useMemo(
    () => (profile.musicAnalysis.status === 'ready' ? deriveMusicIntent(profile.musicAnalysis.result) : null),
    [profile.musicAnalysis],
  );
  const fallbackText = useMemo(() => adPunchFallbackText(profile, intent), [profile, intent]);
  const hasLyrics = Boolean(profile.approvedLyrics?.cues.length);
  // A song with no words, or with the Lyrics switch off, shows only the templates that work without them, with no words on any.
  const noLyrics = Boolean(profile.noLyrics);
  const textless = noLyrics || !lyricsSwitch;
  const lyricsOn = () => !textless;

  // The shelf's one picture: the person's own, once it is ready (a new one replaces it), else ours.
  // Links are renewed from time to time, so cards are keyed by id, not link.
  const uploaded = uploads.current.find(item => item.use === SHELF_PICTURE && item.status === 'ready' && item.url) ?? null;
  // The person can go back to our pictures after uploading their own; a new upload is used at once.
  const [ours, setOurs] = useState(false);
  useEffect(() => { setOurs(false); }, [uploaded?.id]);
  const own = ours ? null : uploaded;
  const ownKind: OwnKind | null = own ? (own.motionUrl ? 'motion' : 'photo') : null;
  /** The templates on the shelf now: a video or GIF leaves out the ones that need a photo, no lyrics the ones made of them. */
  const shelf = rowsFor(textless, ownKind);
  /** The person's own picture, for a template that draws one. */
  const ownFor = (row: ShelfRow) => (SHELF_ROWS.find(def => def.id === row)?.picture ? own : null);
  const windowOwn = useWindowOwn(own);
  // Our approved library fills the shelf until the person uses their own picture.
  const library = useLibrary();
  // Riso draws library cut-out photos or clips; Dust only cut-out photos; Window photos with cut-out or clips.
  const libraryFor = (row: ShelfRow) => {
    // Live-look rows deal from our library; a picture of the person's own is drawn on all four cards instead (see `recommendRow`).
    if (isLookRow(row)) return library ?? [];
    return (row === 'photography' || row === 'riso' || row === 'dust' || row === 'window') && !own ? library ?? [] : [];
  };
  // Window deals from library pictures too, once it has read how each looks (the four it is about to deal).
  const windowPictures = useMemo(() => (own ? [] : windowHand(profile, controls.window.generation, library ?? [])), [own?.id, profile.clip.sourceSha256, profile.lyricMeaning, profile.creator, controls.window.generation, library?.map(item => item.id + (item.cutoutUrl ? '+cut' : '') + (item.motionUrl ? '+m' : '')).join(',')]);
  const windowReads = useWindowReadings(windowPictures);
  const libraryCutouts = (library ?? []).some(item => item.kind === 'photo' && item.cutoutUrl);
  const libraryRisoMotion = (library ?? []).some(item => item.kind !== 'photo' && item.motionUrl);
  const libraryItem = (id: string | undefined) => (id ? (library ?? []).find(item => item.id === id) ?? null : null);
  /** The pictures and clips of a Director's reel, in the order it opens on them. Null when too few of them are still in the library. */
  const reelOf = (ids: readonly string[] | undefined, depth = false): Picture | undefined => {
    const sources = (ids ?? []).flatMap((id): ReelSource[] => {
      const item = libraryItem(id);
      if (!item) return [];
      // Depth also needs each photo's cut-out, to put the person in front.
      if (item.kind === 'photo') return depth && !item.cutoutUrl ? [] : [{ id, kind: 'photo', url: item.url, ...(depth ? { cutoutUrl: item.cutoutUrl } : {}) }];
      return item.motionUrl ? [{ id, kind: 'clip', url: item.motionUrl, ...(item.shots ? { shots: item.shots } : {}) }] : [];
    });
    return sources.length >= 2 ? { reel: sources } : undefined;
  };
  const pictureOf = (row: ShelfRow, slot?: CreativesPackSlot) =>
    (ownFor(row) ? drawingFrom(ownFor(row)) : undefined) ?? (slot?.reelIds ? reelOf(slot.reelIds, row === 'depth') : undefined) ?? (slot?.libraryId ? drawingFrom(libraryItem(slot.libraryId)) : undefined);
  const pictureIds = own?.id ?? 'ours';

  const view = useMemo(() => Object.fromEntries(SHELF_ROWS.map((def): [ShelfRow, RowView] => {
    // Not on the shelf now (made of the lyrics and there are none, or needs a photo and the picture is a video): nothing is dealt, drawn or paid for.
    if (!shelf.some(item => item.id === def.id)) return [def.id, { slots: [], note: '' }];
    // Dust and Depth need cut-out photos; Riso also accepts library videos/GIFs (and the person's own video).
    if ((def.id === 'dust' || def.id === 'riso' || def.id === 'depth') && !own) {
      if (plates === null || library === null) {
        return [def.id, { slots: [], note: '' }];
      } else if (!plates.some(plate => plate.cutout) && !libraryCutouts && !(def.id === 'riso' && libraryRisoMotion)) {
        return [def.id, { slots: [], note: !uploads.signedIn && !uploads.pending ? `${def.title}: we have no approved photos for this yet. Sign in (top right) to use your own.` : `${def.title}: we have no approved photos for this yet. Upload a photo${def.id === 'riso' ? ', video or GIF' : ''} to see it.` }];
      }
    }
    // Our photography is dealt once it knows what our library holds and which approved photo it may draw a look on.
    if (def.id === 'photography' && (library === null || plates === null)) return [def.id, { slots: [], note: '' }];
    // The looks are dealt once it knows what our library holds.
    if (isLookRow(def.id) && library === null && !own) return [def.id, { slots: [], note: '' }];
    // Window is dealt once it knows its pictures: the person's own, once it has been read (what shows in the letters decides the colours), or our approved photos.
    if (def.id === 'window' && (own ? !windowOwn.own : plates === null || library === null || windowReads.pending)) return [def.id, { slots: [], note: windowOwn.problem }];
    if (!textless && !hasLyrics) return [def.id, { slots: [], note: '' }];
    const slots = recommendRow(def.id, profile, controls[def.id].generation, plates ?? [], def.id === 'window' ? windowOwn.own : null, libraryFor(def.id), windowReads.readings, isLookRow(def.id) && Boolean(ownFor(def.id)));
    // The looks are drawn on our library pictures, so with none for this song they say so instead of vanishing.
    const note = !slots.length && isLookRow(def.id) ? `${def.title} is drawn on pictures from our library, and none fits this song yet. Upload your own picture to see it here.` : '';
    return [def.id, { slots, note }];
  })) as Record<ShelfRow, RowView>, [
    profile.clip.sourceSha256, profile.musicAnalysis, profile.lyricMeaning, profile.creator.cover, profile.creator.primaryGenre.value, profile.creator.voice?.value,
    controls, plates, hasLyrics, textless, pictureIds, ownKind, uploads.signedIn, uploads.pending, windowOwn.own, windowOwn.problem, windowReads.pending, Object.keys(windowReads.readings).join(','),
    // What the library holds, not the links to it (they are renewed all the time).
    library?.map(item => item.id + (item.cutoutUrl ? '+cut' : '') + (item.motionUrl ? '+m' : '')).join(','),
  ]);
  /** The cards on the page, in order: each template's first creative, and the rest of its four where the person asked for more. */
  const cards = shelf.flatMap(def => view[def.id].slots.slice(0, LEAD).map(slot => ({ def, slot })));
  const pack = cards.map(card => card.slot);
  const allReady = cards.every(card => readyCards.has(card.slot.id));

  const cueKey = JSON.stringify(composition.cues);
  // What every card depends on besides its own row: the song and its words.
  const songKey = `${profile.clip.sourceSha256}|${cueKey}|${fallbackText}|${music?.beatsMs.join(',') ?? ''}`;
  const cardKey = (slot: CreativesPackSlot) => `${songKey}|${lyricsOn()}|${pictureIds}|${slot.id}:${slot.grade ? Object.values(slot.grade).join(',') : ''}`;
  const cardKeys = cards.map(card => cardKey(card.slot)).join('\n');

  const getPositionRef = useRef(getPosition ?? (() => position));
  getPositionRef.current = getPosition ?? (() => position);
  const latest = useRef({ cards, composition, music, fallbackText, lyricsOn, pictureOf, cardKey, onProgress });
  latest.current = { cards, composition, music, fallbackText, lyricsOn, pictureOf, cardKey, onProgress };
  const painted = useRef(new Map<string, string>());
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

  // How long each card's preview is watched: told once, when it stops, another card starts, the shelf goes or the page closes.
  const watchFacts = useRef({ token, profile, controls, ownFor });
  watchFacts.current = { token, profile, controls, ownFor };
  useEffect(() => {
    if (!playing || !playingSlot) return;
    const slot = playingSlot;
    const since = performance.now();
    const { controls: rows, ownFor: own } = watchFacts.current;
    const extras = { generation: rows[slot.row].generation, ownPicture: Boolean(own(slot.row)) };
    let told = false;
    const tell = () => {
      if (told) return;
      told = true;
      reportWatch(watchFacts.current.token, watchFacts.current.profile, slot, performance.now() - since, extras);
    };
    window.addEventListener('pagehide', tell);
    return () => { window.removeEventListener('pagehide', tell); tell(); };
  }, [playing, playingSlot?.id]);

  // A picture that has just become ready is drawn at once, and the one shared drawing surface must not be in use.
  useEffect(() => { if (playingId) stopPlayback(); }, [pictureIds]);

  // A card that no longer exists cannot stay playing. (Cards in the cart are kept on purpose.)
  useEffect(() => {
    setPlayingId(current => (current && !pack.some(slot => slot.id === current) ? null : current));
  }, [pack.map(slot => slot.id).join()]);

  // Tear down shared WebGL when leaving the pack screen.
  const leaving = useRef(false);
  useEffect(() => () => { leaving.current = true; destroySharedPackRenderer(); }, []);

  // Posters: only cards whose own inputs changed are painted again; each card appears as soon as it is done.
  useEffect(() => {
    if (!fontReady || plates === null || library === null) return;
    const wanted = latest.current.cards;
    const keys = new Map(wanted.map(card => [card.slot.id, latest.current.cardKey(card.slot)] as const));
    // What is no longer on the page has to be painted afresh if it comes back (its canvas is gone).
    for (const id of [...painted.current.keys()]) if (!keys.has(id)) painted.current.delete(id);
    const stale = wanted.filter(card => painted.current.get(card.slot.id) !== keys.get(card.slot.id));
    for (const card of stale) painted.current.delete(card.slot.id);
    setReadyCards(ready => new Set([...ready].filter(id => keys.has(id) && !stale.some(card => card.slot.id === id))));
    let cancelled = false;
    const total = stale.length;
    let done = 0;
    latest.current.onProgress(done, total);
    void (async () => {
      // Wait a frame so the cards' canvases are mounted.
      await yieldFrame();
      for (const { def, slot } of stale) {
        if (cancelled) return;
        setError('');
        await yieldFrame();
        const canvas = canvasRefs.current.get(slot.id);
        if (canvas) {
          const { composition: base, music: impact, fallbackText: fallback } = latest.current;
          const withLyrics = latest.current.lyricsOn();
          try {
            await blitPackFrame(canvas, packOpts(slot, base, impact, fallback, withLyrics, latest.current.pictureOf(def.id, slot)), posterAt(base, impact, withLyrics));
          } catch (cause) {
            if (!cancelled) setError(`${def.title}: ${friendlyError(cause, 'One creative could not be prepared.')}`);
          }
          await yieldFrame();
        }
        if (cancelled) return;
        painted.current.set(slot.id, keys.get(slot.id)!);
        setReadyCards(ready => new Set(ready).add(slot.id));
        latest.current.onProgress(++done, total);
      }
    })();
    return () => { cancelled = true; };
  }, [fontReady, plates, library === null, cardKeys]);

  // Live preview: only when everything is painted and the playhead frame changes.
  useEffect(() => {
    if (!allReady || !fontReady || !playing || !playingSlot) return;
    const canvas = canvasRefs.current.get(playingSlot.id);
    if (!canvas) return;
    let alive = true;
    let raf = 0;
    const withLyrics = lyricsOn();
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
  }, [allReady, fontReady, playing, playingSlot?.id, cardKeys, composition, music, fallbackText]);

  /** Any change to a row stops playback first, so the one shared drawing surface is never used twice at once. */
  function stopPlayback() {
    onStop();
    setPlayingId(null);
  }

  /** One Refresh for the whole shelf: every template deals a new creative. */
  function refreshShelf() {
    stopPlayback();
    // One report for the whole shelf (not one per template), filed under the first template.
    if (shelf[0]) reportRefresh(token, profile, shelf[0].id, controls[shelf[0].id].generation + 1);
    setControls(current => Object.fromEntries(SHELF_ROWS.map(def => [def.id, { generation: current[def.id].generation + 1 }])) as Record<ShelfRow, RowControls>);
  }

  /** A card goes into the cart exactly as it is now, so refreshing its row afterwards cannot lose it. */
  function toggleCart(slot: CreativesPackSlot) {
    if (cart.has(slot.id)) {
      cart.remove(slot.id);
      return;
    }
    const card = canvasRefs.current.get(slot.id);
    if (!card) return;
    const item: CartItem = {
      id: slot.id,
      row: slot.row,
      slot,
      lyrics: lyricsOn(),
      uploadId: ownFor(slot.row)?.id ?? null,
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
    if (item.slot.reelIds) {
      const picture = reelOf(item.slot.reelIds, item.slot.row === 'depth');
      return picture ? { available: true, picture } : { available: false };
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
    if (slot) reportPackFeedback(token, profile, 'play', slot, { generation: controls[slot.row].generation, ownPicture: Boolean(ownFor(slot.row)) });
    onPlay();
  }

  /**
   * Starts one video per cart item; false when there is nothing to start. Waiting for them, handing over the file and emptying the cart happen in
   * the app, so they survive a refresh and work from any page.
   */
  function downloadCart(): boolean {
    const items = cart.items.filter(item => pictureFor(item).available);
    if (download.progress !== null || !items.length) return false;
    onStop(); setPlayingId(null); setError('');
    download.start(songKeyOf(profile.clip.sourceSha256, profile.clip.offsetMs), items, async report => {
      report('Preparing audio…');
      // Let React paint the progress state before any work.
      await yieldFrame();
      // One small WAV for the whole batch (≈960 KB).
      const wav = await clipToMonoWav(audio, composition.clipStartMs);
      report(items.length > 1 ? `Starting ${items.length} creatives…` : 'Starting your creative…');
      // Every job is submitted now; they are made in parallel and we only hold job ids.
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
    return true;
  }
  downloadRef.current = downloadCart;
  useEffect(() => () => { downloadRef.current = null; }, []);

  return <main className="desktop trim flex-1 content-start">
    {!token && !IS_ALIGNMENT_STAGING && <p role="alert">Staging access is unavailable.</p>}
    {profile.lyricMeaning?.status === 'error' && <p className="hint">We could not read what your lyrics say, so these are matched to the sound alone.</p>}
    {error && <p role="alert">{error}</p>}
    {playbackError && <p role="alert">{playbackError}</p>}
    {cart.full && <p role="status" className="hint">Your cart is full ({CART_LIMIT}). Take one out to add another.</p>}
    <p className="hint text-center">This is only a preview. Your downloads are in HD.</p>
    {noLyrics && <p className="hint text-center">Your song has no lyrics, so there is no lyric type on these.</p>}
    <div className="flex flex-wrap items-center justify-end gap-3 rounded-[var(--radius-panel)] bg-background p-5">
      {!noLyrics && <label className="lyrics-switch">
        <input type="checkbox" role="switch" checked={lyricsSwitch} onChange={event => { stopPlayback(); setLyricsSwitch(event.target.checked); }} />
        <span>Lyrics</span>
      </label>}
      {uploaded && !ours && <Button variant="secondary" onClick={() => { stopPlayback(); setOurs(true); }}>Use our media</Button>}
      <PictureUpload uploads={uploads} onChange={stopPlayback} />
      <Button className="shimmer" disabled={!allReady} onClick={refreshShelf} aria-label="Refresh all creatives">Refresh</Button>
    </div>
    {ownKind && <p className="hint text-center">{ownKind === 'motion' ? 'Your video or GIF is shown on the templates that can use one. Dust and Depth need a photo.' : 'Your photo is shown on the templates that use a picture.'}</p>}
    {!textless && !hasLyrics && <p className="hint text-center" role="status">Approve your synced lyrics, or switch Lyrics off.</p>}
    {SHELF_ROWS.map(def => view[def.id].note ? <p key={def.id} className="hint text-center" role="status">{view[def.id].note}</p> : null)}
    {cards.length > 0 && <div className="creatives-pack-grid" role="list" aria-busy={!allReady}>
      {cards.map(({ def, slot: item }) => {
        const ready = readyCards.has(item.id);
        const inCart = cart.has(item.id);
        const isPlaying = playing && playingId === item.id;
        return (
          <div key={item.id} className="creatives-pack-item" role="listitem">
            <div className={`creatives-pack-card${ready ? '' : ' pending'}${inCart ? ' selected' : ''}`}>
              <canvas
                ref={node => { if (node) canvasRefs.current.set(item.id, node); else canvasRefs.current.delete(item.id); }}
                width={PREVIEW_WIDTH}
                height={PREVIEW_HEIGHT}
                aria-hidden="true"
              />
              <LoadingMask loading={!ready} />
              <button
                type="button"
                className="creatives-pack-select"
                disabled={!ready || (!inCart && cart.full)}
                aria-pressed={inCart}
                aria-label={`${def.title} creative, ${inCart ? 'in your cart' : 'add to your cart'}`}
                onClick={() => toggleCart(item)}
              />
              <button
                type="button"
                className="creatives-pack-play"
                disabled={!ready}
                aria-label={`${isPlaying ? 'Pause' : 'Play'} ${def.title} creative`}
                onClick={() => togglePlay(item.id)}
              >{isPlaying ? <PauseIcon aria-hidden="true" className="size-5" /> : <PlayIcon aria-hidden="true" className="size-5" />}</button>
            </div>
            <div className="creatives-pack-caption">
              <span className="creatives-pack-name">{def.title}</span>
            </div>
          </div>
        );
      })}
    </div>}
    <div className="step-actions flex items-center">
      <Button variant="secondary" onClick={onBack}>Back</Button>
    </div>
  </main>;
}
