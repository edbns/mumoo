import type { CreativeProfileV1 } from './creative-profile';
import { deriveMusicIntent, type MusicIntentV1 } from './music-intent';
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
import { SPRAY_PALETTES } from './spray-look';
import { dealWindow, dealWindowLibrary, type WindowLibraryItem, type WindowMode, type WindowOwn } from './window-deal';
import type { WindowReading } from './pack-window';
import bankData from './look-lab/bank.json';
import effectsData from '../punch-plates/effects/effects.json';
import { laneFromMeaning, leansDeep, type LyricMeaning } from './lyric-meaning';
import { moodGrade, type MoodGrade } from './mood-grade';
import { TYPE_STYLES, typeNeeds, type TypeStyleId } from './pack-type';
import { attitudeFit, coverFit, diversify, hasFeel, type LookRead } from './look-fit';
import type { CoverRead } from './cover-palette';
import { dealLooks, isLookFamily, liveLookTitle, type LiveLookId, type LookFamily } from './live-look-deal';
import { pickLibrary, type LibraryPicture, type LibraryWanted } from './library-pick';
import { dealDoodle, doodleMood, type DoodlePaper } from './doodle-cast';
import type { DoodleMood } from './doodle-parts';

type BankLook = { slug: string; title: string; mood: string; tone: 'bright' | 'deep'; lanes: readonly string[]; read: LookRead };
const BANK_LOOKS = bankData as BankLook[];

/** One of our approved photo with a Shaders Pro image effect baked on it (punch-plates/effects), as measured when it was baked. */
type PhotoEffect = { id: string; title: string; collection: string; mood: string; lightness: number; saturation: number; warmth: number; palette: { hex: string; share: number }[] };
const PHOTO_EFFECTS = effectsData as PhotoEffect[];

export type PackFamily = 'ad_punch';

/** Every row that can be dealt. 'looks' (Moving backgrounds) is dealt but not on the shelf: see SHELF_ROWS. */
export type ShelfRow = 'photography' | LookFamily | 'looks' | 'riso' | 'spray' | 'window' | 'doodle' | 'pulise' | 'dust';

/**
 * The shelf is rows of four. A row is a kind of creative, and it owns its controls so that changing one row
 * never redraws (or re-renders) another:
 *   lyrics  'switch': the row has its own Lyrics on/off. 'always': made of the lyrics, so there is no switch.
 *   picture the row draws a picture, ours until the person uploads their own (the shelf has one upload for all of them).
 *           'photo': only a photo will do (Dust and Depth stand the person's cut-out in front), so a video leaves the row off the shelf.
 *           'any': a photo, video or GIF.
 * The shelf shows one creative of each row. Every row has its own Refresh, and "More" deals the rest of its four.
 */
export type ShelfRowDef = { id: ShelfRow; title: string; lyrics: 'switch' | 'always'; picture?: 'photo' | 'any' };
export const SHELF_ROWS: readonly ShelfRowDef[] = [
  { id: 'photography', title: 'Directed', lyrics: 'switch', picture: 'any' },
  // One effect per row, each dealt in its different colourings, on pictures of our library or the person's own (a row has no picture to draw until the library has one or they upload theirs).
  { id: 'thermal', title: 'Thermal', lyrics: 'switch', picture: 'any' },
  { id: 'halftone', title: 'Halftone', lyrics: 'switch', picture: 'any' },
  { id: 'dither', title: 'Dither', lyrics: 'switch', picture: 'any' },
  { id: 'glow', title: 'Glow', lyrics: 'switch', picture: 'any' },
  { id: 'streaks', title: 'Streaks', lyrics: 'switch', picture: 'any' },
  { id: 'ascii', title: 'ASCII', lyrics: 'switch', picture: 'any' },
  { id: 'depth', title: 'Depth', lyrics: 'switch', picture: 'photo' },
  { id: 'riso', title: 'Riso', lyrics: 'switch', picture: 'any' },
  { id: 'spray', title: 'Spray', lyrics: 'always' },
  { id: 'window', title: 'Window', lyrics: 'always', picture: 'any' },
  { id: 'doodle', title: 'Doodle', lyrics: 'always' },
  // "Moving backgrounds" (id 'looks', the Shaders backgrounds under lyric type) is off the shelf until its backgrounds are good enough.
  // To bring it back, add { id: 'looks', title: 'Moving backgrounds', lyrics: 'switch' } here.
  { id: 'pulise', title: 'Pulise', lyrics: 'always' },
  { id: 'dust', title: 'Dust', lyrics: 'switch', picture: 'photo' },
];
/** What the person's own picture is: a photo (with its cut-out), or a video or GIF. */
export type OwnKind = 'photo' | 'motion';
/**
 * The rows of the shelf for a song and the person's own picture. With no words, only the rows that work without them
 * (Spray, Window, Doodle and Pulise are made of the lyrics). With any picture of their own, only the rows that draw a picture
 * (Spray, Doodle and Pulise take none, so they leave). With a video or GIF, only the rows that can use one (Dust and Depth need a photo).
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
  /** Spray: the wall and paints of this card (`SPRAY_PALETTES` id). */
  sprayPalette?: string;
  /** Window: the kind of picture seen through the word, the screen colour the card opens on, and the colours its screen may flip to (all of which read against the picture). */
  windowMode?: WindowMode;
  windowPalette?: string;
  windowAllowed?: string[];
  /** Doodle: who sings (`doodle-cast.ts`: one singer or a duet), the paper they are drawn on, and the mood of the song's words. */
  doodleId?: string;
  doodlePaper?: DoodlePaper;
  doodleMood?: DoodleMood;
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
  /** Look Bank card: Shaders Pro background id + lyric type style, both chosen by the brain. */
  bankId?: string;
  typeStyle?: TypeStyleId;
  /** What the lyrics do to the colours and the beat. Absent when the words change nothing. */
  grade?: MoodGrade;
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
  if (intent.vibe === 'Aggressive/Industrial' || intent.vibe === 'Uplifting/Energetic') {
    return intent.cutRate === 'high' ? 'party' : 'general';
  }
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
/** Spray fills the letters with paint, so a face must be heavy; it reads in either case, which lets the graffiti marker faces in. */
const HEAVY_ROW: readonly (readonly FontNeed[])[] = Array.from({ length: ROW_SIZE }, () => ['heavy']);

