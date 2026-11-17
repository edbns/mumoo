import type { CreativeProfileV1 } from './creative-profile';
import { deriveMusicIntent, type IntentVibe, type MusicIntentV1 } from './music-intent';
import {
  dealFonts,
  fontsForLane,
  pickLayoutSeed,
  pickSecondaryFont,
  type AdFont,
  type AdLayout,
  type FontNeed,
  type MoodLane,
} from './ad-fonts';
import { STYLE_NAMES, type AdPunchStyle } from './ad-punch';
import { dustColors, type DustColors } from './dust-colors';
import { RISO_INK_SETS } from './riso-look';
import { dealSilhouette, dealWindow, type WindowCard, type WindowMode } from './window-deal';
import effectsData from '../punch-plates/effects/effects.json';
import { laneFromMeaning, leansDeep, type LyricAttitude, type LyricMeaning } from './lyric-meaning';
import { moodGrade, type MoodGrade } from './mood-grade';
import { TYPE_STYLES, typeNeeds, type TypeStyleId } from './pack-type';
import { coverFit } from './look-fit';
import type { CoverRead } from './cover-palette';
import { dealLooks, isLookFamily, liveLookTitle, type LiveLookId, type LookFamily } from './live-look-deal';
import { coloursFor } from './genre-guide';
import { colourFit, inLane, learnedNudge, libraryFit, pickLibrary, showing, usualRate, type Learned, type LibraryPicture, type LibraryWanted } from './library-pick';
import { boardForRow, songBoards } from './boards';
import {
  dealTreatments,
  isTreatmentId,
  TREATMENT_IDS,
  treatmentTitle,
  treatmentVariants,
  type TreatmentId,
} from './treatment-deal';
import { presetAt, presetTitle, takeAt, type PresetId } from './edit-presets';


/** One of our approved photo with a Shaders Pro image effect baked on it (punch-plates/effects), as measured when it was baked. */
type PhotoEffect = { id: string; title: string; collection: string; mood: string; lightness: number; saturation: number; warmth: number; palette: { hex: string; share: number }[] };
const PHOTO_EFFECTS = effectsData as PhotoEffect[];

/** Every row of the shelf. */
export type ShelfRow = 'photography' | LookFamily | TreatmentId | 'riso' | 'window' | 'silhouette' | 'pulise' | 'dust';

/**
 * The shelf is rows of four. A row is a kind of creative, and it owns its controls so that changing one row
 * never redraws (or re-renders) another:
 *   lyrics  'switch': the row has its own Lyrics on/off. 'always': made of the lyrics, so there is no switch.
 *   picture the row draws a picture, ours until the person uploads their own (the shelf has one upload for all of them).
 *           'photo': only a photo will do (Dust stands the person's cut-out in front), so a video leaves the row off the shelf.
 *           'any': a photo, video or GIF.
 * The shelf shows one creative of each row. Every row has its own Refresh, and "More" deals the rest of its four.
 */
export type ShelfRowDef = { id: ShelfRow; title: string; lyrics: 'switch' | 'always'; picture?: 'photo' | 'any' };
export const SHELF_ROWS: readonly ShelfRowDef[] = [
  { id: 'photography', title: 'Directed', lyrics: 'switch', picture: 'any' },
  // Video treatments: each finishes the Directed reel with one creative pass (gaps, lens, collage, grain…).
  ...TREATMENT_IDS.map(id => ({ id, title: treatmentTitle(id), lyrics: 'switch' as const, picture: 'any' as const })),
  // One effect per row, each dealt in its different colourings, on pictures of our library or the person's own (a row has no picture to draw until the library has one or they upload theirs).
  { id: 'thermal', title: 'Thermal', lyrics: 'switch', picture: 'any' },
  { id: 'halftone', title: 'Halftone', lyrics: 'switch', picture: 'any' },
  { id: 'dither', title: 'Dither', lyrics: 'switch', picture: 'any' },
  { id: 'ascii', title: 'ASCII', lyrics: 'switch', picture: 'any' },
  { id: 'riso', title: 'Riso', lyrics: 'switch', picture: 'any' },
  { id: 'window', title: 'Window', lyrics: 'always', picture: 'any' },
  // The song's video inside the still figure of a person, on red, black or white; never for gospel.
  { id: 'silhouette', title: 'Silhouette', lyrics: 'switch', picture: 'any' },
  { id: 'pulise', title: 'Pulise', lyrics: 'always' },
  { id: 'dust', title: 'Dust', lyrics: 'switch', picture: 'photo' },
];
/** What the person's own picture is: a photo (with its cut-out), or a video or GIF. */
export type OwnKind = 'photo' | 'motion';
/**
 * The rows of the shelf for a song and the person's own picture. With no words, only the rows that work without them
 * (Window and Pulise are made of the lyrics). With any picture of their own, only the rows that draw a picture
 * (Pulise takes none, so it leaves). With a video or GIF, only the rows that can use one (Dust needs a photo).
 */
export const rowsFor = (noLyrics: boolean, own: OwnKind | null = null): readonly ShelfRowDef[] =>
  SHELF_ROWS.filter(def => !(noLyrics && def.lyrics === 'always') && !(own && !def.picture) && !(own === 'motion' && def.picture === 'photo'));
const ROW_SIZE = 4;

