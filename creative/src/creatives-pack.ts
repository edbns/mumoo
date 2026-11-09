import type { CreativeProfileV1 } from './creative-profile';
import type { PictureUse } from './uploads';
import { deriveMusicIntent, type MusicIntentV1 } from './music-intent';
import {
  fontsForLane,
  pickLayoutSeed,
  pickPackFont,
  pickSecondaryFont,
  type AdFont,
  type AdLayout,
  type MoodLane,
} from './ad-fonts';
import { STYLE_NAMES, type AdPunchStyle } from './ad-punch';
import { dustColors, type DustColors } from './dust-colors';
import { PHOTO_FILTERS, PHOTO_FILTER_NAMES, type PhotoFilterId } from './pack-filter';
import bankData from './look-lab/bank.json';
import { laneFromMeaning, leansDeep, type LyricMeaning } from './lyric-meaning';
import { moodGrade, type MoodGrade } from './mood-grade';
import { TYPE_STYLES, type TypeStyleId } from './pack-type';
import { attitudeFit, coverFit, diversify, hasFeel, type LookRead } from './look-fit';
import type { CoverRead } from './cover-palette';
import { puliseLooks, type PuliseLook } from './pulise-look';

type BankLook = { slug: string; title: string; mood: string; tone: 'bright' | 'deep'; lanes: readonly string[]; read: LookRead };
const BANK_LOOKS = bankData as BankLook[];

export type PackFamily = 'ad_punch';

export type ShelfRow = 'photography' | 'looks' | 'pulise' | 'dust';

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
  { id: 'looks', title: 'Moving backgrounds', lyrics: 'switch' },
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
  /** Dust and Filter: the two colours of this card. */
  colors?: DustColors;
  /** Dust and Filter: the approved photo this card is drawn from, until the person uses their own. */
  plateId?: string;
  /** Filter: which arrangement of the person's video or GIF this card plays (its cut speed follows the card's place). */
  cutSeed?: number;
  /** Filter: how the person's photo is treated. */
  filter?: PhotoFilterId;
  /** Look Bank card: Shaders Pro background id + lyric type style, both chosen by the brain. */
  bankId?: string;
  typeStyle?: TypeStyleId;
  /** Pulise: the neon set of this card. */
  pulise?: PuliseLook;
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
const CLUB_GENRE = /techno|house|slap|edm|trance|electro|rave|drum|bass|dnb|dubstep|dance|club|garage|hardstyle/;

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
const TYPE_ALLOW: Record<MoodLane, readonly TypeStyleId[]> = {
  gospel: ['editorial', 'minimal', 'typewriter', 'karaoke'],
  quiet: ['minimal', 'editorial', 'typewriter', 'karaoke'],
  dark: ['typewriter', 'outline', 'minimal', 'editorial'],
  techno: ['stack', 'outline', 'karaoke', 'typewriter'],
  party: ['stack', 'karaoke', 'outline', 'typewriter'],
  general: ['karaoke', 'stack', 'editorial', 'typewriter', 'minimal', 'outline'],
};

