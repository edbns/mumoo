import '@fontsource-variable/inter';
import '@fontsource/dela-gothic-one/latin-400.css';
import '@fontsource/abril-fatface/latin-400.css';
import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource/audiowide/latin-400.css';
import '@fontsource/anton/latin-400.css';
import '@fontsource/archivo-black/latin-400.css';
import '@fontsource/oswald/latin-400.css';
import '@fontsource/rubik-mono-one/latin-400.css';
import '@fontsource/space-mono/latin-700.css';
import '@fontsource/outfit/latin-400.css';
import '@fontsource/playfair-display/latin-700-italic.css';
import type { IntentVibe, MusicIntentV1 } from './music-intent';

export const AD_FONTS = [
  'Dela Gothic One',
  'Abril Fatface',
  'Bebas Neue',
  'Audiowide',
  'Anton',
  'Archivo Black',
  'Oswald',
  'Rubik Mono One',
] as const;
export type AdFont = (typeof AD_FONTS)[number];

export type AdPalette = { bg: string; ink: string; accent: string; wash?: string };

export type PackMotion = 'scale' | 'slam' | 'flash' | 'rise';

export type MoodLane = 'party' | 'quiet' | 'gospel' | 'techno' | 'dark' | 'general';

/** Club / dance — never editorial serifs. */
const CLUB_FONTS: readonly AdFont[] = [
  'Anton', 'Bebas Neue', 'Audiowide', 'Rubik Mono One', 'Archivo Black', 'Dela Gothic One',
];
/** Soft / worship — readable, not newspaper carnival. */
const SOFT_FONTS: readonly AdFont[] = ['Oswald', 'Bebas Neue', 'Audiowide'];
/** Dark / cinematic — editorial allowed here only. */
const DARK_FONTS: readonly AdFont[] = ['Oswald', 'Abril Fatface', 'Bebas Neue', 'Dela Gothic One'];

const FONT_BY_VIBE: Record<IntentVibe, readonly AdFont[]> = {
  'Aggressive/Industrial': ['Dela Gothic One', 'Anton', 'Archivo Black', 'Bebas Neue'],
  'Dark/Cinematic': DARK_FONTS,
  'Uplifting/Energetic': CLUB_FONTS,
  'Ambient/Mellow': SOFT_FONTS,
};

const FONT_BY_LANE: Record<MoodLane, readonly AdFont[]> = {
  party: CLUB_FONTS,
  techno: CLUB_FONTS,
  quiet: SOFT_FONTS,
  gospel: SOFT_FONTS,
  dark: DARK_FONTS,
  general: CLUB_FONTS,
};

