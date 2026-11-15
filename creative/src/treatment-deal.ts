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
  'kaleidoscope',
  'double',
] as const;
export type TreatmentId = (typeof TREATMENT_IDS)[number];
export const isTreatmentId = (value: unknown): value is TreatmentId =>
  TREATMENT_IDS.includes(value as TreatmentId);

/** One variant of a treatment: its id is what the card, the worker and Learning keep. */
export type TreatmentVariant = { id: string; title: string };

export type TreatmentDef = {
  id: TreatmentId;
  title: string;
  /** Four finishes so a Refresh deals four cards that look different. */
  variants: readonly [TreatmentVariant, TreatmentVariant, TreatmentVariant, TreatmentVariant];
};

export const TREATMENTS: readonly TreatmentDef[] = [
  {
    id: 'triptych',
    title: 'Triptych',
    variants: [
      { id: 'narrow', title: 'Three strips' },
      { id: 'medium', title: 'Three bands' },
      { id: 'wide', title: 'Staggered' },
      { id: 'breathing', title: 'Breathing gaps' },
    ],
  },
  {
    id: 'fisheye',
    title: 'Fisheye',
    variants: [
      { id: 'subtle', title: 'Wide lens' },
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
      { id: 'scatter', title: 'Polaroids' },
      { id: 'stack', title: 'Stacked prints' },
      { id: 'offset', title: 'Cut-outs' },
    ],
  },
  {
    id: 'frame',
    title: 'Colored Frame',
    variants: [
      { id: 'slim', title: 'Slim matte' },
      { id: 'bold', title: 'Bold matte' },
      { id: 'accent', title: 'Accent matte' },
      { id: 'ink', title: 'Ink matte' },
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
      { id: 'fine', title: 'Fine grain' },
      { id: 'classic', title: 'Classic stock' },
      { id: 'heavy', title: 'Heavy, scratched' },
      { id: 'halation', title: 'Halation' },
    ],
  },
  {
    id: 'kaleidoscope',
    title: 'Kaleidoscope',
    variants: [
      { id: 'four', title: 'Fourfold' },
      { id: 'six', title: 'Sixfold' },
      { id: 'eight', title: 'Eightfold' },
      { id: 'twelve', title: 'Twelvefold' },
    ],
  },
  {
    id: 'double',
    title: 'Double Exposure',
    variants: [
      { id: 'blend', title: 'Soft blend' },
      { id: 'screen', title: 'Mirrored' },
      { id: 'offset-cut', title: 'Later cut' },
      { id: 'offset-far', title: 'Far cut' },
    ],
  },
];

const BY_ID = new Map(TREATMENTS.map(entry => [entry.id, entry]));

export const treatmentTitle = (id: TreatmentId) => BY_ID.get(id)!.title;
export const treatmentVariants = (id: TreatmentId) => BY_ID.get(id)!.variants;
export const isTreatmentVariant = (id: TreatmentId, variant: string) =>
  BY_ID.get(id)?.variants.some(entry => entry.id === variant) ?? false;

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
export function dealTreatments(_lane: MoodLane, seed: string, count: number, kind: TreatmentId): string[] {
  const variants = [...treatmentVariants(kind)];
  const ordered = variants.sort((a, b) => hashPick(seed, a.id, 99991) - hashPick(seed, b.id, 99991));
  return Array.from({ length: count }, (_, index) => ordered[index % ordered.length].id);
}