const SOFT_FONTS: readonly AdFont[] = ['Abril Fatface', 'Oswald', 'Bebas Neue'];

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
  return pairs.map(({ look, type }, index) => bankCard(look.slug, look.title, type, index, lane, meaning, intent, seed));
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
): CreativesPackSlot {
  const base = adPunchSlot('bank', index, intent, seed, lane, 'looks');
  // Calm songs never get techy faces: the display font comes from a soft bank.
  const soft = lane === 'gospel' || lane === 'quiet' ? seededOrder(SOFT_FONTS, `${seed}:${index}`, font => font) : null;
  return {
    ...base,
    ...(soft ? { font: soft[0], fontSecondary: soft[1] } : {}),
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
): CreativesPackSlot {
  const salt = `${style}:${index}`;
  const bank = fontsForLane(lane);
  const font = pickPackFont(lane, intent?.vibe ?? null, seed, salt);
  const fontSecondary = pickSecondaryFont(font, seed, salt, bank);
  return {
    id: `ad-${style}-${index}-${hashPick(seed, 'gen', 997).toString(36)}-${hashPick(seed, salt, 0xffff).toString(16)}`,
    family: 'ad_punch',
    row,
    label: STYLE_NAMES[style],
    reason: intent ? `${lane} · ${intent.vibe} · ${font} · ${STYLE_NAMES[style]}` : `${lane} · ${font} · ${STYLE_NAMES[style]}`,
    style,
    font,
    fontSecondary,
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
  const genreLocked = GOSPEL_GENRE.test(genre.toLowerCase()) || CLUB_GENRE.test(genre.toLowerCase());
  const lane = laneFromMeaning(moodLane(intent, genre), genreLocked, meaning);
  return { intent, genre, language, meaning, lane };
}

/** An approved photo; `cutout` says it also has the mask Dust needs. */
export type PlateRef = { id: string; cutout: boolean };

/**
 * One row of the shelf for this song. `generation` is that row's own Refresh count. `plates` are the approved
 * photos Our photography and Dust are drawn from (the person's own picture, if any, replaces them in the app).
 */
export function recommendRow(row: ShelfRow, profile: CreativeProfileV1, generation: number, plates: readonly PlateRef[] = []): CreativesPackSlot[] {
  const { intent, meaning, lane } = readSong(profile);
  const cover = profile.creator.cover?.value ?? null;
  const seed = `${profile.clip.sourceSha256}:${generation}:${lane}:${row}`;
  const slots = {
    photography: () => photographySlots(lane, intent, seed, cover?.hue, plates.map(plate => plate.id)),
    looks: () => bankSlots(lane, meaning, intent, seed, ROW_SIZE, cover),
    pulise: () => puliseSlots(lane, intent, seed),
    dust: () => dustSlots(lane, intent, seed, cover?.hue, plates.filter(plate => plate.cutout).map(plate => plate.id)),
  }[row]();
  const grade = moodGrade(meaning);
  return grade ? slots.map(slot => ({ ...slot, grade })) : slots;
}

/** Colours for card `index` of a Dust or Filter row; when the cover has a colour, the first two cards grow from it. */
function cardColors(seed: string, index: number, coverHue: number | null | undefined) {
  return dustColors(hashPick(seed, `colors:${index}`, 1_000_000), coverHue != null && index < 2 ? coverHue : undefined);
}

/** With more approved photos the seed deals a different one to each card; with none the card waits for the person's own. */
function dealt(plateIds: readonly string[], seed: string, index: number): { plateId?: string } {
  if (!plateIds.length) return {};
  return { plateId: seededOrder(plateIds, seed, id => id)[index % plateIds.length] };
}

function dustSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, coverHue: number | null | undefined, plateIds: readonly string[]): CreativesPackSlot[] {
  return Array.from({ length: ROW_SIZE }, (_, index) => ({
    ...adPunchSlot('dust', index, intent, seed, lane, 'dust'),
    colors: cardColors(seed, index, coverHue),
    ...dealt(plateIds, seed, index),
  }));
}

/** Our photography: an approved photo (or the person's own) through four treatments. */
function photographySlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string, coverHue: number | null | undefined, plateIds: readonly string[]): CreativesPackSlot[] {
  const types = seededOrder(TYPE_ALLOW[lane].filter(id => TYPE_STYLES.includes(id)), `${seed}:filter`, id => id);
  return PHOTO_FILTERS.map((filter, index) => ({
    ...adPunchSlot('filter', index, intent, seed, lane, 'photography'),
    id: `ad-filter-${filter}-${hashPick(seed, 'gen', 997).toString(36)}`,
    label: PHOTO_FILTER_NAMES[filter],
    filter,
    colors: cardColors(seed, index, coverHue),
    typeStyle: types[index % types.length],
    cutSeed: hashPick(seed, 'cut', 250_000) * 4 + index,
    ...dealt(plateIds, seed, index),
  }));
}

/** Four Pulise cards: each its own face and neon set, and each opening on a different colour. */
function puliseSlots(lane: MoodLane, intent: MusicIntentV1 | null, seed: string): CreativesPackSlot[] {
  const faces = seededOrder(fontsForLane(lane), seed, font => font);
  const looks = puliseLooks(seed, ROW_SIZE);
  return looks.map((pulise, index) => {
    const slot = adPunchSlot('pulise', index, intent, seed, lane, 'pulise');
    const font = faces[index % faces.length];
    return {
      ...slot,
      font,
      fontSecondary: pickSecondaryFont(font, seed, `pulise:${index}`, fontsForLane(lane)),
      layout: { ...slot.layout, cut: index },
      pulise,
      label: `Pulise · ${pulise.neon[0].toUpperCase()}${pulise.neon.slice(1)}`,
      reason: `${lane} · ${pulise.neon}`,
    };
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
