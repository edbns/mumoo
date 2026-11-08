import type { CreativeProfileV1 } from './creative-profile';
import { deriveMusicIntent, type MusicIntentV1 } from './music-intent';
import {
  fontsForLane,
  pickAdPalette,
  pickLayoutSeed,
  pickNoirPalette,
  pickPackFont,
  pickPackMotion,
  pickRisoPalette,
  pickSecondaryFont,
  pickSlamPalette,
  type AdFont,
  type AdLayout,
  type AdPalette,
  type MoodLane,
  type PackMotion,
} from './ad-fonts';
import { AD_PUNCH_META, type AdPunchStyle } from './ad-punch';
import bankData from './look-lab/bank.json';
import { laneFromMeaning, leansDeep, type LyricMeaning } from './lyric-meaning';
import { moodGrade, type MoodGrade } from './mood-grade';
import { TYPE_STYLES, type TypeStyleId } from './pack-type';
import { coverFit, diversify, type LookRead } from './look-fit';
import type { CoverRead } from './cover-palette';

type BankLook = { slug: string; title: string; mood: string; tone: 'bright' | 'deep'; lanes: readonly string[]; read: LookRead };
const BANK_LOOKS = bankData as BankLook[];

export type PackFamily = 'ad_punch';

export type CreativesPackSlot = {
  id: string;
  family: 'ad_punch';
  label: string;
  reason: string;
  style: AdPunchStyle;
  font: AdFont;
  fontSecondary: AdFont;
  palette: AdPalette;
  layout: AdLayout;
  motion: PackMotion;
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

const NOIR_LANES: readonly MoodLane[] = ['quiet', 'dark', 'techno'];

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

/** 8 cards: distinct (background, type) pairs, rotated by seed so no two generations look alike. */
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
  // With a cover, backgrounds closest to its colours lead; the seed still shuffles near-equal ones between generations.
  const ranked = cover
    ? [...looks].sort((a, b) => (coverFit(cover, b.read) + hashPick(seed, b.slug, 1000) / 4000)
      - (coverFit(cover, a.read) + hashPick(seed, a.slug, 1000) / 4000))
    : seededOrder(looks, seed, look => look.slug);
  // The cards must look different from each other: one per effect, at most two per colour family.
  // A cover is the creator's own colour identity, so it may fill more of the shelf with its family.
  const backgrounds = diversify(ranked, cover ? 4 : 2);
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
  return pairs.map(({ look, type }, index) => {
    const base = adPunchSlot('bank', index, intent, seed, lane);
    // Calm songs never get techy faces: the display font comes from a soft bank.
    const soft = lane === 'gospel' || lane === 'quiet' ? seededOrder(SOFT_FONTS, `${seed}:${index}`, font => font) : null;
    return {
      ...base,
      ...(soft ? { font: soft[0], fontSecondary: soft[1] } : {}),
      id: `ad-bank-${look.slug}-${type}-${hashPick(seed, 'gen', 997).toString(36)}`,
      label: `${type[0].toUpperCase()}${type.slice(1)} · ${look.title}`,
      reason: `${lane} · lyrics ${meaning?.attitude ?? 'unread'} · ${look.title} · ${type}`,
      bankId: look.slug,
      typeStyle: type,
    };
  });
}

function adPunchSlot(
  style: AdPunchStyle,
  index: number,
  intent: MusicIntentV1 | null,
  seed: string,
  lane: MoodLane,
): CreativesPackSlot {
  const meta = AD_PUNCH_META.find(item => item.id === style) ?? AD_PUNCH_META[0];
  const salt = `${style}:${index}`;
  const bank = fontsForLane(lane);
  const font = pickPackFont(lane, intent?.vibe ?? null, seed, salt);
  const fontSecondary = pickSecondaryFont(font, seed, salt, bank);
  const palette = meta.base === 'slam'
    ? pickSlamPalette(lane, seed, salt)
    : meta.base === 'noir'
      ? pickNoirPalette(seed, salt)
      : meta.base === 'riso'
        ? pickRisoPalette(seed, salt)
        : pickAdPalette(intent?.vibe ?? null, seed, salt);
  const layout = pickLayoutSeed(seed, salt);
  const motion = pickPackMotion(lane, intent, style, seed, salt);
  return {
    id: `ad-${style}-${index}-${hashPick(seed, 'gen', 997).toString(36)}-${hashPick(seed, salt, 0xffff).toString(16)}`,
    family: 'ad_punch',
    label: meta.name,
    reason: intent
      ? `${lane} · ${intent.vibe} · ${font} · ${motion} · ${meta.name}`
      : `${lane} · ${font} · ${motion} · ${meta.name}`,
    style,
    font,
    fontSecondary,
    palette,
    layout,
    motion,
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

export function recommendCreativesPack(profile: CreativeProfileV1, generation = 0): CreativesPackSlot[] {
  const { intent, meaning, lane } = readSong(profile);
  const cover = profile.creator.cover?.value ?? null;
  const seed = `${profile.clip.sourceSha256}:${generation}:${lane}`;

  const withPhoto = NOIR_LANES.includes(lane);
  const slots = bankSlots(lane, meaning, intent, seed, withPhoto ? 7 : 8, cover);
  if (withPhoto) slots.push(adPunchSlot('noir', slots.length, intent, seed, lane));
  const grade = moodGrade(meaning);
  return grade ? slots.map(slot => ({ ...slot, grade })) : slots;
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