export type CreativesPackSlot = {
  id: string;
  family: 'ad_punch';
  row: ShelfRow;
  label: string;
  reason: string;
  style: AdPunchStyle;
  font: AdFont;
  fontSecondary: AdFont;
  layout: AdLayout;
  /** Dust: the two colours of this card. */
  colors?: DustColors;
  /** Dust, Riso and Window: the approved photo this card is drawn from, until the person uses their own. */
  plateId?: string;
  /** Riso: the ink set of this card (`RISO_INK_SETS` id). */
  inkSet?: string;
  /** Window: the kind of picture seen through the word, the screen colour the card opens on, and the colours its screen may flip to (all of which read against the picture). */
  windowMode?: WindowMode;
  windowPalette?: string;
  windowAllowed?: string[];
  /** Silhouette: the figure the picture is seen through (`SILHOUETTES` id). */
  windowShape?: string;
  /** Our photography and Window: which arrangement of the person's video or GIF this card plays (its cut speed follows the card's place). */
  cutSeed?: number;
  /** Our photography: the approved library picture (a photo, video or GIF) this card is drawn from, until the person uses their own. */
  libraryId?: string;
  /** The Director's reel (`pack-director.ts`): library pictures, clips and GIFs this card is edited from, to the song's energy, in the order this card opens on them. Replaces `libraryId`, `plateId` and `effectId`. */
  reelIds?: string[];
  /** Our photography: the baked effect on our approved photo (`punch-plates/effects/{id}.jpg`), until the person uses their own picture. */
  effectId?: string;
  /** Our photography: a live look drawn on the picture (ours from the library, or the person's own), never on a baked effect. */
  look?: LiveLookId;
  /** A video treatment over the Director's finished reel (`treatment-deal.ts`). */
  treatment?: TreatmentId;
  treatmentVariant?: string;
  /** The edit preset over Directed and its treatments (`edit-presets.ts`), from the song's genre, and this card's take of it. */
  preset?: PresetId;
  presetTake?: string;
  typeStyle?: TypeStyleId;
  /** What the lyrics do to the colours and the beat. Absent when the words change nothing. */
  grade?: MoodGrade;
  /** The mood board (`boards.ts`) the row's library pictures were dealt from. Absent while the song has no filled board. */
  board?: string;
  /** How well the library picture it opens on carries the colours the song's genre calls for (`colourFit`, 0…1), for Learning. */
  colourFit?: number;
};

function hashPick(seed: string, salt: string, modulo: number) {
  let h = 2166136261;
  const text = `${seed}:${salt}`;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h) % Math.max(1, modulo);
}

export type { MoodLane };

const GOSPEL_GENRE = /gospel|worship|christian|hymn|spiritual|choir/;
const CLUB_GENRE = /techno|house|edm|dubstep|riddim|electronic/;
/** Dembow and afrobeats move a crowd at drives too low for fast cutting. */
const DANCEABLE = 0.5;

export function moodLane(intent: MusicIntentV1 | null, genre: string): MoodLane {
  const g = genre.toLowerCase();
  if (GOSPEL_GENRE.test(g)) return 'gospel';
  // Club / dance genres lock techno lane even if DSP vibe misfires
  if (CLUB_GENRE.test(g)) {
    return 'techno';
  }
  if (!intent) return 'general';
  if (intent.vibe === 'Ambient/Mellow') return 'quiet';
  if (intent.vibe === 'Dark/Cinematic') return 'dark';
  if (intent.vibe === 'Uplifting/Energetic') return intent.cutRate === 'high' || intent.drive >= DANCEABLE ? 'party' : 'general';
  if (intent.vibe === 'Aggressive/Industrial') return intent.cutRate === 'high' ? 'party' : 'general';
  return 'general';
}

/**
 * Typography is a mood decision. "match" policy: the style always agrees with what the song feels like.
 * Order is a preference, the seed rotates which style leads.
 */
export const TYPE_ALLOW: Record<MoodLane, readonly TypeStyleId[]> = {
  gospel: ['editorial', 'minimal', 'typewriter', 'karaoke', 'slide', 'wipe', 'wave'],
  quiet: ['minimal', 'editorial', 'typewriter', 'karaoke', 'slide', 'wipe', 'wave', 'jitter'],
  dark: ['typewriter', 'outline', 'minimal', 'editorial', 'glitch', 'flicker', 'wipe', 'split', 'scatter', 'zoom'],
  techno: ['stack', 'outline', 'karaoke', 'typewriter', 'glitch', 'stretch', 'split', 'zoom', 'flicker', 'scatter', 'echo', 'bounce'],
  party: ['stack', 'karaoke', 'outline', 'typewriter', 'bounce', 'stretch', 'rotate', 'zoom', 'echo', 'wave', 'tilt', 'scatter', 'jitter', 'slide'],
  general: TYPE_STYLES,
};

/** Dust, Pulise and Riso draw capitals from thick strokes, so their faces must be heavy and set in caps. */
const HEAVY_CAPS_ROW: readonly (readonly FontNeed[])[] = Array.from({ length: ROW_SIZE }, () => ['heavy', 'caps']);

type Faces = { font: AdFont; fontSecondary: AdFont };

/** The faces of one row of cards: none shared, each able to do what its card's type asks (`needs[i]` for card i). */
function dealFaces(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, row: ShelfRow, needs: readonly (readonly FontNeed[])[]): Faces[] {
  return dealFonts(lane, intent?.vibe ?? null, seed, row, needs).map((font, index) => ({
    font,
    fontSecondary: pickSecondaryFont(font, seed, `${row}:${index}`, fontsForLane(lane, needs[index])),
  }));
}

function seededOrder<T>(items: readonly T[], seed: string, key: (item: T) => string): T[] {
  return [...items].sort((a, b) => hashPick(seed, key(a), 99991) - hashPick(seed, key(b), 99991));
}

function adPunchSlot(
  style: AdPunchStyle,
  index: number,
  intent: MusicIntentV1 | null,
  seed: string,
  lane: MoodLane,
  row: ShelfRow,
  faces: Faces,
): CreativesPackSlot {
  const salt = `${style}:${index}`;
  const { font } = faces;
  return {
    id: `ad-${style}-${index}-${hashPick(seed, 'gen', 997).toString(36)}-${hashPick(seed, salt, 0xffff).toString(16)}`,
    family: 'ad_punch',
    row,
    label: STYLE_NAMES[style],
    reason: intent ? `${lane} · ${intent.vibe} · ${font} · ${STYLE_NAMES[style]}` : `${lane} · ${font} · ${STYLE_NAMES[style]}`,
    style,
    ...faces,
    layout: pickLayoutSeed(seed, salt),
  };
}

/**
 * What the brain understood about this song: how it sounds (intent), what the creator said it is (genre),
 * and what it says (the meaning of its lyrics). The recommendation and the feedback log both use this,
 * so what we learn from is exactly what we decided on.
 */
