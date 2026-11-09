/**
 * Pulise colour: seventeen neon palettes, and the field/type colours each one cuts through on the beat.
 * A palette is three neon hues plus a paper (near-white) and a void (near-black), so every colour on screen is
 * either neon or the hard white/black that makes neon read as neon. Every phase is checked for legibility in the tests.
 */
import type { MoodLane } from './ad-fonts';

type Neon = { hues: readonly [string, string, string]; paper: string; void: string; lanes: readonly MoodLane[] };

export const NEONS = {
  signal: { hues: ['#ff1a2e', '#ff2e7e', '#ff6a00'], paper: '#fbfdff', void: '#050506', lanes: ['dark', 'techno', 'party', 'general'] },
  acid: { hues: ['#c6ff00', '#ff2bd6', '#00e5ff'], paper: '#fbfff0', void: '#07040e', lanes: ['techno', 'party', 'general'] },
  ultraviolet: { hues: ['#8a2bff', '#ff2bd6', '#00f0ff'], paper: '#f8f4ff', void: '#06031a', lanes: ['dark', 'techno', 'party', 'general'] },
  solar: { hues: ['#ffe600', '#ff6a00', '#ff1a6e'], paper: '#fffdf0', void: '#0c0500', lanes: ['gospel', 'party', 'general'] },
  toxic: { hues: ['#39ff14', '#00ffa3', '#f4ff00'], paper: '#f6fff4', void: '#020a04', lanes: ['dark', 'techno', 'general'] },
  laser: { hues: ['#00e5ff', '#2a6bff', '#ff2bd6'], paper: '#f4fbff', void: '#02061a', lanes: ['dark', 'quiet', 'techno', 'party', 'general'] },
  bubblegum: { hues: ['#ff5cc8', '#7affd9', '#fff04d'], paper: '#fff6fb', void: '#1a0414', lanes: ['quiet', 'gospel', 'party', 'general'] },
  hazard: { hues: ['#ffd400', '#ff2200', '#ff8a00'], paper: '#fffbe0', void: '#050505', lanes: ['dark', 'techno', 'party', 'general'] },
  magma: { hues: ['#ff3d00', '#ffae00', '#ff0066'], paper: '#fff6ee', void: '#0d0200', lanes: ['dark', 'techno', 'party', 'general'] },
  ice: { hues: ['#2dffc4', '#00b7ff', '#d6ff4a'], paper: '#f2fffb', void: '#02100c', lanes: ['quiet', 'gospel', 'techno', 'general'] },
  vapor: { hues: ['#ff71ce', '#01cdfe', '#b967ff'], paper: '#fbf4ff', void: '#0a0620', lanes: ['quiet', 'gospel', 'party', 'general'] },
  coral: { hues: ['#ff4d6d', '#00f5d4', '#ffe45e'], paper: '#fff8f6', void: '#0b0710', lanes: ['quiet', 'gospel', 'party', 'general'] },
  cobalt: { hues: ['#1f51ff', '#00e5ff', '#ff2e63'], paper: '#f2f7ff', void: '#02041a', lanes: ['dark', 'quiet', 'techno', 'general'] },
  radioactive: { hues: ['#ccff00', '#00ff6a', '#ff00aa'], paper: '#f8fff0', void: '#030a02', lanes: ['dark', 'techno', 'party'] },
  orchid: { hues: ['#e040ff', '#ff6ad5', '#6affea'], paper: '#fdf4ff', void: '#0c0414', lanes: ['quiet', 'gospel', 'party', 'general'] },
  tangerine: { hues: ['#ff8a00', '#ff2d95', '#00e0ff'], paper: '#fff8ef', void: '#0a0400', lanes: ['gospel', 'party', 'general'] },
  ember: { hues: ['#ff2a00', '#ff7a00', '#ffd000'], paper: '#fff7ee', void: '#0a0200', lanes: ['dark', 'gospel', 'general'] },
} as const satisfies Record<string, Neon>;

export type NeonId = keyof typeof NEONS;
export const NEON_IDS = Object.keys(NEONS) as NeonId[];

/** What one cut of the field is made of. */
export type PulisePhase = {
  field: string;
  /** The second colour of a pattern on this field (checker squares, rays, dots, stripes). Always keeps the type readable. */
  alt: string;
  ink: string;
  glow: string;
};

const PHASE_COUNT = 6;

function rgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [value >> 16 & 255, value >> 8 & 255, value & 255];
}

function hex(channels: readonly number[]) {
  return `#${channels.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

export function mix(from: string, to: string, amount: number) {
  const a = rgb(from);
  const b = rgb(to);
  return hex(a.map((value, i) => value + (b[i] - value) * amount));
}

export function luminance(color: string) {
  const [r, g, b] = rgb(color).map(value => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21. */
export function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** How far apart two colours look, 0 to 441 (straight RGB distance). */
export function distance(a: string, b: string) {
  const [p, q] = [rgb(a), rgb(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

const READABLE = 3.2;

function altFor(neon: Neon, field: string, ink: string) {
  if (luminance(field) < 0.05) return mix(field, ink, 0.16);
  if (luminance(ink) > luminance(field)) return mix(field, neon.void, 0.45);
  // On paper the second colour is a pastel of a neon (never grey), and never the colour of the word.
  if (field === neon.paper) return mix(field, neon.hues.find(hue => hue !== ink) ?? neon.hues[0], 0.24);
  return mix(field, neon.paper, 0.4);
}

function phase(neon: Neon, field: string, inks: readonly string[]): PulisePhase {
  const ink = inks.find(candidate => contrast(candidate, field) >= READABLE) ?? (contrast(neon.paper, field) >= contrast(neon.void, field) ? neon.paper : neon.void);
  return { field, alt: altFor(neon, field, ink), ink, glow: mix(ink, field, 0.35) };
}

const sequences = new Map<NeonId, readonly PulisePhase[]>();

/** The colours the field cuts through, one per beat, round and round: neon, white, neon, black, neon, black. */
export function puliseSequence(id: NeonId): readonly PulisePhase[] {
  const known = sequences.get(id);
  if (known) return known;
  const neon: Neon = NEONS[id];
  const [a, b, c] = neon.hues;
  const made = [
    phase(neon, a, [neon.paper, neon.void]),
    phase(neon, neon.paper, [a, b, c, neon.void]),
    phase(neon, b, [neon.paper, neon.void]),
    phase(neon, neon.void, [c, a, b]),
    phase(neon, c, [neon.void, neon.paper]),
    phase(neon, neon.void, [b, c, a]),
  ];
  sequences.set(id, made);
  return made;
}

export function puliseCut(id: NeonId, cut: number): PulisePhase {
  return puliseSequence(id)[((cut % PHASE_COUNT) + PHASE_COUNT) % PHASE_COUNT];
}

/** The colours a sticker on this phase may be made of: neon or hard white/black, never the field or the type colour, the three that stand out most from the word first. */
export function stickerColors(id: NeonId, current: PulisePhase) {
  const neon: Neon = NEONS[id];
  const bodies = [...neon.hues, neon.paper, neon.void]
    .filter(color => color !== current.field && color !== current.ink && distance(color, current.field) >= 150)
    .sort((a, b) => contrast(b, current.ink) - contrast(a, current.ink))
    .slice(0, 3);
  return { bodies, hues: neon.hues.filter(color => color !== current.field), paper: neon.paper, void: neon.void };
}