/** Contemporary palette bank — used by non-slam plates. */
const PALETTE_BANK: readonly AdPalette[] = [
  { bg: '#1a3d2a', ink: '#1c1208', accent: '#ff4d6d', wash: '#f2e6d4' },
  { bg: '#0d2b4a', ink: '#14100c', accent: '#ff6b2c', wash: '#efe4d0' },
  { bg: '#3a1450', ink: '#120c10', accent: '#39ff14', wash: '#f4eadc' },
  { bg: '#5a1020', ink: '#100808', accent: '#00e5ff', wash: '#f0e2d0' },
  { bg: '#1a2040', ink: '#0c0c12', accent: '#ff2bd6', wash: '#ebe0ce' },
  { bg: '#204018', ink: '#101008', accent: '#ffe600', wash: '#f5ecda' },
  { bg: '#050508', ink: '#f4f4f4', accent: '#ff0055', wash: '#120010' },
  { bg: '#06060c', ink: '#ffffff', accent: '#00f0ff', wash: '#001018' },
  { bg: '#080808', ink: '#f0f0f0', accent: '#ff3b00', wash: '#180800' },
  { bg: '#0a0a0a', ink: '#eeeeee', accent: '#c9ff00', wash: '#101800' },
  { bg: '#050510', ink: '#f7f7ff', accent: '#7b61ff', wash: '#0c0830' },
  { bg: '#1a1030', ink: '#ffffff', accent: '#ff7ab6', wash: '#4a2a80' },
  { bg: '#0c1e28', ink: '#f5fffb', accent: '#5ce1e6', wash: '#1e5a66' },
  { bg: '#201018', ink: '#fff5f8', accent: '#ff8fab', wash: '#6a3048' },
  { bg: '#101820', ink: '#eef6ff', accent: '#8ecae6', wash: '#2a4058' },
  { bg: '#181028', ink: '#f8f0ff', accent: '#c77dff', wash: '#3d2466' },
  { bg: '#f7f1e6', ink: '#141210', accent: '#e10600', wash: '#e8dcc8' },
  { bg: '#0e0e10', ink: '#f2efe8', accent: '#f4a261', wash: '#1a1814' },
  { bg: '#f4f6f8', ink: '#101418', accent: '#1d3557', wash: '#dbe3ea' },
  { bg: '#111114', ink: '#fafafa', accent: '#e63946', wash: '#1c1012' },
  { bg: '#efe8dc', ink: '#1a1410', accent: '#2a9d8f', wash: '#ddd0bc' },
  { bg: '#0a1218', ink: '#e8f4fa', accent: '#48cae4', wash: '#102028' },
];

export const RISO_PALETTE_BANK: readonly AdPalette[] = [
  { wash: '#f4ecd8', ink: '#000000', accent: '#FF48B0', bg: '#0078BF' },
  { wash: '#f2e6d4', ink: '#000000', accent: '#FF48B0', bg: '#00838A' },
  { wash: '#f5ecda', ink: '#000000', accent: '#FFE800', bg: '#000000' },
  { wash: '#efe4d0', ink: '#000000', accent: '#FF6C2F', bg: '#407060' },
  { wash: '#f0e2d0', ink: '#000000', accent: '#0078BF', bg: '#FFE800' },
  { wash: '#ebe0ce', ink: '#000000', accent: '#F65058', bg: '#3D5588' },
  { wash: '#f4eadc', ink: '#FF48B0', accent: '#FF48B0', bg: '#000000' },
  { wash: '#f2e8d6', ink: '#000000', accent: '#67B346', bg: '#FF48B0' },
  { wash: '#f6eedc', ink: '#000000', accent: '#82D8D5', bg: '#FF7477' },
  { wash: '#f3e9d2', ink: '#0078BF', accent: '#AC936E', bg: '#0078BF' },
  { wash: '#f5ecda', ink: '#000000', accent: '#FFE800', bg: '#FF48B0' },
  { wash: '#efe4d0', ink: '#00838A', accent: '#00838A', bg: '#000000' },
];

export const NOIR_PALETTE_BANK: readonly AdPalette[] = [
  { bg: '#050505', ink: '#f2f0ea', accent: '#c8c4bc', wash: '#0a0a0a' },
  { bg: '#080808', ink: '#f5f2eb', accent: '#d4cfc4', wash: '#101010' },
  { bg: '#06060a', ink: '#eceaf0', accent: '#b8b4c0', wash: '#0c0c12' },
  { bg: '#0a0806', ink: '#f6f0e6', accent: '#cfc4b0', wash: '#12100c' },
  { bg: '#040406', ink: '#f8f8f4', accent: '#a8a8a4', wash: '#09090c' },
  { bg: '#0c0a0a', ink: '#efece6', accent: '#e0d8cc', wash: '#141010' },
  { bg: '#030303', ink: '#ffffff', accent: '#9a9a9a', wash: '#080808' },
  { bg: '#0a0a0c', ink: '#f0eee8', accent: '#d8d0c0', wash: '#101014' },
];

