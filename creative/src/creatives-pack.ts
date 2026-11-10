import type { CreativeProfileV1 } from './creative-profile';
import type { PictureUse } from './uploads';
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
import { dealWindow, type WindowMode, type WindowOwn } from './window-deal';
import bankData from './look-lab/bank.json';
import effectsData from '../punch-plates/effects/effects.json';
import { laneFromMeaning, leansDeep, type LyricMeaning } from './lyric-meaning';
import { moodGrade, type MoodGrade } from './mood-grade';
import { TYPE_STYLES, typeNeeds, type TypeStyleId } from './pack-type';
import { attitudeFit, coverFit, diversify, hasFeel, type LookRead } from './look-fit';
import type { CoverRead } from './cover-palette';

type BankLook = { slug: string; title: string; mood: string; tone: 'bright' | 'deep'; lanes: readonly string[]; read: LookRead };
const BANK_LOOKS = bankData as BankLook[];

/** One of our approved photo with a Shaders Pro image effect baked on it (punch-plates/effects), as measured when it was baked. */
type PhotoEffect = { id: string; title: string; collection: string; mood: string; lightness: number; saturation: number; warmth: number; palette: { hex: string; share: number }[] };
const PHOTO_EFFECTS = effectsData as PhotoEffect[];

export type PackFamily = 'ad_punch';

/** Every row that can be dealt. 'looks' (Moving backgrounds) is dealt but not on the shelf: see SHELF_ROWS. */
export type ShelfRow = 'photography' | 'looks' | 'riso' | 'spray' | 'window' | 'pulise' | 'dust';

/**
 * The shelf is rows of four. A row is a kind of creative, and it owns its controls so that changing one row
 * never redraws (or re-renders) another:
 *   lyrics  'switch': the row has its own Lyrics on/off. 'always': made of the lyrics, so there is no switch.
 *   upload  the row shows our approved photography, and the person can use their own picture instead (kept for this use).
 * Every row has its own Refresh.
 */
export type ShelfRowDef = { id: ShelfRow; title: string; lyrics: 'switch' | 'always'; upload?: PictureUse };
export const SHELF_ROWS: readonly ShelfRowDef[] = [
  { id: 'photography', title: 'Our photography', lyrics: 'switch', upload: 'filter' },
  { id: 'riso', title: 'Riso', lyrics: 'switch', upload: 'riso' },
  { id: 'spray', title: 'Spray', lyrics: 'always' },
  { id: 'window', title: 'Window', lyrics: 'always', upload: 'window' },
  // "Moving backgrounds" (id 'looks', the Shaders backgrounds under lyric type) is off the shelf until its backgrounds are good enough.
  // To bring it back, add { id: 'looks', title: 'Moving backgrounds', lyrics: 'switch' } here.
  { id: 'pulise', title: 'Pulise', lyrics: 'always' },
  { id: 'dust', title: 'Dust', lyrics: 'switch', upload: 'dust' },
];
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
  /** Our photography and Window: which arrangement of the person's video or GIF this card plays (its cut speed follows the card's place). */
  cutSeed?: number;
  /** Our photography: the baked effect on our approved photo (`punch-plates/effects/{id}.jpg`), until the person uses their own picture. */
  effectId?: string;
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
const UNGRADED: readonly ShelfRow[] = ['riso', 'spray', 'window'];

/**
 * One row of the shelf for this song. `generation` is that row's own Refresh count. `plates` are the approved
 * photos Dust, Riso and Window are drawn from (the person's own picture, if any, replaces them in the app); `own` is
 * what is known of the person's own picture for Window, which is dealt from it instead of ours.
 */
export function recommendRow(row: ShelfRow, profile: CreativeProfileV1, generation: number, plates: readonly PlateRef[] = [], own: WindowOwn | null = null): CreativesPackSlot[] {
  const { intent, meaning, lane } = readSong(profile);
  const cover = profile.creator.cover?.value ?? null;
  const seed = `${profile.clip.sourceSha256}:${generation}:${lane}:${row}`;
  const cutOutPlates = plates.filter(plate => plate.cutout).map(plate => plate.id);
  const slots = {
    photography: () => photographySlots(lane, intent, seed, dealEffects(lane, meaning, cover, `${profile.clip.sourceSha256}:${lane}`, generation)),
    looks: () => bankSlots(lane, meaning, intent, seed, ROW_SIZE, cover),
    riso: () => risoSlots(lane, intent, seed, cutOutPlates),
    spray: () => spraySlots(lane, intent, seed),
    window: () => windowSlots(lane, intent, seed, plates, own),
    pulise: () => puliseSlots(lane, intent, seed),
    dust: () => dustSlots(lane, intent, seed, cover?.hue, cutOutPlates),
  }[row]();
  const grade = moodGrade(meaning);
  return grade && !UNGRADED.includes(row) ? slots.map(slot => ({ ...slot, grade })) : slots;
}

