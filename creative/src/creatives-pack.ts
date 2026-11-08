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
import { laneFromLyrics, lyricMood } from './lyric-mood';
import { TYPE_STYLES, type TypeStyleId } from './pack-type';

type BankLook = { slug: string; title: string; mood: string; tone: 'bright' | 'deep'; lanes: readonly string[] };
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
};

function hashPick(seed: string, salt: string, modulo: number) {
  let h = 2166136261;
  const text = `${seed}:${salt}`;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h) % Math.max(1, modulo);
}

function intentTags(intent: MusicIntentV1 | null): string[] {
  if (!intent) return ['balanced'];
  const tags = [intent.treatmentHint, intent.cutRate, intent.vibe.toLowerCase()];
  if (/aggressive|industrial/i.test(intent.vibe)) tags.push('aggressive', 'kinetic', 'high');
  if (/uplifting|energetic/i.test(intent.vibe)) tags.push('uplifting', 'kinetic', 'saturated');
  if (/ambient|mellow/i.test(intent.vibe)) tags.push('ambient', 'mellow', 'restrained');
  if (/dark|cinematic/i.test(intent.vibe)) tags.push('cinematic', 'dark', 'balanced');
  return tags;
}

function scoreTags(itemTags: string[], wanted: string[]) {
  return itemTags.reduce((sum, tag) => sum + (wanted.includes(tag) ? 1 : 0), 0);
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
 * Mood → plate. Slam family on shelf; riso/noir parked.
 * Font/color/motion are NOT random templates — picked from lane banks in adPunchSlot.
 */
/** Photo treatments first — brain ranks which graphic worlds sit on the cleared still. */
const LANE_ALLOW: Record<MoodLane, readonly AdPunchStyle[]> = {
  party: ['pulse', 'oil', 'riso', 'paper-cutout', 'slam-flash', 'pulse-beast', 'slam-split', 'slam'],
  techno: ['pulse', 'noir', 'oil', 'riso', 'slam-flash', 'pulse-scratch', 'slam', 'slam-split'],
  quiet: ['oil', 'noir', 'lyric-hold', 'paper-cutout', 'riso', 'slam-rise', 'pulse', 'slam'],
  gospel: ['oil', 'paper-cutout', 'riso', 'lyric-hold', 'slam-rise', 'pulse', 'noir', 'slam'],
  dark: ['noir', 'oil', 'pulse-scratch', 'pulse', 'slam-split', 'riso', 'paper-cutout', 'lyric-hold'],
  general: ['pulse', 'oil', 'noir', 'paper-cutout', 'riso', 'slam', 'slam-flash', 'lyric-hold'],
};

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

function seededOrder<T>(items: readonly T[], seed: string, key: (item: T) => string): T[] {
  return [...items].sort((a, b) => hashPick(seed, key(a), 99991) - hashPick(seed, key(b), 99991));
}

/** 8 cards: distinct (background, type) pairs, rotated by seed so no two generations look alike. */
function bankSlots(
  lane: MoodLane,
  themeLabel: string,
  intent: MusicIntentV1 | null,
  seed: string,
  count: number,
): CreativesPackSlot[] {
  let looks = BANK_LOOKS.filter(look => look.lanes.includes(lane));
  if (!looks.length) looks = BANK_LOOKS.filter(look => look.lanes.includes('general'));
  // A sad or angry song never sits on a sunny background ("match" policy).
  if (themeLabel === 'sorrow' || themeLabel === 'rage') {
    const deep = looks.filter(look => look.tone === 'deep');
    if (deep.length >= 3) looks = deep;
  }
  const backgrounds = seededOrder(looks, seed, look => look.slug);
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
      reason: `${lane} · lyrics ${themeLabel} · ${look.title} · ${type}`,
      bankId: look.slug,
      typeStyle: type,
    };
  });
}

function pickAdPunchStyles(intent: MusicIntentV1 | null, genre: string, seed: string): AdPunchStyle[] {
  const lane = moodLane(intent, genre);
  const order = LANE_ALLOW[lane];
  const allowed = new Set(order);
  const wanted = intentTags(intent);
  const rank = (id: AdPunchStyle) => {
    const idx = order.indexOf(id);
    return idx < 0 ? 999 : idx;
  };
  return [...AD_PUNCH_META]
    .filter(item => allowed.has(item.id))
    .sort((a, b) => {
      const laneDiff = rank(a.id) - rank(b.id);
      if (laneDiff) return laneDiff;
      const diff = scoreTags(b.tags, wanted) - scoreTags(a.tags, wanted);
      if (diff) return diff;
      return hashPick(seed, a.id, 997) - hashPick(seed, b.id, 997);
    })
    .map(item => item.id);
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

export function recommendCreativesPack(profile: CreativeProfileV1, generation = 0): CreativesPackSlot[] {
  const analysis = profile.musicAnalysis.status === 'ready' ? profile.musicAnalysis.result : null;
  const intent = analysis ? deriveMusicIntent(analysis) : null;
  const genre = profile.creator.primaryGenre.value || '';
  const mood = lyricMood(profile.approvedLyrics?.cues ?? [], profile.approvedLyrics?.language);
  const genreLocked = GOSPEL_GENRE.test(genre.toLowerCase()) || CLUB_GENRE.test(genre.toLowerCase());
  const lane = laneFromLyrics(moodLane(intent, genre), genreLocked, mood);
  const seed = `${profile.clip.sourceSha256}:${profile.videoType}:${generation}:${lane}`;

  const withPhoto = NOIR_LANES.includes(lane);
  const slots = bankSlots(lane, mood.theme, intent, seed, withPhoto ? 7 : 8);
  if (withPhoto) slots.push(adPunchSlot('noir', slots.length, intent, seed, lane));
  return slots;
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