/** Club / slap-house / party — hot saturated, never cream newspaper. */
const SLAM_CLUB: readonly AdPalette[] = [
  { bg: '#111111', ink: '#ffffff', accent: '#00f0ff', wash: '#00f0ff' },
  { bg: '#0a0a0a', ink: '#f5f5f5', accent: '#ff3b00', wash: '#ff3b00' },
  { bg: '#2b2dff', ink: '#ffffff', accent: '#ffef00', wash: '#111111' },
  { bg: '#ff2d55', ink: '#ffffff', accent: '#111111', wash: '#111111' },
  { bg: '#c8ff00', ink: '#101400', accent: '#101400', wash: '#c8ff00' },
  { bg: '#7b61ff', ink: '#ffffff', accent: '#0c0830', wash: '#0c0830' },
  { bg: '#ff6a00', ink: '#140800', accent: '#ffffff', wash: '#140800' },
  { bg: '#051018', ink: '#e8f7ff', accent: '#48cae4', wash: '#051018' },
];

const SLAM_SOFT: readonly AdPalette[] = [
  { bg: '#0c1e28', ink: '#f5fffb', accent: '#5ce1e6', wash: '#0c1e28' },
  { bg: '#1a1030', ink: '#ffffff', accent: '#ff7ab6', wash: '#1a1030' },
  { bg: '#f5f0e8', ink: '#1a1410', accent: '#e10600', wash: '#f5f0e8' },
  { bg: '#101820', ink: '#eef6ff', accent: '#8ecae6', wash: '#101820' },
  { bg: '#201018', ink: '#fff5f8', accent: '#ff8fab', wash: '#201018' },
];

const SLAM_DARK: readonly AdPalette[] = [
  { bg: '#050508', ink: '#f4f4f4', accent: '#ff0055', wash: '#050508' },
  { bg: '#06060c', ink: '#ffffff', accent: '#00f0ff', wash: '#06060c' },
  { bg: '#0a0a0a', ink: '#eeeeee', accent: '#c9ff00', wash: '#0a0a0a' },
  { bg: '#050510', ink: '#f7f7ff', accent: '#7b61ff', wash: '#050510' },
  { bg: '#080808', ink: '#f0f0f0', accent: '#ff3b00', wash: '#080808' },
];

export function hashPick(seed: string, salt: string, modulo: number) {
  let h = 2166136261;
  const text = `${seed}:${salt}`;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h) % Math.max(1, modulo);
}

export function fontsForVibe(vibe: IntentVibe | null): readonly AdFont[] {
  if (!vibe) return CLUB_FONTS;
  return FONT_BY_VIBE[vibe];
}

export function fontsForLane(lane: MoodLane): readonly AdFont[] {
  return FONT_BY_LANE[lane];
}

/**
 * Brain-locked font: lane first (genre), then vibe.
 * No escape hatch to the full bank — Slap House never gets Abril Fatface.
 */
export function pickPackFont(lane: MoodLane, vibe: IntentVibe | null, seed: string, salt: string): AdFont {
  const laneFonts = fontsForLane(lane);
  // Lane always wins for club genres; vibe only narrows within lane when overlapping.
  const vibeFonts = vibe ? fontsForVibe(vibe) : laneFonts;
  const overlap = laneFonts.filter(f => vibeFonts.includes(f));
  const bank = overlap.length ? overlap : laneFonts;
  return bank[hashPick(seed, `pack-font:${salt}`, bank.length)];
}

export function pickSecondaryFont(primary: AdFont, seed: string, salt: string, bank?: readonly AdFont[]): AdFont {
  const pool = (bank ?? AD_FONTS).filter(font => font !== primary);
  if (!pool.length) return primary;
  return pool[hashPick(seed, `font2:${salt}`, pool.length)];
}

export function pickAdPalette(vibe: IntentVibe | null, seed: string, salt: string): AdPalette {
  let start = 0;
  let span = PALETTE_BANK.length;
  if (vibe === 'Aggressive/Industrial') { start = 6; span = 5; }
  else if (vibe === 'Dark/Cinematic') { start = 6; span = 8; }
  else if (vibe === 'Uplifting/Energetic') { start = 6; span = 10; }
  else if (vibe === 'Ambient/Mellow') { start = 11; span = 10; }
  return PALETTE_BANK[start + hashPick(seed, `palette:${salt}`, span)];
}