export function readSong(profile: CreativeProfileV1) {
  const analysis = profile.musicAnalysis.status === 'ready' ? profile.musicAnalysis.result : null;
  const intent = analysis ? deriveMusicIntent(analysis) : null;
  const genre = profile.creator.primaryGenre.value || '';
  const language = profile.approvedLyrics?.language;
  const meaning = profile.lyricMeaning?.status === 'ready' ? profile.lyricMeaning.meaning : null;
  // The sub-genre is the specific one ("Ambient / Downtempo" is not club music although its genre is Electronic & Dance).
  const specific = profile.creator.subGenre?.value ?? genre;
  const genreLocked = GOSPEL_GENRE.test(specific.toLowerCase()) || CLUB_GENRE.test(specific.toLowerCase());
  const lane = laneFromMeaning(moodLane(intent, specific), genreLocked, meaning);
  return { intent, genre, language, meaning, lane };
}

/** The attitude a song's sound carries, for when its words carry none: driving and bright is fun, harsh is confident, slow or brooding is thoughtful. */
const SOUND_ATTITUDE: Readonly<Record<IntentVibe, LyricAttitude>> = {
  'Uplifting/Energetic': 'fun',
  'Aggressive/Industrial': 'confident',
  'Dark/Cinematic': 'thoughtful',
  'Ambient/Mellow': 'thoughtful',
};

/** What the library is asked for this song: its moods, genre and what the words are about. Words with no feeling (none, or too few) let the music say it. */
function libraryWanted(profile: CreativeProfileV1, meaning: LyricMeaning | null, genre: string, intent: MusicIntentV1 | null): LibraryWanted {
  const heard = (!meaning || meaning.attitude === 'neutral') && intent ? SOUND_ATTITUDE[intent.vibe] : null;
  return {
    attitude: heard ?? meaning?.attitude ?? null,
    genre,
    subGenre: profile.creator.subGenre?.value ?? '',
    ...(profile.creator.style && { style: profile.creator.style.name }),
    ...(meaning?.moods?.length ? { moods: meaning.moods } : {}),
    ...(meaning?.themes?.length ? { themes: meaning.themes } : {}),
    ...(heard && !meaning?.themes?.length ? { fromSound: true as const } : {}),
    ...withColours(genre, profile.creator.subGenre?.value ?? ''),
  };
}

const withColours = (genre: string, subGenre: string) => {
  const colours = coloursFor(genre, subGenre);
  return colours ? { colours } : {};
};

/** An approved photo; `cutout` says it also has the mask Dust needs. */
export type PlateRef = { id: string; cutout: boolean };

/** Riso and Window are drawn in the inks and screen colours they were dealt: a mood grade over them would recolour the design. */
const UNGRADED: readonly ShelfRow[] = ['riso', 'window', 'silhouette'];

/** Riso: a cut-out photo (person print) or a video/GIF (whole-frame print). Dust stays cut-out photos only. */
const risoCapable = (item: LibraryPicture) => (item.kind === 'photo' ? Boolean(item.cutoutUrl) : Boolean(item.motionUrl));

/** The library pictures a row of single pictures is dealt for this song and Refresh, best fitting first. */
export function libraryHand(profile: CreativeProfileV1, generation: number, library: readonly LibraryPicture[]): LibraryPicture[] {
  const { intent, meaning, genre } = readSong(profile);
  const wanted = libraryWanted(profile, meaning, genre, intent);
  return pickLibrary(rowLibrary('photography', profile, wanted, library).from(), wanted, profile.clip.sourceSha256, generation, ROW_SIZE);
}

/** A board stands in for the whole library only when it has at least this many pictures a row can draw: a reel needs two. */
const BOARD_ENOUGH = 2;

/**
 * Where one row's library pictures come from: the mood board the brain chose for this row (`boardForRow`), or the whole library
 * while the song has no filled board. `from(capable)` gives the pictures the row can draw; when its board has too few of them
 * (Dust wants cut-out photos) the next board that fits the song stands in, and the whole library only when none has them.
 */
function rowLibrary(row: ShelfRow, profile: CreativeProfileV1, wanted: LibraryWanted, library: readonly LibraryPicture[]) {
  const board = boardForRow(row, wanted, library, profile.clip.sourceSha256);
  const others = board ? songBoards(wanted, library, profile.clip.sourceSha256).filter(other => other.id !== board.id) : [];
  const from = (capable: (item: LibraryPicture) => boolean = () => true) => {
    const all = library.filter(capable);
    for (const choice of board ? [board, ...others] : []) {
      const onBoard = all.filter(item => item.boards?.includes(choice.id));
      if (onBoard.length >= BOARD_ENOUGH) return onBoard;
    }
    return all;
  };
  return { board, from };
}

/** How many library pictures a Director's reel is edited from, and how many of them are clips when the library has that many (video sells). */
export const REEL_POOL = 8;
const REEL_CLIPS = 3;
/** A picture brings something new to a reel only while it fits the song at least this share as well as the best one: variety never pulls in a weak fit. */
const REEL_CLOSE = 0.6;
/**
 * A reel is drawn from the close fits when there are at least `REEL_ENOUGH`, else from the good fits (at least `REEL_GOOD` as well as the
 * best).
 */
const REEL_ENOUGH = 16;
const REEL_GOOD = 0.35;
const isClip = (item: LibraryPicture) => item.kind !== 'photo' && Boolean(item.motionUrl);

/** One thing an item shows, the same in the singular and the plural ("car" and "cars"). */
const thingKey = (thing: string) => thing.replace(/s$/, '');

/**
 * `count` of the `ranked` pictures (best fit first) that show different things: each next one is the best that brings a tag, or a look
 * the vision model sees clearly, the reel does not have yet (a car, then the girls, then the club), so a reel is not eight cars.
 * With none left that do, the best of the rest.
 */
export function mixed(ranked: readonly LibraryPicture[], count: number): LibraryPicture[] {
  const picked: LibraryPicture[] = [];
  const seen = new Set<string>();
  const rest = [...ranked];
  while (picked.length < count && rest.length) {
    const fresh = rest.findIndex(item => showing(item).some(thing => !seen.has(thingKey(thing))));
    const [next] = rest.splice(Math.max(0, fresh), 1);
    picked.push(next);
    for (const thing of showing(next)) seen.add(thingKey(thing));
  }
  return picked;
}