/** Colours for card `index` of a Dust row; when the cover has a colour, the first two cards grow from it. */
function cardColors(seed: string, index: number, coverHue: number | null | undefined) {
  return dustColors(hashPick(seed, `colors:${index}`, 1_000_000), coverHue != null && index < 2 ? coverHue : undefined);
}

/** With more approved photos the seed deals a different one to each Dust card; with none the card waits for the person's own. */
function dealt(plateIds: readonly string[], seed: string, index: number): { plateId?: string } {
  if (!plateIds.length) return {};
  return { plateId: seededOrder(plateIds, seed, id => id)[index % plateIds.length] };
}

function dustSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, coverHue: number | null | undefined, plateIds: readonly string[]): CreativesPackSlot[] {
  const faces = dealFaces(lane, intent, seed, 'dust', HEAVY_CAPS_ROW);
  return faces.map((face, index) => ({
    ...adPunchSlot('dust', index, intent, seed, lane, 'dust', face),
    colors: cardColors(seed, index, coverHue),
    ...dealt(plateIds, seed, index),
  }));
}

const sentence = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;

/**
 * Four Riso cards: each its own ink set (a seeded draw, so every Refresh deals them in a new order), its own heavy
 * capital face and its own scatter of the words. The photo is ours (dealt like Dust's) until the person uses their own.
 */
function risoSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, plateIds: readonly string[]): CreativesPackSlot[] {
  const faces = dealFaces(lane, intent, seed, 'riso', HEAVY_CAPS_ROW);
  const sets = seededOrder(RISO_INK_SETS, seed, set => set.id);
  return faces.map((face, index) => ({
    ...adPunchSlot('riso', index, intent, seed, lane, 'riso', face),
    label: sentence(sets[index].name),
    inkSet: sets[index].id,
    ...dealt(plateIds, seed, index),
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

/** Four Window cards, mixing kinds of picture, screen colours and condensed faces by the seed (see window-deal.ts). Every card is made of the lyrics. */
function windowSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, plates: readonly PlateRef[], own: WindowOwn | null): CreativesPackSlot[] {
  return dealWindow(seed, plates, own).map((card, index) => ({
    // Window sets one face of type: the second is the same, so nothing else is asked of the worker.
    ...adPunchSlot('window', index, intent, seed, lane, 'window', { font: card.font, fontSecondary: card.font }),
    label: sentence(card.palette.replace('-', ' ')),
    reason: `${lane} · ${card.mode} · ${card.palette} · ${card.font}`,
    windowMode: card.mode,
    windowPalette: card.palette,
    windowAllowed: card.allowed,
    ...(card.plateId ? { plateId: card.plateId } : {}),
    ...(card.effectId ? { effectId: card.effectId } : {}),
    ...(card.bankId ? { bankId: card.bankId } : {}),
    // A video or GIF of the person's own is cut differently for each card.
    ...(own?.clip ? { cutSeed: hashPick(seed, 'cut', 250_000) * 4 + index } : {}),
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

/** Our photography: our approved photo (or the person's own) as four different baked effects, each with its own lyric type. */
function photographySlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, effects: readonly PhotoEffect[]): CreativesPackSlot[] {
  const types = seededOrder(TYPE_ALLOW[lane].filter(id => TYPE_STYLES.includes(id)), `${seed}:filter`, id => id);
  const typeOf = (index: number) => types[index % types.length];
  const faces = dealFaces(lane, intent, seed, 'photography', effects.map((_, index) => typeNeeds(typeOf(index))));
  return effects.map((effect, index) => ({
    ...adPunchSlot('filter', index, intent, seed, lane, 'photography', faces[index]),
    id: `ad-photography-${effect.id}-${hashPick(seed, 'gen', 997).toString(36)}`,
    label: effect.title,
    reason: `${lane} · ${effect.mood} · ${effect.title} · ${typeOf(index)}`,
    effectId: effect.id,
    typeStyle: typeOf(index),
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
