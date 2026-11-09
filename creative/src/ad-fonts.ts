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
import type { IntentVibe } from './music-intent';

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

export function pickLayoutSeed(seed: string, salt: string) {
  return {
    rotate: (hashPick(seed, `rot:${salt}`, 1000) / 1000 - 0.5) * 0.08,
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