/** The fewest pictures a reel from a mood board is edited from, however small the board. */
const BOARD_REEL_MIN = 4;

/**
 * A reel from a mood board chosen for the song: every picture on it fits, so the board is walked in one seeded order of the song, each
 * card taking the next pictures and each Refresh going on where the last stopped. Nothing repeats until the whole board has been used,
 * and a reel is shorter (down to `BOARD_REEL_MIN`) when that lets one Refresh share no picture with the one before it.
 */
function boardReel(items: readonly LibraryPicture[], song: string, generation: number, card: number): LibraryPicture[] {
  const order = seededOrder(items, `${song}:board-reel`, item => item.id);
  if (order.length <= BOARD_REEL_MIN) return order;
  const size = Math.max(BOARD_REEL_MIN, Math.min(REEL_POOL, Math.floor(order.length / (2 * ROW_SIZE))));
  const at = (step: number) => order[step % order.length];
  const start = (generation * ROW_SIZE + card) * size;
  const pool = Array.from({ length: Math.min(size, order.length) }, (_, step) => at(start + step));
  // Too few clips: the clips furthest from this Refresh's own take the places of the last stills.
  const later = Array.from({ length: order.length }, (_, step) => at((generation + 1) * ROW_SIZE * size + step)).filter(isClip);
  let clips = pool.filter(isClip).length;
  for (const clip of later) {
    if (clips >= REEL_CLIPS) break;
    if (pool.includes(clip)) continue;
    const still = pool.map(isClip).lastIndexOf(false);
    if (still < 0) break;
    pool[still] = clip;
    clips += 1;
  }
  return pool;
}

/**
 * The pictures a reel is edited from. From a mood board chosen for the song (`board`), the board is walked (`boardReel`). From the
 * whole library: fits for the song that show different things (so a library of many look-alike car clips still gives the girls and
 * the club their turn), with up to three clips among them when the library has them (video sells; a reel of stills does not, and two
 * pictures rotating look like a loop), from enough fits (`REEL_ENOUGH`). Each card of a row (`card`) and each Refresh takes the next
 * eight of a seeded order of them.
 */
export function reelPool(items: readonly LibraryPicture[], wanted: LibraryWanted, song: string, generation: number, card = 0, board = false): LibraryPicture[] {
  if (board) return boardReel(items, song, generation, card);
  const ranked = pickLibrary(items, wanted, song, 0, items.length);
  const fits = new Map(ranked.map(item => [item.id, libraryFit(item, wanted) ?? 0]));
  const best = Math.max(0, ...fits.values());
  // When nothing shows what the song wants, every picture fits as well as the best: Refresh walks the whole library.
  const close = ranked.filter(item => (fits.get(item.id) ?? 0) >= REEL_CLOSE * best);
  const good = close.length >= REEL_ENOUGH ? close : ranked.filter(item => (fits.get(item.id) ?? 0) >= REEL_GOOD * best);
  const turn = (generation * ROW_SIZE + card) * REEL_POOL;
  const walk = good.length ? Math.floor(turn / good.length) : 0;
  const order = seededOrder(good, `${song}:reel:${walk}`, item => item.id);
  const start = order.length ? turn % order.length : 0;
  // Variety is looked for among the next few only: across the whole board the same few tagged pictures would win every time.
  const mix = mixed([...order.slice(start), ...order.slice(0, start)].slice(0, REEL_ENOUGH * 2), REEL_POOL);
  const pool = [...mix, ...ranked.filter(item => !mix.includes(item))].slice(0, REEL_POOL);
  if (pool.length < 2) return pool;
  // Not enough clips among the fits: clips from further along the same order take the places of the last stills.
  const edited = [...pool];
  let clips = edited.filter(isClip).length;
  for (const clip of [...order.slice(start), ...order.slice(0, start), ...ranked].filter(isClip)) {
    if (clips >= REEL_CLIPS) break;
    if (edited.some(item => item.id === clip.id)) continue;
    const still = edited.map(isClip).lastIndexOf(false);
    if (still < 0) break;
    edited[still] = clip;
    clips += 1;
  }
  return edited;
}

/** A card that is edited from the pool instead of drawn from one picture. Each card of a row opens on a different picture. With fewer than two pictures it stays as it was. */
export function reeled(slot: CreativesPackSlot, pool: readonly LibraryPicture[], index: number): CreativesPackSlot {
  if (pool.length < 2) return slot;
  const start = index % pool.length;
  const reelIds = [...pool.slice(start), ...pool.slice(0, start)].map(item => item.id);
  const directed: CreativesPackSlot = { ...slot, id: `${slot.id}-reel`, reason: `${slot.reason} · directed`, reelIds };
  delete directed.libraryId;
  delete directed.plateId;
  delete directed.effectId;
  return directed;
}

/**
 * One row of the shelf for this song. `generation` is that row's own Refresh count. `plates` are the approved
 * photos Dust and Riso are drawn from (the person's own picture, if any, replaces them in the app); `ownPicture` says
 * the person's one picture is drawn on every card instead of our library.
 */