export function pickRisoPalette(seed: string, salt: string): AdPalette {
  return RISO_PALETTE_BANK[hashPick(seed, `riso-pal:${salt}`, RISO_PALETTE_BANK.length)];
}

export function pickNoirPalette(seed: string, salt: string): AdPalette {
  return NOIR_PALETTE_BANK[hashPick(seed, `noir-pal:${salt}`, NOIR_PALETTE_BANK.length)];
}

function slamBankForLane(lane: MoodLane): readonly AdPalette[] {
  if (lane === 'quiet' || lane === 'gospel') return SLAM_SOFT;
  if (lane === 'dark') return SLAM_DARK;
  return SLAM_CLUB; // party, techno, general
}

/** Mood-locked slam colors — club lanes never pull cream editorial. */
export function pickSlamPalette(lane: MoodLane, seed: string, salt: string): AdPalette {
  const bank = slamBankForLane(lane);
  return bank[hashPick(seed, `slam-pal:${salt}`, bank.length)];
}

/**
 * Mood decides lyric motion family.
 * Style can pin a motion; otherwise lane/intent pick — no random newspaper energy on house.
 */
export function pickPackMotion(
  lane: MoodLane,
  intent: MusicIntentV1 | null,
  style: string,
  seed: string,
  salt: string,
): PackMotion {
  if (style === 'slam-rise') return 'rise';
  if (style === 'slam-flash') return 'flash';
  if (lane === 'quiet' || lane === 'gospel') return 'rise';
  if (lane === 'dark') {
    return (['flash', 'scale'] as const)[hashPick(seed, `motion:${salt}`, 2)];
  }
  // party / techno / general — kinetic only
  const kinetic: readonly PackMotion[] =
    intent?.treatmentHint === 'restrained' ? ['scale', 'flash'] : ['slam', 'flash', 'scale'];
  return kinetic[hashPick(seed, `motion:${salt}`, kinetic.length)];
}

export function pickLayoutSeed(seed: string, salt: string) {
  return {
    driftX: (hashPick(seed, `dx:${salt}`, 1000) / 1000 - 0.5) * 60,
    driftY: (hashPick(seed, `dy:${salt}`, 1000) / 1000 - 0.5) * 90,
    rotate: (hashPick(seed, `rot:${salt}`, 1000) / 1000 - 0.5) * 0.08,
    grain: 0.06 + hashPick(seed, `grain:${salt}`, 100) / 100 * 0.12,
    scaleBias: 0.94 + hashPick(seed, `sc:${salt}`, 100) / 100 * 0.14,
    /** Which colour a Pulise card opens on (0–3), so its four cards do not all start the same. */
    cut: hashPick(seed, `cut:${salt}`, 4),
  };
}

export type AdLayout = ReturnType<typeof pickLayoutSeed>;

/** Faces used by the lyric type system (fixed per style, not part of the random font banks). */
const TYPE_FACES = ['800 120px "Inter Variable"', '700 120px "Space Mono"', '400 120px "Outfit"', 'italic 700 120px "Playfair Display"'] as const;

export async function loadDisplayFonts(text: string) {
  const sample = `${text} NOW PLAYING LYRICS 9:41`.trim() || 'MUMOO';
  await Promise.all([
    ...AD_FONTS.map(async family => {
      const fonts = await document.fonts.load(`400 120px "${family}"`, sample);
      if (!fonts.length) throw new Error(`The ${family} font could not load.`);
    }),
    ...TYPE_FACES.map(async face => {
      const fonts = await document.fonts.load(face, sample);
      if (!fonts.length) throw new Error(`The ${face} font could not load.`);
    }),
  ]);
}
