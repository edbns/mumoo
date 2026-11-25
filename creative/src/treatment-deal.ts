/**
 * Video treatments: one creative finish over the Director's finished reel (never a new cut or new pictures).
 * Each treatment is its own shelf row; each row deals four variants so the cards differ. This file is only the
 * list and the deal (no drawing): pack-treatment.ts draws them.
 */
import type { MoodLane } from './ad-fonts';

export const TREATMENT_IDS = [
  'triptych',
  'fisheye',
  'collage',
  'frame',
  'bento',
  'grain',
  'double',
  'sideways',
  'typewriter',
  'broken',
  'screenshot',
  'stutter',
] as const;
export type TreatmentId = (typeof TREATMENT_IDS)[number];
export const isTreatmentId = (value: unknown): value is TreatmentId =>
  TREATMENT_IDS.includes(value as TreatmentId);

/** One variant of a treatment: its id is what the card, the worker and Learning keep. */
export type TreatmentVariant = { id: string; title: string };

export type TreatmentDef = {
  id: TreatmentId;
  title: string;
  /** Its finishes, so a Refresh deals cards that look different; a treatment with one finish deals it on every card. */
  variants: readonly [TreatmentVariant, ...TreatmentVariant[]];
  /** Variants no longer dealt, still drawn so cards made with them render. */
  retired?: readonly string[];
};

export const TREATMENTS: readonly TreatmentDef[] = [
  {
    id: 'triptych',
    title: 'Triptych',
    variants: [
      { id: 'narrow', title: 'Slim gap' },
      { id: 'medium', title: 'Clear gap' },
      { id: 'wide', title: 'Wide gap' },
      { id: 'breathing', title: 'Even gap' },
    ],
  },
  {
    id: 'fisheye',
    title: 'Fisheye',
    variants: [
      { id: 'subtle', title: 'Gentle lens' },
      { id: 'medium', title: 'Round lens' },
      { id: 'strong', title: 'Strong lens' },
      { id: 'extreme', title: 'Peephole' },
    ],
  },
  {
    id: 'collage',
    title: 'Collage',
    variants: [
      { id: 'editorial', title: 'Editorial' },
      { id: 'scatter', title: 'Scattered' },
      { id: 'stack', title: 'Stacked prints' },
      { id: 'offset', title: 'Cut-outs' },
    ],
  },
  {
    id: 'frame',
    title: 'Colored Frame',
    variants: [
      { id: 'slim', title: 'Black' },
      { id: 'bold', title: 'White' },
      { id: 'accent', title: 'Black wide' },
      { id: 'ink', title: 'White wide' },
    ],
  },
  {
    id: 'bento',
    title: 'Bento Grid',
    variants: [
      { id: 'hero-left', title: 'Hero left' },
      { id: 'hero-top', title: 'Hero top' },
      { id: 'mosaic', title: 'Mosaic' },
      { id: 'strip', title: 'Strip' },
    ],
  },
  {
    id: 'grain',
    title: 'Film Grain',
    variants: [
      { id: 'fine', title: 'Faded' },
      { id: 'classic', title: 'Home movie' },
      { id: 'heavy', title: 'Old reel' },
      { id: 'halation', title: 'Warm glow' },
    ],
  },
  {
    id: 'double',
    title: 'Double Exposure',
    variants: [
      { id: 'blend', title: 'Soft blend' },
      { id: 'screen', title: 'Mirrored' },
      { id: 'offset-cut', title: 'Shifted' },
      { id: 'offset-far', title: 'Close-up' },
    ],
  },
  {
    id: 'sideways',
    title: 'Sideways',
    // Only the whole upright picture between blurred sides: cut to a landscape shape, a portrait video loses the head.
    variants: [{ id: 'pillar', title: 'Blurred sides' }],
  },
  {
    id: 'typewriter',
    title: 'Typewriter',
    variants: [
      { id: 'newsprint', title: 'Black ink' },
      { id: 'red-ink', title: 'Red ink' },
      { id: 'yellow-ink', title: 'Yellow ink' },
      { id: 'purple-ink', title: 'Purple ink' },
    ],
    retired: ['letter', 'faded', 'yellowed'],
  },
  {
    id: 'broken',
    title: 'Broken Screen',
    variants: [
      { id: 'shatter', title: 'Shattered' },
      { id: 'corner', title: 'Corner hit' },
      { id: 'spider', title: 'Spider web' },
      { id: 'pixels', title: 'Dead pixels' },
    ],
  },
  {
    id: 'screenshot',
    title: 'Screenshot',
    variants: [
      { id: 'light-black', title: 'Black crayon' },
      { id: 'light-white', title: 'White crayon' },
      { id: 'dark-white', title: 'Dark chat' },
      { id: 'screen', title: 'Full screen' },
    ],
  },
  {
    id: 'stutter',
    title: 'Stutter',
    variants: [
      { id: 'bar', title: 'Bar stutter' },
      { id: 'beat', title: 'Beat stutter' },
      { id: 'roll', title: 'Roll' },
      { id: 'flash', title: 'Flash' },
    ],
  },
];

/** The variant a row always opens on, whatever the hand or Learning: the look the artist chose as the template's own. */
export const TREATMENT_LEAD: Partial<Record<TreatmentId, string>> = { screenshot: 'screen' };

const BY_ID = new Map(TREATMENTS.map(entry => [entry.id, entry]));

export const treatmentTitle = (id: TreatmentId) => BY_ID.get(id)!.title;
export const treatmentVariants = (id: TreatmentId) => BY_ID.get(id)!.variants;
export const isTreatmentVariant = (id: TreatmentId, variant: string) =>
  (BY_ID.get(id)?.variants.some(entry => entry.id === variant) || BY_ID.get(id)?.retired?.includes(variant)) ?? false;

/**
 * Treatments whose variants take turns leading the row, one more on every Refresh, whatever Learning says: their variants
 * differ only in colour, so a Refresh must always show the next one.
 */
export const TREATMENT_ROTATES: readonly TreatmentId[] = ['typewriter'];

function hashPick(seed: string, salt: string, modulo: number) {
  let h = 2166136261;
  const text = `${seed}:${salt}`;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h) % Math.max(1, modulo);
}

/**
 * Four variants of one treatment for a row: a seeded order so Refresh deals a new hand, never the same variant
 * twice in one hand. Lane is unused today (every treatment welcomes every lane) but kept so a later filter can
 * lean on mood the same way live looks do.
 */
export function dealTreatments(_lane: MoodLane, seed: string, count: number, kind: TreatmentId, turnAt = 0): string[] {
  const variants = [...treatmentVariants(kind)];
  if (TREATMENT_ROTATES.includes(kind)) return Array.from({ length: count }, (_, index) => variants[(turnAt + index) % variants.length].id);
  const lead = TREATMENT_LEAD[kind];
  const ordered = variants.sort((a, b) => Number(b.id === lead) - Number(a.id === lead) || hashPick(seed, a.id, 99991) - hashPick(seed, b.id, 99991));
  return Array.from({ length: count }, (_, index) => ordered[index % ordered.length].id);
}