export function recommendRow(row: ShelfRow, profile: CreativeProfileV1, generation: number, plates: readonly PlateRef[] = [], pool: readonly LibraryPicture[] = [], ownPicture = false,
  learning: ShelfLearning = {}): CreativesPackSlot[] {
  const { intent, meaning, lane, genre } = readSong(profile);
  // What people did with each picture, for songs in this lane first (`inLane`).
  const library = pool.some(item => item.learnedLanes) ? pool.map(item => ({ ...item, learned: inLane(item.learned, item.learnedLanes?.[lane]) })) : pool;
  const cover = profile.creator.cover?.value ?? null;
  const seed = `${profile.clip.sourceSha256}:${generation}:${lane}:${row}`;
  const cutOutPlates = plates.filter(plate => plate.cutout).map(plate => plate.id);
  // Dust draws library photos that have a cut-out; Riso those, or library videos/GIFs; with none, our approved photos.
  const wanted = libraryWanted(profile, meaning, genre, intent);
  // Every template but Pulise and Dust shows the Directed card's video in its place: the same board, pictures and reel.
  const directedRow = row === 'photography' || isTreatmentId(row) || isLookRow(row) || row === 'riso' || row === 'window' || row === 'silhouette';
  const directedSeed = `${profile.clip.sourceSha256}:${generation}:${lane}:photography`;
  const { board, from } = rowLibrary(directedRow ? 'photography' : row, profile, wanted, library);
  const cutOut = (item: LibraryPicture) => item.kind === 'photo' && Boolean(item.cutoutUrl);
  const cutOutLibrary = pickLibrary(from(cutOut), wanted, profile.clip.sourceSha256, 0, 50).map(item => item.id);
  const risoLibrary = pickLibrary(from(risoCapable), wanted, profile.clip.sourceSha256, 0, 50).map(item => item.id);
  const photos: PhotoSources = { plateIds: cutOutPlates, libraryIds: cutOutLibrary };
  const risoPhotos: PhotoSources = { plateIds: cutOutPlates, libraryIds: risoLibrary };
  /** A row of one effect: library pictures that fit the song, or the person's own picture (lookSlots). */
  const effectRow = (family: LookFamily) => lookSlots(family, lane, intent, seed, pickLibrary(from(), wanted, `${profile.clip.sourceSha256}:${family}`, generation, ROW_SIZE), ownPicture);
  // Directed and its treatments are cut and finished in the preset the song's genre calls for; each Refresh may take the next that fits.
  const preset = presetAt({ genre, subGenre: profile.creator.subGenre?.value, style: profile.creator.style?.name }, generation);
  const withPreset = (slots: CreativesPackSlot[]) => slots.map((slot, index) => ({
    ...slot,
    label: [presetTitle(preset), slot.label].join(' · '),
    reason: `${slot.reason} · ${preset}`,
    preset,
    presetTake: takeAt(preset, generation, index),
  }));
  const treatmentRow = (kind: TreatmentId) => withPreset(treatmentSlots(kind, lane, intent, seed, directedSeed, pickLibrary(from(), wanted, profile.clip.sourceSha256, generation, ROW_SIZE), ownPicture));
  const slots = {
    photography: () => {
      const cards = photographySlots(
        lane, intent, seed,
        dealEffects(lane, meaning, cover, `${profile.clip.sourceSha256}:${lane}`, generation),
        pickLibrary(from(), wanted, profile.clip.sourceSha256, generation, ROW_SIZE),
      );
      // A baked effect is already a finished look: only cards of our library's pictures are cut in the preset.
      return cards.some(card => card.effectId) ? cards : withPreset(cards);
    },
    triptych: () => treatmentRow('triptych'),
    fisheye: () => treatmentRow('fisheye'),
    collage: () => treatmentRow('collage'),
    frame: () => treatmentRow('frame'),
    bento: () => treatmentRow('bento'),
    grain: () => treatmentRow('grain'),
    double: () => treatmentRow('double'),
    thermal: () => effectRow('thermal'),
    halftone: () => effectRow('halftone'),
    dither: () => effectRow('dither'),
    ascii: () => effectRow('ascii'),
    riso: () => risoSlots(lane, intent, seed, risoPhotos),
    window: () => windowSlots(lane, intent, seed, ownPicture ? [] : pickLibrary(from(), wanted, profile.clip.sourceSha256, generation, ROW_SIZE), ownPicture ? [] : plates),
    silhouette: () => (GOSPEL_GENRE.test(`${genre} ${profile.creator.subGenre?.value ?? ''}`.toLowerCase()) ? [] : windowSlots(lane, intent, seed, ownPicture ? [] : pickLibrary(from(), wanted, profile.clip.sourceSha256, generation, ROW_SIZE), ownPicture ? [] : plates, dealSilhouette(seed, TYPE_ALLOW[lane]))),
    pulise: () => puliseSlots(lane, intent, seed),
    dust: () => dustSlots(lane, intent, seed, cover?.hue, photos),
  }[row]();
  // Card i of every such template is edited by the Director from the same pool as Directed's card i, once there are two or more pictures to edit.
  const onBoard = (items: readonly LibraryPicture[]) => Boolean(board) && (items[0]?.boards ?? []).some(id => items.every(item => item.boards?.includes(id)));
  const pictures = from();
  const poolOf = directedRow && !ownPicture ? (card: number) => reelPool(pictures, wanted, profile.clip.sourceSha256, generation, card, onBoard(pictures)) : () => [];
  // Each card is edited from its own pictures, and opens on one no card before it opened on.
  const opened = new Set<string>();
  const edited = slots.map((slot, index) => {
    const pool = poolOf(index);
    if (pool.length < 2) return slot;
    const turn = Array.from({ length: pool.length }, (_, step) => index + step).find(at => !opened.has(pool[at % pool.length].id)) ?? index;
    opened.add(pool[turn % pool.length].id);
    return reeled(slot, pool, turn);
  });
  // A card tells its board only when it really draws a library picture from it.
  const filed = (slot: CreativesPackSlot) => board && [slot.libraryId, ...(slot.reelIds ?? [])].some(id => id && library.find(item => item.id === id)?.boards?.includes(board.id));
  const boarded = board ? edited.map(slot => (filed(slot) ? { ...slot, board: board.id } : slot)) : edited;
  // The brain keeps how well the picture a card opens on carries the genre's colours, so Learning can tell whether that is worth it.
  const colourOf = (slot: CreativesPackSlot) => {
    const lead = library.find(item => item.id === (slot.reelIds?.[0] ?? slot.libraryId));
    return lead?.colours && wanted.colours ? Math.round(colourFit(lead.colours, wanted.colours) * 100) / 100 : undefined;
  };
  const coloured = boarded.map(slot => {
    const fit = colourOf(slot);
    return fit === undefined ? slot : { ...slot, colourFit: fit };
  });
  const grade = moodGrade(meaning);
  const graded = grade && !UNGRADED.includes(row) ? coloured.map(slot => ({ ...slot, grade })) : coloured;
  return learnedLead(graded, cardsInLane(learning, lane, row), seed);
}