type Faces = { font: AdFont; fontSecondary: AdFont };

/** The faces of one row of cards: none shared, each able to do what its card's type asks (`needs[i]` for card i). */
function dealFaces(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, row: ShelfRow, needs: readonly (readonly FontNeed[])[]): Faces[] {
  return dealFonts(lane, intent?.vibe ?? null, seed, row, needs).map((font, index) => ({
    font,
    fontSecondary: pickSecondaryFont(font, seed, `${row}:${index}`, fontsForLane(lane, needs[index])),
  }));
}

/**
 * Which tagged looks a lane may draw from. Club music is not one colour: a techno or house song also
 * suits the energetic party looks, so its pool is wide enough to have real variety.
 */
const LANE_POOL: Partial<Record<MoodLane, readonly string[]>> = {
  techno: ['techno', 'party'],
  party: ['party', 'techno'],
};

function seededOrder<T>(items: readonly T[], seed: string, key: (item: T) => string): T[] {
  return [...items].sort((a, b) => hashPick(seed, key(a), 99991) - hashPick(seed, key(b), 99991));
}

/** One row of cards: distinct (background, type) pairs, rotated by seed so no two generations look alike. */
function bankSlots(
  lane: MoodLane,
  meaning: LyricMeaning | null,
  intent: MusicIntentV1 | null,
  seed: string,
  count: number,
  cover: CoverRead | null,
): CreativesPackSlot[] {
  const pool = LANE_POOL[lane] ?? [lane];
  let looks = BANK_LOOKS.filter(look => look.lanes.some(tag => pool.includes(tag)));
  if (!looks.length) looks = BANK_LOOKS.filter(look => look.lanes.includes('general'));
  // A sad or angry song never sits on a sunny background ("match" policy).
  if (leansDeep(meaning)) {
    const deep = looks.filter(look => look.tone === 'deep');
    if (deep.length >= 3) looks = deep;
  }
  // Backgrounds closest to the cover's colours and to what the words feel like lead; the seed still shuffles
  // near-equal ones between generations. With neither, the seed alone decides.
  const fit = (look: BankLook) => (cover ? coverFit(cover, look.read) : 0)
    + (hasFeel(meaning) ? attitudeFit(meaning, look.read) : 0)
    + hashPick(seed, look.slug, 1000) / 4000;
  const ranked = cover || hasFeel(meaning)
    ? [...looks].sort((a, b) => fit(b) - fit(a))
    : seededOrder(looks, seed, look => look.slug);
  // The four cards must look different from each other: one per effect, one per colour family.
  // A cover is the creator's own colour identity, so it may fill three of the four cards with its family.
  const backgrounds = diversify(ranked, cover ? 3 : 1);
  const types = seededOrder(TYPE_ALLOW[lane].filter(id => TYPE_STYLES.includes(id)), seed, id => id);
  const pairs: { look: BankLook; type: TypeStyleId }[] = [];
  const used = new Set<string>();
  for (let round = 0; pairs.length < count && round < types.length; round++) {
    backgrounds.forEach((look, index) => {
      const type = types[(index + round) % types.length];
      const key = `${look.slug}:${type}`;
      if (pairs.length >= count || used.has(key)) return;
      used.add(key);
      pairs.push({ look, type });
    });
  }
  const faces = dealFaces(lane, intent, seed, 'looks', pairs.map(pair => typeNeeds(pair.type)));
  return pairs.map(({ look, type }, index) => bankCard(look.slug, look.title, type, index, lane, meaning, intent, seed, faces[index]));
}

