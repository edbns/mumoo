import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { FPS, FULL_CLIP_MS, playheadFrame, type Composition, type ImpactMusic } from './composition';
import { songAccents } from './pack-director';
import type { CreativeProfileV1 } from './creative-profile';
import { posterFrame } from './lyric-motion';
import { isLookRow, isTreatmentRow, recommendRow, rowsFor, shelfOrder, SHELF_ROWS, type CreativesPackSlot, type Deal, type OwnKind, type PlateRef, type ShelfRow } from './creatives-pack';
import { cardThumbnail, songKeyOf, type Cart, type CartItem } from './cart';
import type { CartDownload } from './use-cart-download';
import { NO_GRAPHICS, RELOAD, friendlyError, quietError } from './friendly-error';
import { reportProblem } from './report-problem';
import { PauseIcon, PlayIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { PictureUpload, UploadProgress } from './picture-upload';
import type { Upload } from './uploads';
import type { Uploads } from './use-uploads';
import { loadDisplayFonts } from './ad-fonts';
import { deriveMusicIntent } from './music-intent';
import { musicHits } from './music-hits';
import { presetTitle } from './edit-presets';
import { reportPackFeedback, reportRefresh, reportShown, reportWatch } from './pack-feedback';
import {
  DRAW_HOLD_MS,
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  blitPackFrame,
  destroySharedPackRenderer,
  warmPackStills,
  type PackRendererOpts,
} from './pack-renderer';
import { preloadReel, readyToPlay, setReelPreview, type ReelSource } from './pack-reel';
import { setMotionLive } from './pack-motion';
import { QUEUE_BATCH, clipToMonoWav, submitCloudJobs } from './pack-cloud-export';
import { LoadingMask } from './loading-mask';
import { RefreshFloat } from './refresh-float';
import { loadPunchPlatesManifest } from './punch-plates';
import { useLibrary } from './use-library';
import { dealSeed, rememberSeen, seenLibrary } from './library-seen';
import { clockNow } from './pack-screenshot';
import type { LibraryPicture } from './library-pick';
import { askToBuyCredits, askToChooseFewer, creditsChanged, videosLeft } from './credit-events';

function impactMusic(profile: CreativeProfileV1): ImpactMusic | null {
  if (profile.musicAnalysis.status !== 'ready') return null;
  const data = profile.musicAnalysis.result;
  const downbeatsMs = data.rhythm.downbeatsMs.slice(0, 200);
  const clipMs = profile.clip.durationMs;
  const accentsMs = songAccents(data.temporalV1?.segments ?? [], profile.approvedLyrics?.cues ?? [], downbeatsMs, clipMs).slice(0, 60);
  const intent = deriveMusicIntent(data);
  const pace = intent?.treatmentHint;
  const beatsMs = data.rhythm.beatsMs.slice(0, 500);
  const hits = musicHits({
    beatsMs,
    downbeatsMs,
    transientsMs: data.features.transientsMs ?? [],
    frames: data.features.frames,
    segments: data.temporalV1?.segments ?? [],
    durationMs: clipMs,
  });
  return {
    beatsMs,
    downbeatsMs,
    energy: data.features.frames.slice(0, 2000).map(point => ({
      timeMs: Math.max(0, Math.min(clipMs, Math.round(point.timeMs))),
      rms: Math.max(0, Math.min(1, point.rms)),
    })),
    ...(accentsMs.length ? { accentsMs } : {}),
    ...(pace ? { pace } : {}),
    ...(intent ? { drive: intent.drive } : {}),
    ...hits,
  };
}

/** The links a shelf card needs to draw the person's own picture (instead of our approved photo): Riso a photo with cut-out or a clip, Our photography and Window a photo or a clip. */
type Picture = Pick<PackRendererOpts, 'photoUrl' | 'cutoutUrl' | 'motionUrl' | 'motionShots' | 'reel'>;

function drawingFrom(upload: Pick<Upload, 'url' | 'cutoutUrl' | 'motionUrl' | 'shots'> | null): Picture | undefined {
  if (!upload?.url) return undefined;
  if (upload.motionUrl) return { motionUrl: upload.motionUrl, ...(upload.shots ? { motionShots: upload.shots } : {}) };
  return { photoUrl: upload.url, ...(upload.cutoutUrl ? { cutoutUrl: upload.cutoutUrl } : {}) };
}

/** One of the person's own pictures, dealt like a library picture: it fits any song (no feeling, no genre of its own). */
function asLibraryPicture(upload: Upload): LibraryPicture {
  return {
    id: upload.id,
    kind: upload.kind === 'photo' ? 'photo' : 'video',
    attitudes: ['neutral'],
    tags: [],
    genre: null,
    subGenre: null,
    url: upload.url ?? '',
    ...(upload.cutoutUrl ? { cutoutUrl: upload.cutoutUrl } : {}),
    ...(upload.motionUrl ? { motionUrl: upload.motionUrl } : {}),
    ...(upload.shots ? { shots: upload.shots } : {}),
  };
}

function packOpts(
  slot: CreativesPackSlot,
  composition: Composition,
  clipMs: number,
  music: ImpactMusic | null,
  lyrics: boolean,
  picture?: Picture,
): PackRendererOpts {
  const drawn = picture ?? (slot.plateId ? { plateId: slot.plateId } : slot.effectId ? { effectId: slot.effectId } : {});
  return {
    // A 15-second card says nothing of its length (what every card said before shorter songs were taken).
    ...(clipMs < FULL_CLIP_MS ? { durationMs: clipMs } : {}),
    style: slot.style,
    font: slot.font,
    fontSecondary: slot.fontSecondary,
    layout: slot.layout,
    ...(slot.colors ? { colors: slot.colors } : {}),
    ...(slot.inkSet ? { inkSet: slot.inkSet } : {}),
    ...(slot.windowMode ? { windowMode: slot.windowMode, windowPalette: slot.windowPalette, windowAllowed: slot.windowAllowed, ...(slot.windowShape ? { windowShape: slot.windowShape } : {}) } : {}),
    ...(slot.typeStyle ? { typeStyle: slot.typeStyle } : {}),
    ...(slot.typeStyle && slot.typeFinish ? { typeFinish: slot.typeFinish } : {}),
    ...(slot.typeStyle && slot.typeAccent ? { typeAccent: slot.typeAccent } : {}),
    ...(slot.typeStyle && slot.typeEmphasis ? { typeEmphasis: slot.typeEmphasis } : {}),
    // A live look goes on a picture (the library's or the person's own), never on a baked effect.
    ...(slot.look && !('effectId' in drawn) ? { look: slot.look } : {}),
    ...(slot.treatment ? { treatment: slot.treatment, treatmentVariant: slot.treatmentVariant } : {}),
    // Screenshot's phone shows the time on this device when the card is drawn or downloaded.
    ...(slot.treatment === 'screenshot' ? { clock: clockNow() } : {}),
    ...(slot.preset && !('effectId' in drawn) && !('plateId' in drawn) ? { preset: slot.preset, presetTake: slot.presetTake } : {}),
    ...(slot.cutSeed != null ? { cutSeed: slot.cutSeed } : {}),
    // With lyrics off nothing about the words is used or sent anywhere, not even what they mean.
    ...(slot.grade && lyrics ? { grade: slot.grade } : {}),
    cues: lyrics ? composition.cues : [],
    music,
    lyrics,
    // Our approved photo (Riso) or its baked effect (Our photography), unless the person chose their own picture, which replaces it.
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

// The shelf draws still cards from posters and streams a clip only for the card that plays (`pack-reel.ts`).
setReelPreview(true);

/** The shelf shows one creative of each template. */
const LEAD = 1;
/** A poster not drawn by then is left for a second try after the rest: one stalled picture never holds the whole shelf. */
const CARD_DRAW_MS = DRAW_HOLD_MS;

export function CreativesPackStudio({
  profile, composition, audio, token, position, getPosition, playing, playbackError,
  cart, download, uploads, downloadRef, onPlay, onStop, onBack, onProgress, onGone,
}: {
  profile: CreativeProfileV1;
  composition: Composition;
  audio: AudioBuffer;
  token: string;
  position: number;
  getPosition?: () => number;
  playing: boolean;
  /** Kept out of sight: what went wrong is written to the console, never over the creatives. */
  playbackError: string;
  /** The cart and the download live in the app, so they are the same on every page. */
  cart: Cart;
  download: CartDownload;
  uploads: Uploads;
  /** Where the app finds this page's download, which needs the music and pictures only this page has. */
  downloadRef: MutableRefObject<(() => Promise<boolean>) | null>;
  /** The cart items whose library pictures were removed (comma-separated ids), once the library is known: the cart says so and leaves them out. */
  onGone: (ids: string) => void;
  onPlay: () => void;
  onStop: () => void;
  onSeek?: (ms: number) => void;
  onBack: () => void;
  /** How many posters are painted out of how many need painting; equal means the page is ready to be shown. */
  onProgress: (done: number, total: number) => void;
}) {
  const canvasRefs = useRef(new Map<string, HTMLCanvasElement>());
  const [playingId, setPlayingId] = useState<string | null>(null);
  /** The card whose first pictures are being read: it plays once they are in. */
  const [startingId, setStartingId] = useState<string | null>(null);
  const starting = useRef<string | null>(null);
  const [fontReady, setFontReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (error) console.warn('[creatives]', error); }, [error]);
  useEffect(() => { if (playbackError) console.warn('[creatives] playback', playbackError); }, [playbackError]);
  /** One Refresh for the whole shelf deals every template again. */
  const [controls, setControls] = useState(FRESH_ROWS);
  /** One Lyrics switch for the whole shelf: off, the templates made of the lyrics leave it and none of the rest shows words. */
  const [lyricsSwitch, setLyricsSwitch] = useState(true);
  /** The approved photos; null until they have been read. */
  const [plates, setPlates] = useState<PlateRef[] | null>(null);
  /** The cards whose posters are finished. */
  const [readyCards, setReadyCards] = useState<ReadonlySet<string>>(new Set());
  // The app builds the profile afresh on every render (about 20 a second while the song plays), so what is made from it is
  // keyed on what it holds: a new `music` object would restart the live preview, flashing the card's poster between frames.
  const lyricKey = JSON.stringify(profile.approvedLyrics?.cues ?? null);
  const creatorKey = JSON.stringify(profile.creator);
  const music = useMemo(() => impactMusic(profile), [profile.musicAnalysis, lyricKey]);
  const hasLyrics = Boolean(profile.approvedLyrics?.cues.length);
  // A song with no words, or with the Lyrics switch off, shows only the templates that work without them, with no words on any.
  const noLyrics = Boolean(profile.noLyrics);
  const textless = noLyrics || !lyricsSwitch;
  const lyricsOn = () => !textless;

  // The person's own pictures, once ready, else ours. One is drawn on every template (four colourings of it); two or more are
  // dealt like our library, each card its own picture, and the Director edits reels from them.
  // Links are renewed from time to time, so cards are keyed by id, not link.
  const readyOwn = uploads.current.filter(item => item.status === 'ready' && item.url);
  const readyIds = readyOwn.map(item => item.id).join(',');
  // The person can go back to our pictures after uploading their own; a new upload is used at once.
  const [ours, setOurs] = useState(false);
  useEffect(() => { setOurs(false); }, [readyIds]);
  const uploaded = readyOwn.length > 0;
  const own = ours || readyOwn.length !== 1 ? null : readyOwn[0];
  const ownPool = ours || readyOwn.length < 2 ? null : readyOwn.map(asLibraryPicture);
  const ownKind: OwnKind | null = own ? (own.motionUrl ? 'motion' : 'photo')
    : ownPool ? (ownPool.some(item => item.kind === 'photo') ? 'photo' : 'motion') : null;
  /** Is this card drawn from the person's own pictures (one, or a pool of them)? */
  const ownCard = (slot: CreativesPackSlot) => Boolean(ownFor(slot.row)) || (ownPool !== null && ownPoolIds(slot).length > 0);
  /** The own pictures a pool card draws from: its one picture, or its reel's. */
  const ownPoolIds = (slot: CreativesPackSlot) => {
    const ids = slot.reelIds ?? (slot.libraryId ? [slot.libraryId] : []);
    return ids.every(id => readyOwn.some(item => item.id === id)) ? ids : [];
  };
  // Our approved library fills the shelf until the person uses their own pictures.
  const { items: library, learning } = useLibrary();
  // This visit's own deal, and what this person was shown before it (read once, so the shelf never reshuffles while they look).
  const [deal] = useState<Deal>(() => ({ seed: dealSeed(), seen: seenLibrary() }));
  /**
   * The templates on the shelf now: a video or GIF leaves out the ones that need a photo, no lyrics the ones made of them. Their order
   * is learned from what people download in songs like this one (`shelfOrder`), the same each time for the same song.
   */
  const shelf = useMemo(() => shelfOrder(rowsFor(textless, ownKind), learning, profile), [textless, ownKind, learning, profile]);
  /** Where a template is on the shelf now (0 is the top), told with each card so Learning can tell a good template from a high one. */
  const placeOf = (row: ShelfRow) => {
    const place = shelf.findIndex(def => def.id === row);
    return place < 0 ? undefined : place;
  };
  /** The person's own picture, for a template that draws one. */
  const ownFor = (row: ShelfRow) => (SHELF_ROWS.find(def => def.id === row)?.picture ? own : null);
  /** What the shelf deals from: the person's own pictures when they have several, else our library. */
  const dealt = ownPool ?? library;
  /** Window and Silhouette: the song's picture seen through the lyrics, or through a figure. */
  const isWindowRow = (row: ShelfRow) => row === 'window' || row === 'silhouette';
  // Riso and Window show the Directed reel of our library; Dust draws no picture.
  const libraryFor = (row: ShelfRow) => {
    // Live-look, treatment, Window and Silhouette rows deal from our library; a picture of the person's own is drawn on all four cards instead (see `recommendRow`).
    if (isLookRow(row) || isTreatmentRow(row) || isWindowRow(row)) return dealt ?? [];
    return (row === 'photography' || row === 'riso') && !own ? dealt ?? [] : [];
  };
  /** Our approved photos, which the person's own pictures replace. */
  const platesFor = ownPool ? [] : plates ?? [];
  const dealtKey = dealt?.map(item => item.id + (item.cutoutUrl ? '+cut' : '') + (item.motionUrl ? '+m' : '')).join(',');
  const libraryCutouts = (library ?? []).some(item => item.kind === 'photo' && item.cutoutUrl);
  const libraryRisoMotion = (library ?? []).some(item => item.kind !== 'photo' && item.motionUrl);
  /** A picture by id: one of the person's own (also one a cart still keeps from an earlier run), or our library's. */
  const libraryItem = (id: string | undefined): LibraryPicture | null => {
    if (!id) return null;
    const upload = (uploads.list ?? []).find(item => item.id === id && item.status === 'ready' && item.url);
    return upload ? asLibraryPicture(upload) : (library ?? []).find(item => item.id === id) ?? null;
  };
  /** The pictures and clips of a Director's reel, in the order it opens on them. Null when too few of them are still in the library. */
  const reelOf = (ids: readonly string[] | undefined): Picture | undefined => {
    const sources = (ids ?? []).flatMap((id): ReelSource[] => {
      const item = libraryItem(id);
      if (!item) return [];
      if (item.kind === 'photo') return [{ id, kind: 'photo', url: item.url }];
      return item.motionUrl ? [{ id, kind: 'clip', url: item.motionUrl, ...(item.shots ? { shots: item.shots } : {}), ...(item.url ? { poster: item.url } : {}), ...(item.smallUrl ? { small: item.smallUrl } : {}) }] : [];
    });
    return sources.length >= 2 ? { reel: sources } : undefined;
  };
  const pictureOf = (row: ShelfRow, slot?: CreativesPackSlot) =>
    (ownFor(row) ? drawingFrom(ownFor(row)) : undefined) ?? (slot?.reelIds ? reelOf(slot.reelIds) : undefined) ?? (slot?.libraryId ? drawingFrom(libraryItem(slot.libraryId)) : undefined);
  const pictureIds = own?.id ?? (ownPool ? `own:${readyIds}` : 'ours');

  const view = useMemo(() => Object.fromEntries(SHELF_ROWS.map((def): [ShelfRow, RowView] => {
    // Not on the shelf now (made of the lyrics and there are none, or needs a photo and the picture is a video): nothing is dealt, drawn or paid for.
    if (!shelf.some(item => item.id === def.id)) return [def.id, { slots: [], note: '' }];
    // Riso needs cut-out photos or library videos/GIFs (or the person's own picture).
    if (def.id === 'riso' && !own && !ownPool) {
      if (plates === null || library === null) {
        return [def.id, { slots: [], note: '' }];
      } else if (!plates.some(plate => plate.cutout) && !libraryCutouts && !libraryRisoMotion) {
        return [def.id, { slots: [], note: !uploads.signedIn && !uploads.pending ? `${def.title}: No matching visuals yet. Sign in (top right) to drop in your own.` : `${def.title}: Drop in your own photo, video, or GIF to unlock this look.` }];
      }
    }
    // Our photography is dealt once it knows what our library holds and which approved photo it may draw a look on.
    if (def.id === 'photography' && (library === null || plates === null)) return [def.id, { slots: [], note: '' }];
    // The looks, treatments and Window are dealt once it knows what our library holds.
    if ((isLookRow(def.id) || isTreatmentRow(def.id) || isWindowRow(def.id)) && dealt === null && !own) return [def.id, { slots: [], note: '' }];
    if (!textless && !hasLyrics) return [def.id, { slots: [], note: '' }];
    const slots = recommendRow(def.id, profile, controls[def.id].generation, platesFor, libraryFor(def.id), (isLookRow(def.id) || isTreatmentRow(def.id) || isWindowRow(def.id)) && Boolean(ownFor(def.id)), learning, deal);
    // The looks and treatments are drawn on our library pictures, so with none for this song they say so instead of vanishing.
    const note = !slots.length && (isLookRow(def.id) || isTreatmentRow(def.id) || def.id === 'window') && !ownPool ? `${def.title}: Needs custom visuals for this track. Upload yours to see it in action.` : '';
    return [def.id, { slots, note }];
  })) as Record<ShelfRow, RowView>, [
    profile.clip.sourceSha256, profile.musicAnalysis, profile.lyricMeaning, creatorKey, lyricKey,
    controls, plates, hasLyrics, textless, pictureIds, ownKind, uploads.signedIn, uploads.pending,
    // What the library (or the person's own pool) holds, not the links to it (they are renewed all the time).
    dealtKey, learning,
  ]);
  /** The cards on the page, in order: each template's first creative, and the rest of its four where the person asked for more. */
  // With their own media on the shelf, no card shows ours: not our library, an approved photo, or a look baked on one.
  const showsOurs = (slot: CreativesPackSlot) => ownPool !== null && !ownFor(slot.row) && ownPoolIds(slot).length === 0
    && Boolean(slot.effectId || slot.plateId || slot.libraryId || slot.reelIds);
  const cards = uploads.batchPercent !== null ? []
    : shelf.flatMap(def => view[def.id].slots.filter(slot => !showsOurs(slot)).slice(0, LEAD).map(slot => ({ def, slot })));
  const pack = cards.map(card => card.slot);
  const allReady = cards.every(card => readyCards.has(card.slot.id));

  const cueKey = JSON.stringify(composition.cues);
  // What every card depends on besides its own row: the song and its words.
  const songKey = `${profile.clip.sourceSha256}|${cueKey}|${music?.beatsMs.join(',') ?? ''}`;
  const cardKey = (slot: CreativesPackSlot) => `${songKey}|${lyricsOn()}|${pictureIds}|${slot.id}:${slot.grade ? Object.values(slot.grade).join(',') : ''}`;
  const cardKeys = cards.map(card => cardKey(card.slot)).join('\n');
  // The library pictures on the cards in view, so the next creatives start with ones this person has not seen.
  const shownIds = pack.flatMap(slot => slot.reelIds ?? (slot.libraryId ? [slot.libraryId] : [])).filter(id => library?.some(item => item.id === id)).join(',');
  useEffect(() => { rememberSeen(shownIds ? shownIds.split(',') : []); }, [shownIds]);

  const getPositionRef = useRef(getPosition ?? (() => position));
  getPositionRef.current = getPosition ?? (() => position);
  const clipMs = profile.clip.durationMs;
  const latest = useRef({ cards, composition, clipMs, music, lyricsOn, pictureOf, cardKey, onProgress });
  latest.current = { cards, composition, clipMs, music, lyricsOn, pictureOf, cardKey, onProgress };
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
    const sample = composition.cues.map(cue => cue.text).join(' ');
    void loadDisplayFonts(sample)
      .then(() => { if (alive) setFontReady(true); })
      .catch(() => { if (alive) setFontReady(true); });
    return () => { alive = false; };
  }, [cueKey]);

  // Each hand is told once it is on the screen, every card drawn: the brain learns downloads out of the cards people were shown.
  const toldShown = useRef(new Set<string>());
  const shownFacts = useRef({ token, profile, controls, ownCard, placeOf, cards });
  shownFacts.current = { token, profile, controls, ownCard, placeOf, cards };
  useEffect(() => {
    if (!allReady || !cards.length) return;
    const { token: access, profile: song, controls: rows, ownCard: isOwn, placeOf: placed, cards: inView } = shownFacts.current;
    const fresh = inView.filter(card => !toldShown.current.has(card.slot.id));
    if (!fresh.length) return;
    fresh.forEach(card => toldShown.current.add(card.slot.id));
    reportShown(access, song, fresh.map(({ slot }) => ({ slot, place: placed(slot.row), ownPicture: isOwn(slot) })), rows[fresh[0].slot.row].generation);
  }, [allReady, cardKeys]);

  // How long each card's preview is watched: told once, when it stops, another card starts, the shelf goes or the page closes.
  const watchFacts = useRef({ token, profile, controls, ownCard, placeOf });
  watchFacts.current = { token, profile, controls, ownCard, placeOf };
  useEffect(() => {
    if (!playing || !playingSlot) return;
    const slot = playingSlot;
    const since = performance.now();
    const { controls: rows, ownCard: isOwn, placeOf: placed } = watchFacts.current;
    const extras = { generation: rows[slot.row].generation, ownPicture: isOwn(slot), place: placed(slot.row) };
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
      // The one picture each still card shows is fetched now, all side by side: the cards are then drawn one after another without waiting on the network.
      await warmPackStills(stale.map(({ def, slot }) => {
        const { composition: base, clipMs: length, music: impact } = latest.current;
        const withLyrics = latest.current.lyricsOn();
        return { opts: packOpts(slot, base, length, impact, withLyrics, latest.current.pictureOf(def.id, slot)), frame: posterAt(base, impact, withLyrics) };
      })).catch(() => undefined);
      /** Draws one card's poster; false when it failed or took too long (it is then tried once more after the rest). */
      const paintCard = async ({ def, slot }: (typeof stale)[number], last: boolean) => {
        const canvas = canvasRefs.current.get(slot.id);
        if (!canvas) return true;
        const { composition: base, clipMs: length, music: impact } = latest.current;
        const withLyrics = latest.current.lyricsOn();
        let timer = 0;
        try {
          await Promise.race([
            blitPackFrame(canvas, packOpts(slot, base, length, impact, withLyrics, latest.current.pictureOf(def.id, slot)), posterAt(base, impact, withLyrics)),
            new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error('Drawing took too long.')), CARD_DRAW_MS); }),
          ]);
          return true;
        } catch (cause) {
          if (!cancelled && last) {
            reportProblem('render', `${def.title} preview: ${(cause as Error)?.message ?? String(cause)}`);
            setError(quietError(cause, `One ${def.title} card couldn’t be drawn. Refresh to try again.`));
          }
          return false;
        } finally {
          clearTimeout(timer);
          await yieldFrame();
        }
      };
      const missed: typeof stale = [];
      for (const card of stale) {
        if (cancelled) return;
        setError('');
        await yieldFrame();
        if (!(await paintCard(card, false))) missed.push(card);
        if (cancelled) return;
        // A card that could not be drawn yet still counts: the shelf never waits on one card for good.
        painted.current.set(card.slot.id, keys.get(card.slot.id)!);
        setReadyCards(ready => new Set(ready).add(card.slot.id));
        latest.current.onProgress(++done, total);
      }
      for (const card of missed) {
        if (cancelled) return;
        await paintCard(card, true);
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
    const opts = packOpts(playingSlot, composition, clipMs, music, withLyrics, picture);
    let painting = false;
    let lastFrame = -1;
    let reported = false;
    setMotionLive(true);

    const paint = (frame: number) => {
      if (!alive || painting || frame === lastFrame) return;
      painting = true;
      lastFrame = frame;
      void blitPackFrame(canvas, opts, frame)
        .catch((cause) => {
          if (alive) {
            if (!reported) reportProblem('render', `Live preview: ${(cause as Error)?.message ?? String(cause)}`);
            reported = true;
            setError(quietError(cause, 'Live preview is down for a moment. Reload and try again.'));
          }
        })
        .finally(() => { painting = false; });
    };
    const loop = () => {
      paint(playheadFrame(getPositionRef.current(), clipMs));
      if (alive) raf = requestAnimationFrame(loop);
    };
    // The card plays at once, over its posters; its clips are read meanwhile, in the order it opens on them.
    void preloadReel(picture?.reel ?? []);
    loop();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      setMotionLive(false);
      // The card goes back to its own poster. Drawing is queued after the last live frame, so a late frame can never land on top of it.
      if (!leaving.current) {
        void blitPackFrame(canvas, packOpts(playingSlot, composition, clipMs, music, withLyrics, picture), posterAt(composition, music, withLyrics))
          .catch(cause => setError(quietError(cause, 'This preview couldn’t be drawn. Reload and try again.')));
      }
    };
  }, [allReady, fontReady, playing, playingSlot?.id, cardKeys, composition, music]);

  /** Any change to a row stops playback first, so the one shared drawing surface is never used twice at once. */
  function stopPlayback() {
    starting.current = null;
    setStartingId(null);
    onStop();
    setPlayingId(null);
  }

  /** One Refresh for the whole shelf: every template deals a new creative. */
  function refreshShelf() {
    stopPlayback();
    // One report for the whole shelf, not one per template.
    if (shelf[0]) reportRefresh(token, profile, controls[shelf[0].id].generation + 1);
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
    const pooled = ownPool ? ownPoolIds(slot) : [];
    const item: CartItem = {
      id: slot.id,
      row: slot.row,
      slot,
      lyrics: lyricsOn(),
      uploadId: ownFor(slot.row)?.id ?? (pooled.length && !slot.reelIds ? pooled[0] : null),
      ...(pooled.length && slot.reelIds ? { ownReel: true as const } : {}),
      generation: controls[slot.row].generation,
      thumb: cardThumbnail(card),
    };
    cart.add(item);
    reportPackFeedback(token, profile, 'select', slot, { selectedIds: [...cart.items.map(held => held.id), slot.id], generation: item.generation, ownPicture: ownCard(slot), place: placeOf(slot.row) });
  }

  /** What a cart item is drawn from now: the person's own picture (if it is still there) or the library / plate. */
  function pictureFor(item: CartItem): { available: boolean; picture?: Picture } {
    // Own upload wins over a library id left on the dealt slot (Riso still deals library ids under an own picture).
    if (item.uploadId !== null) {
      const upload = (uploads.list ?? []).find(candidate => candidate.id === item.uploadId && candidate.status === 'ready' && candidate.url);
      return upload ? { available: true, picture: drawingFrom(upload) } : { available: false };
    }
    if (item.slot.reelIds) {
      const picture = reelOf(item.slot.reelIds);
      return picture ? { available: true, picture } : { available: false };
    }
    if (item.slot.libraryId) {
      const picture = drawingFrom(libraryItem(item.slot.libraryId));
      return picture ? { available: true, picture } : { available: false };
    }
    return { available: true };
  }

  // Too few of a reel's pictures left in the library (or its one picture gone): the card cannot be made as it was put in the cart.
  const goneKey = library === null ? null
    : cart.items.filter(item => item.uploadId === null && !item.ownReel && !pictureFor(item).available).map(item => item.id).join(',');
  useEffect(() => { if (goneKey !== null) onGone(goneKey); }, [goneKey, onGone]);

  async function togglePlay(id: string) {
    if (!allReady || !fontReady) return;
    if ((playing && playingId === id) || starting.current === id) {
      starting.current = null;
      setStartingId(null);
      onStop();
      setPlayingId(null);
      return;
    }
    if (playing) onStop();
    setPlayingId(null);
    const slot = pack.find(item => item.id === id);
    if (!slot) return;
    reportPackFeedback(token, profile, 'play', slot, { generation: controls[slot.row].generation, ownPicture: ownCard(slot), place: placeOf(slot.row) });
    // Music and pictures start together, once the first pictures are in: a card that opens on posters looks broken.
    const reel = pictureOf(slot.row, slot)?.reel;
    if (reel?.length) {
      starting.current = id;
      setStartingId(id);
      await readyToPlay(reel, () => starting.current === id);
      if (starting.current !== id) return;
      starting.current = null;
      setStartingId(null);
    }
    setPlayingId(id);
    onPlay();
  }

  /**
   * Starts one video per cart item; false when there is nothing to start. Waiting for them, handing over the file and emptying the cart happen in
   * the app, so they survive a refresh and work from any page.
   */
  async function downloadCart(): Promise<boolean> {
    const items = cart.items.filter(item => pictureFor(item).available);
    if (download.progress !== null || !items.length) return false;
    // Each video takes a credit (the first is free): with too few nothing starts. With none, Purchase Credits opens; with some, the
    // person picks between buying more and making only as many as they can.
    const allowance = await import('./account').then(account => account.loadAllowance()).catch(() => null);
    if (allowance && videosLeft(allowance) < items.length) {
      const have = videosLeft(allowance);
      if (have === 0) askToBuyCredits({ need: items.length, have });
      else askToChooseFewer({ need: items.length, have, free: allowance.credits === 0 });
      return false;
    }
    onStop(); setPlayingId(null); setError('');
    download.start(songKeyOf(profile.clip.sourceSha256, profile.clip.offsetMs), items, async (report, stopped) => {
      report('Mixing audio…');
      // Let React paint the progress state before any work.
      await yieldFrame();
      // One small WAV for the whole batch (≈960 KB for 15 s).
      const wav = await clipToMonoWav(audio, composition.clipStartMs, clipMs);
      report(items.length > 1 ? `Queuing ${items.length} videos…` : 'Rendering your video…');
      // Every video is queued now, in batches: the server makes them in turns and we only hold their ids. The audio goes once.
      const ids: string[] = [];
      let order: string | undefined;
      for (let from = 0; from < items.length; from += QUEUE_BATCH) {
        await yieldFrame();
        if (stopped()) break;
        const batch = items.slice(from, from + QUEUE_BATCH);
        let queued: Awaited<ReturnType<typeof submitCloudJobs>>;
        try {
          queued = await submitCloudJobs(token, {
            wav,
            order,
            jobs: batch.map(item => ({
              opts: packOpts(item.slot, composition, clipMs, music, item.lyrics, pictureFor(item).picture),
              // Never send both: own upload replaces the library picture on this row.
              ...(item.uploadId ? { uploadId: item.uploadId } : item.ownReel ? { ownReel: true } : item.slot.libraryId ? { libraryId: item.slot.libraryId } : {}),
            })),
          });
        } catch (cause) {
          creditsChanged();
          // Out of credits part way (spent elsewhere meanwhile), or a batch that failed: the videos already queued are still made.
          if (!ids.length) throw cause;
          if ((cause as { noCredits?: boolean }).noCredits) askToBuyCredits({ need: items.length - ids.length, have: 0 });
          else setError(`${ids.length} of ${items.length} videos started exporting, but ${items.length - ids.length} couldn’t start. They’re still selected—try again in a moment.`);
          break;
        }
        ids.push(...queued.ids);
        order = queued.order;
        creditsChanged();
        for (const item of batch.slice(0, queued.ids.length)) {
          reportPackFeedback(token, profile, 'download', item.slot, { selectedIds: cart.items.map(held => held.id), generation: item.generation, ownPicture: item.uploadId !== null || Boolean(item.ownReel), place: placeOf(item.slot.row) });
        }
        if (queued.noCredits) {
          askToBuyCredits({ need: items.length - ids.length, have: 0 });
          break;
        }
        if (items.length > QUEUE_BATCH) report(`Queuing ${ids.length} of ${items.length}…`);
      }
      return ids;
    });
    return true;
  }
  downloadRef.current = downloadCart;
  useEffect(() => () => { downloadRef.current = null; }, []);

  return <main className="desktop trim flex-1 content-start">
    <div className="mt-6 flex flex-wrap items-center justify-end gap-3 rounded-[var(--radius-panel)] bg-background p-5">
      <p className="hint m-0 mr-auto">Live preview · Exports in full 1080p HD.</p>
      {!noLyrics && <label className="lyrics-switch">
        <input type="checkbox" role="switch" checked={lyricsSwitch} onChange={event => { stopPlayback(); setLyricsSwitch(event.target.checked); }} />
        <span>Lyrics</span>
      </label>}
      {uploaded && !ours && <Button variant="secondary" onClick={() => { stopPlayback(); setOurs(true); }}>Use our media</Button>}
      <PictureUpload uploads={uploads} token={token} onChange={stopPlayback} />
    </div>
    <RefreshFloat disabled={!allReady} onRefresh={refreshShelf} />
    {/* The one failure shown here: the cards cannot be drawn until the page is reloaded. */}
    {error === RELOAD && <p className="hint text-center" role="alert">{RELOAD} <button type="button" className="underline" onClick={() => location.reload()}>Reload</button></p>}
    {error === NO_GRAPHICS && <p className="hint text-center" role="alert">{NO_GRAPHICS}</p>}
    <UploadProgress uploads={uploads} />
    {ownKind && uploads.batchPercent === null && <p className="hint text-center">{ownPool
      ? (ownKind === 'motion' ? `Your ${ownPool.length} clips or GIFs will cycle across motion templates.` : `Your ${ownPool.length} photos will cycle across photo templates.`)
      : ownKind === 'motion' ? 'Your clip or GIF appears in motion templates.' : 'Your photo appears in photo-based templates.'}</p>}
    {!textless && !hasLyrics && <p className="hint text-center" role="status">Check your lyric timing, or switch lyrics off.</p>}
    {uploads.batchPercent === null && SHELF_ROWS.map(def => view[def.id].note ? <p key={def.id} className="hint text-center" role="status">{view[def.id].note}</p> : null)}
    {cards.length > 0 && <div className="creatives-pack-grid" role="list" aria-busy={!allReady}>
      {cards.map(({ def, slot: item }) => {
        // The cards are shown together, once every one of them is ready.
        const ready = allReady;
        const inCart = cart.has(item.id);
        const isPlaying = playing && playingId === item.id;
        const isStarting = startingId === item.id;
        return (
          <div key={item.id} className="creatives-pack-item" role="listitem">
            <div className={`creatives-pack-card${ready ? '' : ' pending'}${inCart ? ' selected' : ''}`}>
              <canvas
                ref={node => { if (node) canvasRefs.current.set(item.id, node); else canvasRefs.current.delete(item.id); }}
                width={PREVIEW_WIDTH}
                height={PREVIEW_HEIGHT}
                aria-hidden="true"
              />
              <LoadingMask loading={!ready} label="Rendering preview…" />
              <button
                type="button"
                className="creatives-pack-select"
                disabled={!ready}
                aria-pressed={inCart}
                aria-label={`${def.title} video preview, ${inCart ? 'selected' : 'select it'}`}
                onClick={() => toggleCart(item)}
              />
              <button
                type="button"
                className="creatives-pack-play"
                disabled={!ready}
                aria-label={`${isPlaying || isStarting ? 'Pause' : 'Play'} ${def.title} video preview`}
                aria-busy={isStarting}
                onClick={() => void togglePlay(item.id)}
              >{isStarting ? <span className="spinner" aria-hidden="true" /> : isPlaying ? <PauseIcon aria-hidden="true" className="size-5" /> : <PlayIcon aria-hidden="true" className="size-5" />}</button>
            </div>
            <div className="creatives-pack-caption">
              <span className="creatives-pack-name">{item.preset ? `${def.title} · ${presetTitle(item.preset)}` : def.title}</span>
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
