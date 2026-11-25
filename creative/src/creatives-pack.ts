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
import { isSkullStyle } from './style-families';
import effectsData from '../punch-plates/effects/effects.json';
import { laneFromMeaning, leansDeep, type LyricAttitude, type LyricMeaning } from './lyric-meaning';
import { moodGrade, type MoodGrade } from './mood-grade';
import { TYPE_STYLES, typeNeeds, type TypeStyleId } from './pack-type';
import { EMPHASIS_ALLOW, FINISH_ALLOW, MONO_ACCENT, MOOD_ACCENTS, type TypeEmphasis, type TypeFinish } from './type-finish';
import { coverFit } from './look-fit';
import type { CoverRead } from './cover-palette';
import { dealLooks, isLookFamily, liveLookTitle, type LiveLookId, type LookFamily } from './live-look-deal';
import { coloursFor } from './genre-guide';
import { colourFit, inLane, learnedNudge, libraryFit, pickLibrary, showing, usualRate, wantsOf, type Learned, type LibraryPicture, type LibraryWanted } from './library-pick';
import { boardForRow, songBoards } from './boards';
import {
  dealTreatments,
  isTreatmentId,
  TREATMENT_IDS,
  TREATMENT_LEAD,
  TREATMENT_ROTATES,
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
 *   picture the row draws a picture ('any': a photo, video or GIF), ours until the person uploads their own (the shelf has one upload for all of them).
 * The shelf shows one creative of each row. Every row has its own Refresh, and "More" deals the rest of its four.
 */
export type ShelfRowDef = { id: ShelfRow; title: string; lyrics: 'switch' | 'always'; picture?: 'any' };
export const SHELF_ROWS: readonly ShelfRowDef[] = [
  { id: 'photography', title: 'Directed', lyrics: 'switch', picture: 'any' },
  // Video treatments: each finishes the Directed reel with one creative pass (gaps, lens, collage, grain…).
  // Screenshot is the lyrics as a chat, so it has no switch: without words it is not on the shelf.
  ...TREATMENT_IDS.map(id => ({ id, title: treatmentTitle(id), lyrics: id === 'screenshot' ? 'always' as const : 'switch' as const, picture: 'any' as const })),
  // One effect per row, each dealt in its different colourings, on pictures of our library or the person's own (a row has no picture to draw until the library has one or they upload theirs).
  { id: 'thermal', title: 'Thermal', lyrics: 'switch', picture: 'any' },
  { id: 'halftone', title: 'Halftone', lyrics: 'switch', picture: 'any' },
  { id: 'dither', title: 'Dither', lyrics: 'switch', picture: 'any' },
  { id: 'ascii', title: 'ASCII', lyrics: 'switch', picture: 'any' },
  { id: 'riso', title: 'Riso', lyrics: 'switch', picture: 'any' },
  { id: 'window', title: 'Window', lyrics: 'always', picture: 'any' },
  // The song's video inside the still figure of a person, on red, black or white; never for gospel.
  { id: 'silhouette', title: 'Silhouette', lyrics: 'switch', picture: 'any' },
  { id: 'pulise', title: 'Pulse', lyrics: 'always' },
  // The lyrics alone, made of dust: no picture to choose or wait for.
  { id: 'dust', title: 'Dust', lyrics: 'always' },
];
/** What the person's own picture is: a photo (with its cut-out), or a video or GIF. */
export type OwnKind = 'photo' | 'motion';
/**
 * The rows of the shelf for a song and the person's own picture. With no words, only the rows that work without them
 * (Window, Pulse, Dust and Screenshot are made of the lyrics). With any picture of their own, only the rows that draw a picture
 * (Pulise and Dust take none, so they leave).
 */
export const rowsFor = (noLyrics: boolean, own: OwnKind | null = null): readonly ShelfRowDef[] =>
  SHELF_ROWS.filter(def => !(noLyrics && def.lyrics === 'always') && !(own && !def.picture));
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
  /** Riso and Window: the approved photo this card is drawn from, until the person uses their own. */
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
  /** How the lyric letters are finished (type-finish.ts), and the song's colour for a picture with none. Solid, and no colour, when absent. */
  typeFinish?: TypeFinish;
  typeAccent?: string;
  /** How the line's key word is set apart (two-tone or mixed serif); absent, the sung word is lit. */
  typeEmphasis?: TypeEmphasis;
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
/** Hard, fast electronic music. House is groovy, not hard: the sound chooses its lane (party, or quiet for the deep ones). */
const CLUB_GENRE = /techno|\bedm\b|dubstep|riddim|drum ?(and|&|n) ?bass|\bdnb\b|general electronic|^electronic/;
/** Genres whose lane is theirs whatever the sound or the words say. */
const GENRE_LANES: readonly (readonly [RegExp, MoodLane])[] = [
  [/metal|hardcore/, 'dark'],
  [/pop[- ]?punk|skate punk/, 'party'],
  [/reggaeton|dembow|salsa|bachata|latin pop/, 'party'],
];
const lockedLane = (genre: string) => GENRE_LANES.find(([pattern]) => pattern.test(genre))?.[1];
/** Dembow and afrobeats move a crowd at drives too low for fast cutting. */
const DANCEABLE = 0.5;

export function moodLane(intent: MusicIntentV1 | null, genre: string): MoodLane {
  const g = genre.toLowerCase();
  if (GOSPEL_GENRE.test(g)) return 'gospel';
  // Club / dance genres lock techno lane even if DSP vibe misfires
  if (CLUB_GENRE.test(g)) {
    return 'techno';
  }
  const locked = lockedLane(g);
  if (locked) return locked;
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
  gospel: ['editorial', 'poem', 'minimal', 'typewriter', 'karaoke', 'slide', 'wipe', 'wave', 'rise', 'glow', 'drift'],
  quiet: ['poem', 'minimal', 'editorial', 'typewriter', 'karaoke', 'slide', 'wipe', 'wave', 'jitter', 'rise', 'glow', 'drift'],
  dark: ['typewriter', 'swap', 'outline', 'poem', 'minimal', 'editorial', 'glitch', 'flicker', 'wipe', 'split', 'scatter', 'zoom'],
  techno: ['stack', 'swap', 'outline', 'karaoke', 'typewriter', 'glitch', 'stretch', 'split', 'zoom', 'flicker', 'scatter', 'echo', 'bounce'],
  party: ['swap', 'stack', 'karaoke', 'outline', 'typewriter', 'bounce', 'stretch', 'rotate', 'zoom', 'echo', 'wave', 'tilt', 'scatter', 'jitter', 'slide'],
  general: TYPE_STYLES,
};

/**
 * Where a row stands in the song's deal: `song` seeds one order of each choice for the whole shelf, and `at` is the row's
 * place on the shelf plus its own Refresh count.
 */
type Turn = { song: string; at: number };

/**
 * Card `index` of the row at `turn`, from the song's one order of `items`. Each row down the shelf and each Refresh leads
 * with the next one, so a Refresh shows every one before any comes back and neighbouring rows lead differently. A row's
 * cards are spread across the order, so after a Refresh none of them repeats while the order has at least two per card.
 */
function inTurn<T>(items: readonly T[], turn: Turn, salt: string, key: (item: T) => string) {
  const order = seededOrder(items, `${turn.song}:${salt}`, key);
  const spread = Math.max(1, Math.floor(order.length / ROW_SIZE));
  return (index: number) => order[(turn.at + index * spread) % order.length];
}

const typeDeal = (lane: MoodLane, turn: Turn) => inTurn(TYPE_ALLOW[lane].filter(id => TYPE_STYLES.includes(id)), turn, 'type', id => id);

/** Each card's lyric finish and mood colour, dealt from the song's mood like its type, so they too change on every row and Refresh. */
function finishDeal(lane: MoodLane, turn: Turn) {
  const finishes = inTurn(FINISH_ALLOW[lane], turn, 'finish', finish => finish);
  const colours = inTurn(MOOD_ACCENTS[lane], turn, 'mood-colour', colour => colour);
  const emphases = inTurn(EMPHASIS_ALLOW[lane], turn, 'emphasis', emphasis => emphasis);
  return (index: number): { typeFinish: TypeFinish; typeAccent: string; typeEmphasis?: TypeEmphasis } => {
    const typeAccent = colours(index);
    const dealt = emphases(index);
    // A monochrome card has no second colour to set the key word in, so it sets it in the serif instead.
    const typeEmphasis = dealt === 'tone' && typeAccent === MONO_ACCENT ? 'serif' : dealt;
    return { typeFinish: finishes(index), typeAccent, ...(typeEmphasis === 'none' ? {} : { typeEmphasis }) };
  };
}

/** Dust, Pulise and Riso draw capitals from thick strokes, so their faces must be heavy and set in caps. */
const HEAVY_CAPS_ROW: readonly (readonly FontNeed[])[] = Array.from({ length: ROW_SIZE }, () => ['heavy', 'caps']);

type Faces = { font: AdFont; fontSecondary: AdFont };

/** The faces of one row of cards: none shared, each able to do what its card's type asks (`needs[i]` for card i), stepped on with the row's turn. */
function dealFaces(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, turn: Turn, row: ShelfRow, needs: readonly (readonly FontNeed[])[]): Faces[] {
  return dealFonts(lane, intent?.vibe ?? null, turn.song, 'shelf', needs, turn.at).map((font, index) => ({
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
  const genreLocked = GOSPEL_GENRE.test(specific.toLowerCase()) || CLUB_GENRE.test(specific.toLowerCase()) || Boolean(lockedLane(specific.toLowerCase()));
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

/** An approved photo; `cutout` says it also has the mask Riso's person print needs. */
export type PlateRef = { id: string; cutout: boolean };

/** Riso and Window are drawn in the inks and screen colours they were dealt: a mood grade over them would recolour the design. */
const UNGRADED: readonly ShelfRow[] = ['riso', 'window', 'silhouette'];

/** Riso: a cut-out photo (person print) or a video/GIF (whole-frame print). */
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
 * (Riso wants cut-out photos or clips) the next board that fits the song stands in, and the whole library only when none has them.
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
  /**
   * The Director's footage: the row's board alone, so every reel of the song stays in its one scene however often it is refreshed
   * (the empty group after it is the "rest of the library" that footage without a board walks); the whole library while no board is filled.
   */
  const footage = () => (board ? [library.filter(item => item.boards?.includes(board.id)), []] : [library]);
  return { board, from, footage };
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
 * Who a deal is for. `seed` is drawn afresh each time a person makes creatives, so the same song deals other reels each time and to
 * each person (without it, the song alone seeds the deal, as in the tests). `seen` is how recently this person was shown each library
 * picture (1 newest, `library-seen.ts`): those wait until the pictures they have not seen had their turn, the oldest first.
 */
export type Deal = { seed?: string; seen?: ReadonlyMap<string, number> };

/** How much the best fit for the song leads the board's order, against the seeded draw (0…`BOARD_DRAW`) that keeps each deal its own. */
const BOARD_FIT = 0.6;
const BOARD_DRAW = 1;
/** More than fit and draw together: a picture the person saw lately comes after every one they have not. */
const SEEN_WAIT = 3;

/**
 * The board in the order this deal walks it: the pictures that show most of what the song wants lead (its themes, mood, genre looks
 * and colours, `libraryFit`), nudged by what people kept (`learnedNudge`), with a seeded draw so no two deals walk it alike, and the
 * pictures the person saw lately last. Each run of `size` shows different things where it can (`mixed`), so a reel is not eight cars.
 */
function boardOrder(items: readonly LibraryPicture[], wanted: LibraryWanted, song: string, size: number, seen: Deal['seen']): LibraryPicture[] {
  const wants = wantsOf(wanted);
  const fits = new Map(items.map(item => [item.id, libraryFit(item, wanted, wants)]));
  // A picture kept for another genre stays off this song's reels while the board has enough without it.
  const allowed = items.filter(item => fits.get(item.id) !== null);
  const pool = allowed.length >= BOARD_REEL_MIN ? allowed : items;
  const best = Math.max(0, ...pool.map(item => fits.get(item.id) ?? 0));
  const usual = usualRate(pool);
  const learning = pool.some(item => item.learned);
  const score = (item: LibraryPicture) => (best > 0 ? BOARD_FIT * (fits.get(item.id) ?? 0) / best : 0)
    + (learning ? learnedNudge(item.learned, usual, `${song}:${item.id}`) : 0)
    + BOARD_DRAW * hashPick(`${song}:board-draw`, item.id, 99991) / 99991
    - (seen?.has(item.id) ? SEEN_WAIT + seen.get(item.id)! : 0);
  const scores = new Map(pool.map(item => [item.id, score(item)]));
  let rest = [...pool].sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || (a.id < b.id ? -1 : 1));
  const order: LibraryPicture[] = [];
  const wasSeen = (item: LibraryPicture) => Boolean(seen?.has(item.id));
  while (rest.length) {
    // Variety is looked for among pictures as fresh as the next one: it never brings a seen picture ahead of an unseen one.
    const near = rest.slice(0, size * 3).filter(item => wasSeen(item) === wasSeen(rest[0]));
    const run = mixed(near, Math.min(size, near.length));
    order.push(...run);
    rest = rest.filter(item => !run.includes(item));
  }
  return order;
}

/**
 * A reel from a mood board chosen for the song: every picture on it fits the scene, so the board is walked in this deal's order
 * (`boardOrder`), each card taking the next pictures and each Refresh going on where the last stopped. Nothing repeats until the
 * whole board has been used, and a reel is shorter (down to `BOARD_REEL_MIN`) when that lets one Refresh share no picture with the one before it.
 */
function boardReel(items: readonly LibraryPicture[], wanted: LibraryWanted, song: string, generation: number, card: number, seen: Deal['seen']): LibraryPicture[] {
  const size = Math.max(BOARD_REEL_MIN, Math.min(REEL_POOL, Math.floor(items.length / (2 * ROW_SIZE))));
  const order = boardOrder(items, wanted, song, size, seen);
  if (order.length <= BOARD_REEL_MIN) return order;
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
export function reelPool(items: readonly LibraryPicture[], wanted: LibraryWanted, song: string, generation: number, card = 0, board = false, seen?: Deal['seen']): LibraryPicture[] {
  if (board) return boardReel(items, wanted, song, generation, card, seen);
  const ranked = pickLibrary(items, wanted, song, 0, items.length);
  const fits = new Map(ranked.map(item => [item.id, libraryFit(item, wanted) ?? 0]));
  const best = Math.max(0, ...fits.values());
  // When nothing shows what the song wants, every picture fits as well as the best: Refresh walks the whole library.
  const close = ranked.filter(item => (fits.get(item.id) ?? 0) >= REEL_CLOSE * best);
  const good = close.length >= REEL_ENOUGH ? close : ranked.filter(item => (fits.get(item.id) ?? 0) >= REEL_GOOD * best);
  const turn = (generation * ROW_SIZE + card) * REEL_POOL;
  const walk = good.length ? Math.floor(turn / good.length) : 0;
  const drawn = seededOrder(good, `${song}:reel:${walk}`, item => item.id);
  const order = seen ? [...drawn].sort((a, b) => (seen.get(a.id) ?? 0) - (seen.get(b.id) ?? 0)) : drawn;
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

/** The templates the Director edits a reel for. Each takes its own place in a Refresh's hand, so no two show the same pictures. */
const directedRows = (): readonly ShelfRow[] => SHELF_ROWS.map(def => def.id)
  .filter(row => row === 'photography' || isTreatmentId(row) || isLookRow(row) || row === 'riso' || row === 'window' || row === 'silhouette');

/**
 * Everything the Director may edit for this song in the order a deal walks it: the board chosen for the song, then the other boards
 * that fit it, then the rest of the library that suits it (`boardOrder` keeps another genre's pictures out), each walked with fit,
 * learning, the deal's own draw and what the person saw lately. Every run of `size` carries clips (video sells) in the share the
 * footage has them, at least `REEL_CLIPS` where it can. Each lap round the footage is drawn afresh (`lap`).
 */
function footageOrder(groups: readonly (readonly LibraryPicture[])[], wanted: LibraryWanted, song: string, size: number, seen: Deal['seen']): LibraryPicture[] {
  const taken = new Set<string>();
  const walked = groups.flatMap((group, at) => {
    // The rest of the library: a picture kept for another genre stays out while two others suit the song.
    const suits = at === groups.length - 1 ? group.filter(item => libraryFit(item, wanted) !== null) : group;
    const fresh = (suits.length >= 2 ? suits : group).filter(item => !taken.has(item.id));
    fresh.forEach(item => taken.add(item.id));
    return fresh.length ? boardOrder(fresh, wanted, song, size, seen) : [];
  });
  const clips = walked.filter(isClip);
  const stills = walked.filter(item => !isClip(item));
  const perRun = Math.min(size, Math.max(REEL_CLIPS, Math.round(size * clips.length / Math.max(1, walked.length))));
  const order: LibraryPicture[] = [];
  while (clips.length || stills.length) {
    const wantClips = Math.min(clips.length, stills.length ? perRun : size);
    const run = clips.splice(0, wantClips);
    run.push(...stills.splice(0, size - run.length));
    if (run.length < size) run.push(...clips.splice(0, size - run.length));
    order.push(...run);
  }
  return order;
}

/** Each template asks for the same footage: it is walked once per library, visit (`seen`) and Refresh size. */
const footageCache = new WeakMap<object, WeakMap<object, Map<string, LibraryPicture[]>>>();
const NOT_SEEN = {};

/**
 * The reel for card `place` of Refresh `generation`, when each Refresh deals `hand` cards: the next `size` pictures of the footage,
 * so every template on the shelf is edited from pictures no other shows, and each Refresh goes on past everything the last one showed
 * while the footage has more.
 */
function footageReel(library: readonly LibraryPicture[], groups: readonly (readonly LibraryPicture[])[], wanted: LibraryWanted, song: string,
  generation: number, place: number, hand: number, seen: Deal['seen']): LibraryPicture[] {
  const total = new Set(groups.flat().map(item => item.id)).size;
  if (total < 2) return [];
  const onBoards = new Set(groups.slice(0, -1).flat().map(item => item.id)).size || total;
  // One Refresh's hand is drawn from the song's boards alone where they hold enough; shorter reels before weaker fits.
  const size = Math.min(REEL_POOL, total, Math.max(BOARD_REEL_MIN, Math.floor(onBoards / hand)));
  const card = generation * hand + place;
  const firstLap = footageOf(library, groups, wanted, song, size, seen, 0);
  // Footage too small for a reel of its own per template: the templates share as little as it allows, each opening on another picture.
  const small = firstLap.length < hand * size;
  // A Refresh never straddles two laps, so no clip is on two of its templates: while the footage holds another whole hand a Refresh
  // goes on to it, and once it is used up each Refresh walks it again in its own order.
  const rounds = Math.max(1, Math.floor(firstLap.length / (hand * size)));
  const lap = small ? 0 : Math.floor(generation / rounds);
  const order = lap ? footageOf(library, groups, wanted, `${song}:lap${lap}`, size, seen, lap) : firstLap;
  // The Refresh's stretch of the footage is dealt round the templates like cards, one picture to each in turn: the freshest pictures
  // (the person has not seen them, often new uploads) lead every template's reel instead of filling the first templates alone.
  const first = small ? card : (generation % rounds) * hand * size + place;
  const reel: LibraryPicture[] = [];
  for (let at = first; reel.length < Math.min(size, order.length); at += hand) {
    let next = at % order.length;
    while (reel.includes(order[next])) next = (next + 1) % order.length;
    reel.push(order[next]);
  }
  // Too few clips to give every template its own: the templates share them, last in the reel, so each still opens on its own picture.
  const clips = order.filter(isClip);
  let have = reel.filter(isClip).length;
  for (let step = 0; step < clips.length && have < Math.min(REEL_CLIPS, clips.length); step++) {
    const clip = clips[(card + step) % clips.length];
    const still = reel.map(isClip).lastIndexOf(false);
    if (still <= 0 || reel.includes(clip)) continue;
    reel[still] = clip;
    have += 1;
  }
  return reel;
}

function footageOf(library: readonly LibraryPicture[], groups: readonly (readonly LibraryPicture[])[], wanted: LibraryWanted, song: string,
  size: number, seen: Deal['seen'], lap: number): LibraryPicture[] {
  const key = `${song}|${size}|${lap}|${JSON.stringify(wanted)}|${groups.map(group => group.length).join(',')}`;
  let bySeen = footageCache.get(library);
  if (!bySeen) footageCache.set(library, bySeen = new WeakMap());
  let cached = bySeen.get(seen ?? NOT_SEEN);
  if (!cached) bySeen.set(seen ?? NOT_SEEN, cached = new Map());
  const hit = cached.get(key);
  if (hit) return hit;
  const order = footageOrder(groups, wanted, song, size, seen);
  cached.set(key, order);
  return order;
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
 * photos Riso is drawn from (the person's own picture, if any, replaces them in the app); `ownPicture` says
 * the person's one picture is drawn on every card instead of our library.
 */
export function recommendRow(row: ShelfRow, profile: CreativeProfileV1, generation: number, plates: readonly PlateRef[] = [], pool: readonly LibraryPicture[] = [], ownPicture = false,
  learning: ShelfLearning = {}, deal: Deal = {}): CreativesPackSlot[] {
  const { intent, meaning, lane, genre } = readSong(profile);
  const song = deal.seed ? `${profile.clip.sourceSha256}:${deal.seed}` : profile.clip.sourceSha256;
  // What people did with each picture, for songs in this lane first (`inLane`).
  const library = pool.some(item => item.learnedLanes) ? pool.map(item => ({ ...item, learned: inLane(item.learned, item.learnedLanes?.[lane]) })) : pool;
  const cover = profile.creator.cover?.value ?? null;
  const seed = `${song}:${generation}:${lane}:${row}`;
  const genres = `${genre} ${profile.creator.subGenre?.value ?? ''}`.toLowerCase();
  const turn: Turn = { song: `${song}:${lane}`, at: Math.max(0, SHELF_ROWS.findIndex(def => def.id === row)) + generation };
  const cutOutPlates = plates.filter(plate => plate.cutout).map(plate => plate.id);
  // Riso draws library photos that have a cut-out, or library videos/GIFs; with none, our approved photos.
  const wanted = libraryWanted(profile, meaning, genre, intent);
  // Every template but Pulise and Dust is edited by the Director from the song's footage, each from pictures no other template shows.
  const directed = directedRows();
  const place = directed.indexOf(row);
  const directedRow = place >= 0;
  const { board, from, footage } = rowLibrary(directedRow ? 'photography' : row, profile, wanted, library);
  const risoLibrary = pickLibrary(from(risoCapable), wanted, song, 0, 50).map(item => item.id);
  const risoPhotos: PhotoSources = { plateIds: cutOutPlates, libraryIds: risoLibrary };
  /** A row of one effect: library pictures that fit the song, or the person's own picture (lookSlots). */
  const effectRow = (family: LookFamily) => lookSlots(family, lane, intent, seed, turn, pickLibrary(from(), wanted, `${song}:${family}`, generation, ROW_SIZE), ownPicture);
  // Directed and its treatments are cut and finished in the preset the song's genre calls for; each Refresh may take the next that fits.
  const preset = presetAt({ genre, subGenre: profile.creator.subGenre?.value, style: profile.creator.style?.name }, generation);
  const withPreset = (slots: CreativesPackSlot[]) => slots.map((slot, index) => ({
    ...slot,
    label: [presetTitle(preset), slot.label].join(' · '),
    reason: `${slot.reason} · ${preset}`,
    preset,
    presetTake: takeAt(preset, generation, index),
  }));
  const treatmentRow = (kind: TreatmentId) => withPreset(treatmentSlots(kind, lane, intent, seed, turn, pickLibrary(from(), wanted, song, generation, ROW_SIZE), ownPicture));
  const slots = {
    photography: () => {
      const cards = photographySlots(
        lane, intent, seed, turn,
        dealEffects(lane, meaning, cover, `${song}:${lane}`, generation),
        pickLibrary(from(), wanted, song, generation, ROW_SIZE),
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
    sideways: () => treatmentRow('sideways'),
    typewriter: () => treatmentRow('typewriter'),
    broken: () => treatmentRow('broken'),
    screenshot: () => treatmentRow('screenshot'),
    thermal: () => effectRow('thermal'),
    halftone: () => effectRow('halftone'),
    dither: () => effectRow('dither'),
    ascii: () => effectRow('ascii'),
    riso: () => risoSlots(lane, intent, seed, turn, risoPhotos),
    window: () => windowSlots(lane, intent, seed, ownPicture ? [] : pickLibrary(from(), wanted, song, generation, ROW_SIZE), ownPicture ? [] : plates),
    silhouette: () => (GOSPEL_GENRE.test(genres) ? [] : windowSlots(lane, intent, seed, ownPicture ? [] : pickLibrary(from(), wanted, song, generation, ROW_SIZE), ownPicture ? [] : plates, dealSilhouette(seed, TYPE_ALLOW[lane], isSkullStyle(profile.creator.style?.name ?? '')))),
    pulise: () => puliseSlots(lane, intent, seed, turn),
    dust: () => dustSlots(lane, intent, seed, turn, cover?.hue),
  }[row]();
  // The template's own reel, once there are two or more pictures to edit. The shelf shows one card per template (the lead, after
  // learning has put its favourite first); the others are edited from the same pictures, each opening on another.
  const reel = directedRow && !ownPicture ? footageReel(pool, footage(), wanted, song, generation, place, directed.length, deal.seen) : [];
  const ordered = isTreatmentId(row) && (TREATMENT_LEAD[row] || TREATMENT_ROTATES.includes(row)) ? slots : learnedLead(slots, cardsInLane(learning, lane, row), seed);
  const edited = reel.length < 2 ? ordered : ordered.map((slot, index) => reeled(slot, reel, index));
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
  return grade && !UNGRADED.includes(row) ? coloured.map(slot => ({ ...slot, grade })) : coloured;
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

/** Where Riso gets its picture: library photos that have a cut-out or library clips, else our approved photos. */
type PhotoSources = { plateIds: readonly string[]; libraryIds: readonly string[] };

/** With more photos the seed deals a different one to each card; with none the card waits for the person's own. Library photos come first. */
function dealt({ plateIds, libraryIds }: PhotoSources, seed: string, index: number): { plateId?: string; libraryId?: string } {
  if (libraryIds.length) return { libraryId: seededOrder(libraryIds, seed, id => id)[index % libraryIds.length] };
  if (!plateIds.length) return {};
  return { plateId: seededOrder(plateIds, seed, id => id)[index % plateIds.length] };
}

/** Four Dust cards: the lyrics alone, made of dust, each card in its own two colours and its own heavy capital face. */
function dustSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, turn: Turn, coverHue: number | null | undefined): CreativesPackSlot[] {
  const faces = dealFaces(lane, intent, seed, turn, 'dust', HEAVY_CAPS_ROW);
  return faces.map((face, index) => ({
    ...adPunchSlot('dust', index, intent, seed, lane, 'dust', face),
    colors: cardColors(seed, index, coverHue),
  }));
}

const sentence = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;

/**
 * Four Riso cards: each its own ink set (a seeded draw, so every Refresh deals them in a new order), its own heavy
 * capital face and its own scatter of the words. Library cut-out photos or clips (or our approved photos) until the
 * person uses their own. `cutSeed` makes each card cut a video differently on the beat.
 */
function risoSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, turn: Turn, photos: PhotoSources): CreativesPackSlot[] {
  const faces = dealFaces(lane, intent, seed, turn, 'riso', HEAVY_CAPS_ROW);
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
function photographySlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, turn: Turn, effects: readonly PhotoEffect[], picks: readonly LibraryPicture[]): CreativesPackSlot[] {
  const typeOf = typeDeal(lane, turn);
  // The library is the source. Baked effects (the older, fixed looks) are only for a song nothing in the library fits, so the row is never empty.
  const cards = picks.length
    ? picks.slice(0, ROW_SIZE).map(pick => ({ pick }))
    : effects.slice(0, ROW_SIZE).map(effect => ({ effect }));
  const faces = dealFaces(lane, intent, seed, turn, 'photography', cards.map((_, index) => typeNeeds(typeOf(index))));
  const finishOf = finishDeal(lane, turn);
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
    ...finishOf(index),
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
 * Four cards of one treatment, each finished with a different variant and its own lyric type and cut (the Director edits the
 * treatment's own reel in `recommendRow`). With no library picture and no own picture the row is empty.
 */
function treatmentSlots(kind: TreatmentId, lane: MoodLane, intent: MusicIntentV1 | null, seed: string, turn: Turn, picks: readonly LibraryPicture[], ownPicture: boolean): CreativesPackSlot[] {
  const cards: (LibraryPicture | null)[] = ownPicture ? Array.from({ length: ROW_SIZE }, () => null) : picks.slice(0, ROW_SIZE);
  const variants = dealTreatments(lane, seed, cards.length, kind, turn.at);
  if (!cards.length || variants.length !== cards.length) return [];
  const typeOf = typeDeal(lane, turn);
  const faces = dealFaces(lane, intent, seed, turn, kind, cards.map((_, index) => typeNeeds(typeOf(index))));
  const finishOf = finishDeal(lane, turn);
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
      ...finishOf(index),
      treatment: kind,
      treatmentVariant: variant,
      cutSeed: hashPick(seed, 'cut', 250_000) * 4 + index,
    };
  });
}

function lookSlots(family: LookFamily, lane: MoodLane, intent: MusicIntentV1 | null, seed: string, turn: Turn, picks: readonly LibraryPicture[], ownPicture: boolean): CreativesPackSlot[] {
  const row: ShelfRow = family;
  const cards: (LibraryPicture | null)[] = ownPicture ? Array.from({ length: ROW_SIZE }, () => null) : picks.slice(0, ROW_SIZE);
  const looks = dealLooks(lane, cards.length, family);
  if (!cards.length || looks.some(look => !look)) return [];
  const typeOf = typeDeal(lane, turn);
  const faces = dealFaces(lane, intent, seed, turn, row, cards.map((_, index) => typeNeeds(typeOf(index))));
  const finishOf = finishDeal(lane, turn);
  const hand = hashPick(seed, 'gen', 997).toString(36);
  return cards.map((pick, index) => ({
    ...adPunchSlot('filter', index, intent, seed, lane, row, faces[index]),
    id: `ad-${family}-${pick?.id ?? `own${index}`}-${hand}`,
    label: pick ? [pick.tags[0] ?? pick.attitudes[0] ?? 'Our library', liveLookTitle(looks[index]!)].join(' · ') : liveLookTitle(looks[index]!),
    reason: pick ? `${lane} · library · ${pick.attitudes.join('+')} · ${typeOf(index)} · ${looks[index]}` : `${lane} · own picture · ${typeOf(index)} · ${looks[index]}`,
    ...(pick ? { libraryId: pick.id } : {}),
    typeStyle: typeOf(index),
    ...finishOf(index),
    look: looks[index]!,
    cutSeed: hashPick(seed, 'cut', 250_000) * 4 + index,
  }));
}

/** Four Pulise cards: each its own face, each opening on a different colour. */
function puliseSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, turn: Turn): CreativesPackSlot[] {
  const faces = dealFaces(lane, intent, seed, turn, 'pulise', HEAVY_CAPS_ROW);
  return faces.map((face, index) => {
    const slot = adPunchSlot('pulise', index, intent, seed, lane, 'pulise', face);
    return { ...slot, layout: { ...slot.layout, cut: index } };
  });
}