/** One card on the Look Bank world: a baked background image plus a lyric type style. */
function bankCard(
  bankId: string,
  title: string,
  type: TypeStyleId,
  index: number,
  lane: MoodLane,
  meaning: LyricMeaning | null,
  intent: MusicIntentV1 | null,
  seed: string,
  faces: Faces,
): CreativesPackSlot {
  return {
    ...adPunchSlot('bank', index, intent, seed, lane, 'looks', faces),
    id: `ad-bank-${bankId}-${type}-${hashPick(seed, 'gen', 997).toString(36)}`,
    label: `${type[0].toUpperCase()}${type.slice(1)} · ${title}`,
    reason: `${lane} · lyrics ${meaning?.attitude ?? 'unread'} · ${title} · ${type}`,
    bankId,
    typeStyle: type,
  };
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

/** An approved photo; `cutout` says it also has the mask Dust needs. */
export type PlateRef = { id: string; cutout: boolean };

/** Riso, Spray and Window are drawn in the inks, paints and screen colours they were dealt: a mood grade over them would recolour the design. */
const UNGRADED: readonly ShelfRow[] = ['riso', 'spray', 'window', 'doodle'];

/**
 * One row of the shelf for this song. `generation` is that row's own Refresh count. `plates` are the approved
 * photos Dust, Riso and Window are drawn from (the person's own picture, if any, replaces them in the app); `own` is
 * what is known of the person's own picture for Window, which is dealt from it instead of ours.
 */
/** A library picture Window can draw: a photo that has its cut-out, or a video or GIF. */
const windowCapable = (item: LibraryPicture) => (item.kind === 'photo' ? Boolean(item.cutoutUrl) : Boolean(item.motionUrl));
/** Riso: a cut-out photo (person print) or a video/GIF (whole-frame print). Dust stays cut-out photos only. */
const risoCapable = (item: LibraryPicture) => (item.kind === 'photo' ? Boolean(item.cutoutUrl) : Boolean(item.motionUrl));

/**
 * The four library pictures Window deals from for this song and Refresh. The page reads how each looks (which screen colours read against it) before the
 * row is dealt, so it asks for exactly these.
 */
export function windowHand(profile: CreativeProfileV1, generation: number, library: readonly LibraryPicture[]): LibraryPicture[] {
  const { meaning, genre } = readSong(profile);
  const wanted = { attitude: meaning?.attitude ?? null, genre, subGenre: profile.creator.subGenre?.value ?? '' };
  return pickLibrary(library.filter(windowCapable), wanted, profile.clip.sourceSha256, generation, ROW_SIZE);
}

/** How many library pictures a Director's reel is edited from. */
const REEL_POOL = 6;
const isClip = (item: LibraryPicture) => item.kind !== 'photo' && Boolean(item.motionUrl);

/** The pictures a reel is edited from: the best fits for the song, with at least one clip among them when the library has one (video sells; a reel of stills does not). */
export function reelPool(items: readonly LibraryPicture[], wanted: LibraryWanted, song: string, generation: number): LibraryPicture[] {
  const pool = pickLibrary(items, wanted, song, generation, REEL_POOL);
  if (pool.length < 2 || pool.some(isClip)) return pool;
  const [clip] = pickLibrary(items.filter(isClip), wanted, song, generation, 1);
  return clip ? [...pool.slice(0, -1), clip] : pool;
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

export function recommendRow(row: ShelfRow, profile: CreativeProfileV1, generation: number, plates: readonly PlateRef[] = [], own: WindowOwn | null = null, library: readonly LibraryPicture[] = [], readings: Readonly<Record<string, WindowReading>> = {}, ownPicture = false): CreativesPackSlot[] {
  const { intent, meaning, lane, genre } = readSong(profile);
  const cover = profile.creator.cover?.value ?? null;
  const seed = `${profile.clip.sourceSha256}:${generation}:${lane}:${row}`;
  const cutOutPlates = plates.filter(plate => plate.cutout).map(plate => plate.id);
  // Dust draws library photos that have a cut-out; Riso those, or library videos/GIFs; with none, our approved photos.
  const wanted = { attitude: meaning?.attitude ?? null, genre, subGenre: profile.creator.subGenre?.value ?? '' };
  const cutOutLibrary = pickLibrary(library.filter(item => item.kind === 'photo' && item.cutoutUrl), wanted, profile.clip.sourceSha256, 0, 50).map(item => item.id);
  const risoLibrary = pickLibrary(library.filter(risoCapable), wanted, profile.clip.sourceSha256, 0, 50).map(item => item.id);
  const photos: PhotoSources = { plateIds: cutOutPlates, libraryIds: cutOutLibrary };
  const risoPhotos: PhotoSources = { plateIds: cutOutPlates, libraryIds: risoLibrary };
  /** A row of one effect: library pictures that fit the song, or the person's own picture (lookSlots). */
  const effectRow = (family: LookFamily) => lookSlots(family, lane, intent, seed, pickLibrary(library, wanted, `${profile.clip.sourceSha256}:${family}`, generation, ROW_SIZE), ownPicture);
  const slots = {
    photography: () => photographySlots(
      lane, intent, seed,
      dealEffects(lane, meaning, cover, `${profile.clip.sourceSha256}:${lane}`, generation),
      pickLibrary(library, wanted, profile.clip.sourceSha256, generation, ROW_SIZE),
    ),
    thermal: () => effectRow('thermal'),
    halftone: () => effectRow('halftone'),
    dither: () => effectRow('dither'),
    glow: () => effectRow('glow'),
    streaks: () => effectRow('streaks'),
    ascii: () => effectRow('ascii'),
    depth: () => depthSlots(lane, intent, seed, photos, pickLibrary(library.filter(item => item.kind === 'photo' && item.cutoutUrl), wanted, `${profile.clip.sourceSha256}:depth`, generation, ROW_SIZE), ownPicture),
    looks: () => bankSlots(lane, meaning, intent, seed, ROW_SIZE, cover),
    riso: () => risoSlots(lane, intent, seed, risoPhotos),
    spray: () => spraySlots(lane, intent, seed),
    window: () => {
      const read: WindowLibraryItem[] = own ? [] : windowHand(profile, generation, library).flatMap(item => (readings[item.id] ? [{ id: item.id, reading: readings[item.id], clip: item.kind !== 'photo' }] : []));
      return windowSlots(lane, intent, seed, plates, own, read);
    },
    doodle: () => doodleSlots(lane, intent, seed, genre, profile.creator.voice?.value ?? null, doodleMood(meaning?.attitude)),
    pulise: () => puliseSlots(lane, intent, seed),
    dust: () => dustSlots(lane, intent, seed, cover?.hue, photos),
  }[row]();
  // Our photography, its live looks (not Depth, which needs one photo with its cut-out) and Riso (whole-frame, from clips) are edited by the Director from a pool, once there are two or more pictures to edit.
  const directed = (items: readonly LibraryPicture[] | null, song: string) => (items && !ownPicture && !own ? reelPool(items, wanted, song, generation) : []);
  const pool = row === 'photography' ? directed(library, profile.clip.sourceSha256)
    : isLookRow(row) && row !== 'depth' ? directed(library, `${profile.clip.sourceSha256}:${row}`)
      : row === 'riso' ? directed(library.filter(isClip), `${profile.clip.sourceSha256}:riso`)
        : [];
  const edited = pool.length < 2 ? slots : slots.map((slot, index) => reeled(slot, pool, index));
  const grade = moodGrade(meaning);
  return grade && !UNGRADED.includes(row) ? edited.map(slot => ({ ...slot, grade })) : edited;
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

/** Four Spray walls: each its own palette (four of the six, a seeded draw), its own heavy face and its own layout of the words. */
function spraySlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string): CreativesPackSlot[] {
  const faces = dealFaces(lane, intent, seed, 'spray', HEAVY_ROW);
  const walls = seededOrder(SPRAY_PALETTES, seed, palette => palette.id);
  return faces.map((face, index) => ({
    ...adPunchSlot('spray', index, intent, seed, lane, 'spray', face),
    label: sentence(walls[index].name),
    sprayPalette: walls[index].id,
  }));
}

/** Four Doodle cards: the singer the genre and the voice ask for, the same kit on an animal and on a second person, each on its own paper, every face feeling what the words feel. */
function doodleSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, genre: string, voice: 'female' | 'male' | 'both' | null, mood: DoodleMood): CreativesPackSlot[] {
  return dealDoodle(genre, voice, mood, seed).map((card, index) => ({
    // Doodle writes in one hand: the second face is the same, so nothing else is asked of the worker.
    ...adPunchSlot('doodle', index, intent, seed, lane, 'doodle', { font: card.font, fontSecondary: card.font }),
    label: card.label,
    reason: `${lane} · ${card.id} · ${card.mood} · ${card.paper}`,
    doodleId: card.id,
    doodlePaper: card.paper,
    doodleMood: card.mood,
  }));
}

/** Four Window cards, mixing kinds of picture, screen colours and condensed faces by the seed (see window-deal.ts). Every card is made of the lyrics. */
function windowSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, plates: readonly PlateRef[], own: WindowOwn | null, fromLibrary: readonly WindowLibraryItem[]): CreativesPackSlot[] {
  const cards = !own && fromLibrary.length ? dealWindowLibrary(seed, fromLibrary) : dealWindow(seed, plates, own);
  return cards.map((card, index) => ({
    // Window sets one face of type: the second is the same, so nothing else is asked of the worker.
    ...adPunchSlot('window', index, intent, seed, lane, 'window', { font: card.font, fontSecondary: card.font }),
    label: sentence(card.palette.replace('-', ' ')),
    reason: `${lane} · ${card.mode} · ${card.palette} · ${card.font}`,
    windowMode: card.mode,
    windowPalette: card.palette,
    windowAllowed: card.allowed,
    ...(card.libraryId ? { libraryId: card.libraryId } : {}),
    ...(card.plateId ? { plateId: card.plateId } : {}),
    ...(card.effectId ? { effectId: card.effectId } : {}),
    ...(card.bankId ? { bankId: card.bankId } : {}),
    // A video or GIF (the person's own, or the library's) is cut differently for each card.
    ...(own?.clip || card.clip ? { cutSeed: hashPick(seed, 'cut', 250_000) * 4 + index } : {}),
  }));
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

/** Depth: library photos with a cut-out, else approved plates with a cut-out, else the person's own cut-out photo. */
function depthSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, photos: PhotoSources, picks: readonly LibraryPicture[], ownPicture: boolean): CreativesPackSlot[] {
  if (ownPicture || picks.length) return lookSlots('depth', lane, intent, seed, picks, ownPicture);
  const looks = dealLooks(lane, seed, ROW_SIZE, 'depth');
  if (!photos.plateIds.length || looks.some(look => !look)) return [];
  const types = seededOrder(TYPE_ALLOW[lane].filter(id => TYPE_STYLES.includes(id)), `${seed}:filter`, id => id);
  const typeOf = (index: number) => types[index % types.length];
  const faces = dealFaces(lane, intent, seed, 'depth', Array.from({ length: ROW_SIZE }, (_, index) => typeNeeds(typeOf(index))));
  const hand = hashPick(seed, 'gen', 997).toString(36);
  return Array.from({ length: ROW_SIZE }, (_, index) => ({
    ...adPunchSlot('filter', index, intent, seed, lane, 'depth', faces[index]),
    id: `ad-depth-${photos.plateIds[index % photos.plateIds.length]}-${index}-${hand}`,
    label: liveLookTitle(looks[index]!),
    reason: `${lane} · plate · ${typeOf(index)} · ${looks[index]}`,
    plateId: photos.plateIds[index % photos.plateIds.length],
    typeStyle: typeOf(index),
    look: looks[index]!,
    cutSeed: hashPick(seed, 'cut', 250_000) * 4 + index,
  }));
}

function lookSlots(family: LookFamily, lane: MoodLane, intent: MusicIntentV1 | null, seed: string, picks: readonly LibraryPicture[], ownPicture: boolean): CreativesPackSlot[] {
  const row: ShelfRow = family;
  const cards: (LibraryPicture | null)[] = ownPicture ? Array.from({ length: ROW_SIZE }, () => null) : picks.slice(0, ROW_SIZE);
  const looks = dealLooks(lane, seed, cards.length, family);
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

export function adPunchFallbackText(profile: CreativeProfileV1, intent: MusicIntentV1 | null): string {
  const title = profile.creator.title?.value?.trim();
  if (title) return title.slice(0, 48);
  const artist = profile.creator.artist?.value?.trim();
  if (artist) return artist.slice(0, 48);
  if (intent?.vibe === 'Aggressive/Industrial') return 'NOW';
  if (intent?.vibe === 'Dark/Cinematic') return 'WATCH';
  if (intent?.vibe === 'Ambient/Mellow') return 'STILL';
  return 'PLAY';
}