/** What people did with each kind of card of `row`, for songs in `lane` first. */
function cardsInLane(learning: ShelfLearning, lane: string, row: ShelfRow): Readonly<Record<string, Learned>> | undefined {
  const all = learning.cards?.[row];
  const own = learning.lanes?.[lane]?.cards?.[row];
  if (!all && !own) return undefined;
  const kinds = new Set([...Object.keys(all ?? {}), ...Object.keys(own ?? {})]);
  return Object.fromEntries([...kinds].flatMap(kind => {
    const counts = inLane(all?.[kind], own?.[kind]);
    return counts ? [[kind, counts]] : [];
  }));
}

/**
 * The kind of card a slot is, within its row, as Admin → Learning and the lead nudge know it: a treatment's variant, a Window
 * palette (with the Silhouette's figure), a Riso ink set or a live look. Undefined for a row whose cards are only their pictures.
 */
export function cardKind(slot: CreativesPackSlot): string | undefined {
  if (slot.treatmentVariant) return slot.treatmentVariant;
  if (slot.windowPalette) return slot.windowShape ? `${slot.windowShape}/${slot.windowPalette}` : slot.windowPalette;
  return slot.inkSet ?? slot.look;
}

/** What people did lately with each kind of card of each row. */
export type LearnedCards = Partial<Record<ShelfRow, Readonly<Record<string, Learned>>>>;
/** What people did lately with each row (template) as a whole. */
export type LearnedRows = Partial<Record<ShelfRow, Learned>>;
/** What the shelf learns from (`learnedShelf` on the server, with `/api/library`): overall, and again for each lane the brain chose for the song. */
export type ShelfLearning = { cards?: LearnedCards; rows?: LearnedRows; lanes?: Readonly<Record<string, { cards?: LearnedCards; rows?: LearnedRows }>> };

/** One place down the shelf weighs this much against what people downloaded (a nudge is at most 0.3): a template moves a few places at most. */
const SHELF_STEP = 0.1;

/**
 * The templates in the order the shelf shows them for this song: the brain's order (`SHELF_ROWS`), nudged by how often each template's
 * cards were kept and downloaded in songs of this lane (`learnedNudge`, seeded per song, so a template with little history still gets
 * turns near the top). The same song always gets the same order, so the shelf never reorders under the person.
 */
export function shelfOrder<Row extends { id: ShelfRow }>(rows: readonly Row[], learning: ShelfLearning, profile: CreativeProfileV1): Row[] {
  const { lane } = readSong(profile);
  const learned = rows.map(row => inLane(learning.rows?.[row.id], learning.lanes?.[lane]?.rows?.[row.id]));
  if (rows.length < 2 || !learned.some(Boolean)) return [...rows];
  const usual = usualRate(learned.map(counts => ({ learned: counts })));
  const score = rows.map((row, index) => learnedNudge(learned[index], usual, `${profile.clip.sourceSha256}:shelf:${row.id}`) - index * SHELF_STEP);
  return rows.map((row, index) => ({ row, index })).sort((a, b) => score[b.index] - score[a.index] || a.index - b.index).map(entry => entry.row);
}

/** One place down the brain's order weighs this much against what people downloaded (a nudge is at most 0.3). */
const PLACE_STEP = 0.15;

/**
 * The shelf shows a row's first card, so learning chooses which card leads: the brain's order, nudged by how often each kind of
 * card was kept and downloaded (`learnedNudge`, seeded per hand, so a kind with little history still gets to lead). The others
 * keep their order. Nothing moves until the row has some history and every card has a kind.
 */
export function learnedLead(slots: CreativesPackSlot[], learned: Readonly<Record<string, Learned>> | undefined, draw: string): CreativesPackSlot[] {
  if (!learned || slots.length < 2) return slots;
  const kinds = slots.map(cardKind);
  if (kinds.some(kind => kind === undefined)) return slots;
  const usual = usualRate(Object.values(learned).map(counts => ({ learned: counts })));
  const scores = kinds.map((kind, index) => learnedNudge(learned[kind!], usual, `${draw}:${kind}`) - index * PLACE_STEP);
  const lead = scores.indexOf(Math.max(...scores));
  return lead === 0 ? slots : [slots[lead], ...slots.filter((_, index) => index !== lead)];
}

/** Colours for card `index` of a Dust row; when the cover has a colour, the first two cards grow from it. */
function cardColors(seed: string, index: number, coverHue: number | null | undefined) {
  return dustColors(hashPick(seed, `colors:${index}`, 1_000_000), coverHue != null && index < 2 ? coverHue : undefined);
}

/** Where Riso and Dust get their photo: library photos that have a cut-out, else our approved photos. */
type PhotoSources = { plateIds: readonly string[]; libraryIds: readonly string[] };

/** With more photos the seed deals a different one to each card; with none the card waits for the person's own. Library photos come first. */
function dealt({ plateIds, libraryIds }: PhotoSources, seed: string, index: number): { plateId?: string; libraryId?: string } {
  if (libraryIds.length) return { libraryId: seededOrder(libraryIds, seed, id => id)[index % libraryIds.length] };
  if (!plateIds.length) return {};
  return { plateId: seededOrder(plateIds, seed, id => id)[index % plateIds.length] };
}

function dustSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, coverHue: number | null | undefined, photos: PhotoSources): CreativesPackSlot[] {
  const faces = dealFaces(lane, intent, seed, 'dust', HEAVY_CAPS_ROW);
  return faces.map((face, index) => ({
    ...adPunchSlot('dust', index, intent, seed, lane, 'dust', face),
    colors: cardColors(seed, index, coverHue),
    ...dealt(photos, seed, index),
  }));
}

const sentence = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;

/**
 * Four Riso cards: each its own ink set (a seeded draw, so every Refresh deals them in a new order), its own heavy
 * capital face and its own scatter of the words. Library cut-out photos or clips (or our approved photos) until the
 * person uses their own. `cutSeed` makes each card cut a video differently on the beat.
 */
function risoSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, photos: PhotoSources): CreativesPackSlot[] {
  const faces = dealFaces(lane, intent, seed, 'riso', HEAVY_CAPS_ROW);
  const sets = seededOrder(RISO_INK_SETS, seed, set => set.id);
  return faces.map((face, index) => ({
    ...adPunchSlot('riso', index, intent, seed, lane, 'riso', face),
    label: sentence(sets[index].name),
    inkSet: sets[index].id,
    cutSeed: hashPick(seed, 'cut', 250_000) * 4 + index,
    ...dealt(photos, seed, index),
  }));
}

/** Four Window cards: the song's video through the word, on black or white, each in its own condensed face (see window-deal.ts); or, given Silhouette's `cards`, through a figure. */
function windowSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, picks: readonly LibraryPicture[], plates: readonly PlateRef[], cards: readonly WindowCard[] = dealWindow(seed)): CreativesPackSlot[] {
  // With no library picture, our approved photos stand in.
  const photos = seededOrder(plates, `${seed}:plates`, plate => plate.id);
  const row: ShelfRow = cards[0]?.mode === 'silhouette' ? 'silhouette' : 'window';
  return cards.map((card, index) => {
    const pick = picks.length ? picks[index % picks.length] : null;
    const plate = !pick && photos.length ? photos[index % photos.length] : null;
    return {
      // Window sets one face of type: the second is the same, so nothing else is asked of the worker.
      ...adPunchSlot('window', index, intent, seed, lane, row, { font: card.font, fontSecondary: card.font }),
      label: sentence([card.shape?.replace('-', ' '), card.palette.replace('-', ' ')].filter(Boolean).join(' · ')),
      reason: `${lane} · ${card.shape ? `${card.shape} · ` : ''}${card.palette} · ${card.font}`,
      windowMode: card.mode,
      windowPalette: card.palette,
      windowAllowed: card.allowed,
      ...(card.shape ? { windowShape: card.shape } : {}),
      ...(card.type ? { typeStyle: card.type } : {}),
      ...(pick ? { libraryId: pick.id } : {}),
      ...(plate ? { plateId: plate.id } : {}),
      cutSeed: hashPick(seed, 'cut', 250_000) * 4 + index,
    };
  });
}

/**
 * The moods of baked effect each lane welcomes first. Calm music is not first dealt the harsh looks (glitch, techno,
 * retro, graphic, bold); club music is. A lane with no entry welcomes every look.
 */
const EFFECT_MOODS: Partial<Record<MoodLane, readonly string[]>> = {
  gospel: ['soft', 'dreamy', 'warm', 'bright', 'editorial', 'fresh', 'playful'],
  quiet: ['soft', 'dreamy', 'moody', 'cool', 'editorial', 'warm'],
  dark: ['moody', 'graphic', 'techno', 'cool', 'editorial', 'bold'],
  techno: ['techno', 'glitchy', 'graphic', 'bold', 'retro', 'cool'],
  party: ['bold', 'playful', 'fresh', 'retro', 'warm', 'bright', 'glitchy'],
};

/**
 * Every baked effect, best first for this song: the ones the lane welcomes, then the ones closest to the cover's colours,
 * with the song's seed shuffling the rest. Sad or angry words never sit on a bright picture (the same "match" policy as the backgrounds).
 */
function rankEffects(lane: MoodLane, meaning: LyricMeaning | null, cover: CoverRead | null, song: string): PhotoEffect[] {
  const welcome = EFFECT_MOODS[lane];
  const pool = leansDeep(meaning) ? PHOTO_EFFECTS.filter(effect => effect.lightness < 0.6) : PHOTO_EFFECTS;
  const score = (effect: PhotoEffect) => (!welcome || welcome.includes(effect.mood) ? 1 : 0)
    + (cover ? coverFit(cover, effect) : 0)
    + 0.3 * hashPick(song, effect.id, 1000) / 1000;
  return [...pool].sort((a, b) => score(b) - score(a));
}

/**
 * The ranked effects cut into hands of four, none with two from the same collection, so each Refresh deals four looks
 * that no earlier hand had. The last hands are topped up from the best, so every hand still has four.
 */
function effectHands(ranked: readonly PhotoEffect[]): PhotoEffect[][] {
  const left = [...ranked];
  const hands: PhotoEffect[][] = [];
  while (left.length) {
    const hand: PhotoEffect[] = [];
    const draw = (from: readonly PhotoEffect[]) => {
      for (const effect of from) {
        if (hand.length === ROW_SIZE) return;
        if (!hand.some(held => held.collection === effect.collection)) hand.push(effect);
      }
    };
    draw(left);
    for (const effect of hand) left.splice(left.indexOf(effect), 1);
    draw(ranked);
    hands.push(hand);
  }
  return hands;
}

/** The four effects of one generation of Our photography. After the last hand the deal starts again. */
function dealEffects(lane: MoodLane, meaning: LyricMeaning | null, cover: CoverRead | null, song: string, generation: number): PhotoEffect[] {
  const hands = effectHands(rankEffects(lane, meaning, cover, song));
  return hands[generation % hands.length];
}

/**
 * Our photography: four cards, each with its own lyric type. A card is an approved library picture that fits the song
 * (as many as there are, up to four), or our approved photo with one of four baked effects (or the person's own picture). A card that carries a live look
 * is drawn from a single picture (a library photo, or our approved photo while the library is short) or one video played straight through, never an edit of cuts.
 */
function photographySlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, effects: readonly PhotoEffect[], picks: readonly LibraryPicture[]): CreativesPackSlot[] {
  const types = seededOrder(TYPE_ALLOW[lane].filter(id => TYPE_STYLES.includes(id)), `${seed}:filter`, id => id);
  const typeOf = (index: number) => types[index % types.length];
  // The library is the source. Baked effects (the older, fixed looks) are only for a song nothing in the library fits, so the row is never empty.
  const cards = picks.length
    ? picks.slice(0, ROW_SIZE).map(pick => ({ pick }))
    : effects.slice(0, ROW_SIZE).map(effect => ({ effect }));
  const faces = dealFaces(lane, intent, seed, 'photography', cards.map((_, index) => typeNeeds(typeOf(index))));
  const hand = hashPick(seed, 'gen', 997).toString(36);
  return cards.map((card, index) => ({
    ...adPunchSlot('filter', index, intent, seed, lane, 'photography', faces[index]),
    ...('pick' in card
      ? {
        id: `ad-photography-library-${card.pick.id}-${hand}`,
        label: card.pick.tags[0] ?? card.pick.attitudes[0] ?? 'Our library',
        reason: `${lane} · library · ${card.pick.attitudes.join('+')} · ${typeOf(index)}`,
        libraryId: card.pick.id,
      }
      : {
        id: `ad-photography-${card.effect.id}-${hand}`,
        label: card.effect.title,
        reason: `${lane} · ${card.effect.mood} · ${card.effect.title} · ${typeOf(index)}`,
        effectId: card.effect.id,
      }),
    typeStyle: typeOf(index),
    cutSeed: hashPick(seed, 'cut', 250_000) * 4 + index,
  }));
}

/**
 * One effect's row (Thermal, Halftone): up to four cards, each a library picture that fits the song, each in a different colouring of the effect
 * (`dealLooks`: never the same on neighbours, a new Refresh deals others), each with its own lyric type. With no library picture, or a lane the effect
 * has no colouring for, the row is empty (the page says so). The card is one picture, or one video played straight through, never an edit of cuts.
 * When the person has uploaded a picture of their own (`ownPicture`), the four cards are that picture in four colourings (the page draws it; no library picture is named).
 */
/** Whether a shelf row is one effect's row (Thermal, Halftone, ...): dealt in colourings of one live look, on library pictures or the person's own. */
export const isLookRow = (row: ShelfRow): row is LookFamily => isLookFamily(row);

/** Whether a shelf row is a video treatment over the Directed reel. */
export const isTreatmentRow = (row: ShelfRow): row is TreatmentId => isTreatmentId(row);

/**
 * Four cards of one treatment: card N is Directed card N (the same pictures, reel and cut, from `directedSeed`) finished with a
 * different variant, each with its own lyric type. With no library picture and no own picture the row is empty.
 */
function treatmentSlots(kind: TreatmentId, lane: MoodLane, intent: MusicIntentV1 | null, seed: string, directedSeed: string, picks: readonly LibraryPicture[], ownPicture: boolean): CreativesPackSlot[] {
  const cards: (LibraryPicture | null)[] = ownPicture ? Array.from({ length: ROW_SIZE }, () => null) : picks.slice(0, ROW_SIZE);
  const variants = dealTreatments(lane, seed, cards.length, kind);
  if (!cards.length || variants.length !== cards.length) return [];
  const types = seededOrder(TYPE_ALLOW[lane].filter(id => TYPE_STYLES.includes(id)), `${seed}:treatment`, id => id);
  const typeOf = (index: number) => types[index % types.length];
  const faces = dealFaces(lane, intent, seed, kind, cards.map((_, index) => typeNeeds(typeOf(index))));
  const hand = hashPick(seed, 'gen', 997).toString(36);
  const titles = treatmentVariants(kind);
  return cards.map((pick, index) => {
    const variant = variants[index];
    const label = titles.find(entry => entry.id === variant)?.title ?? variant;
    return {
      ...adPunchSlot('treatment', index, intent, seed, lane, kind, faces[index]),
      id: `ad-${kind}-${pick?.id ?? `own${index}`}-${variant}-${hand}`,
      label: pick ? [pick.tags[0] ?? pick.attitudes[0] ?? 'Our library', label].join(' · ') : label,
      reason: pick ? `${lane} · library · ${pick.attitudes.join('+')} · ${typeOf(index)} · ${kind}:${variant}` : `${lane} · own picture · ${typeOf(index)} · ${kind}:${variant}`,
      ...(pick ? { libraryId: pick.id } : {}),
      typeStyle: typeOf(index),
      treatment: kind,
      treatmentVariant: variant,
      cutSeed: hashPick(directedSeed, 'cut', 250_000) * 4 + index,
    };
  });
}

function lookSlots(family: LookFamily, lane: MoodLane, intent: MusicIntentV1 | null, seed: string, picks: readonly LibraryPicture[], ownPicture: boolean): CreativesPackSlot[] {
  const row: ShelfRow = family;
  const cards: (LibraryPicture | null)[] = ownPicture ? Array.from({ length: ROW_SIZE }, () => null) : picks.slice(0, ROW_SIZE);
  const looks = dealLooks(lane, cards.length, family);
  if (!cards.length || looks.some(look => !look)) return [];
  const types = seededOrder(TYPE_ALLOW[lane].filter(id => TYPE_STYLES.includes(id)), `${seed}:filter`, id => id);
  const typeOf = (index: number) => types[index % types.length];
  const faces = dealFaces(lane, intent, seed, row, cards.map((_, index) => typeNeeds(typeOf(index))));
  const hand = hashPick(seed, 'gen', 997).toString(36);
  return cards.map((pick, index) => ({
    ...adPunchSlot('filter', index, intent, seed, lane, row, faces[index]),
    id: `ad-${family}-${pick?.id ?? `own${index}`}-${hand}`,
    label: pick ? [pick.tags[0] ?? pick.attitudes[0] ?? 'Our library', liveLookTitle(looks[index]!)].join(' · ') : liveLookTitle(looks[index]!),
    reason: pick ? `${lane} · library · ${pick.attitudes.join('+')} · ${typeOf(index)} · ${looks[index]}` : `${lane} · own picture · ${typeOf(index)} · ${looks[index]}`,
    ...(pick ? { libraryId: pick.id } : {}),
    typeStyle: typeOf(index),
    look: looks[index]!,
    cutSeed: hashPick(seed, 'cut', 250_000) * 4 + index,
  }));
}

/** Four Pulise cards: each its own face, each opening on a different colour. */
function puliseSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string): CreativesPackSlot[] {
  const faces = dealFaces(lane, intent, seed, 'pulise', HEAVY_CAPS_ROW);
  return faces.map((face, index) => {
    const slot = adPunchSlot('pulise', index, intent, seed, lane, 'pulise', face);
    return { ...slot, layout: { ...slot.layout, cut: index } };
  });
}
