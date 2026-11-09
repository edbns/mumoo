/**
 * Pulise colour: forty neon sets, and the flat field and type colour each one cuts through on the beat.
 * Every colour on screen is a full-strength neon (saturation and brightness both near the top: no pastel, no white,
 * no washed-out tints) or the near-black that lets neon glow. A set is four neons; its cut sequence is
 * neon, neon, black, neon, neon, black. The type takes the neon of the set that stands out most from the field
 * (black where no neon stands out enough), and on a strong beat the cut opens with the pair inverted for a moment.
 */

export const NEON_COLORS = {
  red: '#ff1a2e', orange: '#ff6a00', amber: '#ffb300', yellow: '#ffee00', lime: '#b6ff00', green: '#00ff55', mint: '#00ffa8',
  cyan: '#00e5ff', sky: '#00a2ff', blue: '#2040ff', violet: '#8a1bff', purple: '#c21bff', magenta: '#ff00c8', pink: '#ff1f8e',
} as const;
type Hue = keyof typeof NEON_COLORS;

/** The black the neon is cut against. */
export const VOID = '#050505';

const SETS = {
  signal: ['red', 'yellow', 'blue', 'magenta'],
  acid: ['lime', 'magenta', 'violet', 'cyan'],
  ultraviolet: ['violet', 'pink', 'cyan', 'yellow'],
  solar: ['yellow', 'orange', 'red', 'violet'],
  toxic: ['green', 'violet', 'yellow', 'pink'],
  laser: ['cyan', 'blue', 'magenta', 'yellow'],
  bubblegum: ['pink', 'mint', 'yellow', 'violet'],
  hazard: ['yellow', 'red', 'blue', 'lime'],
  magma: ['orange', 'red', 'magenta', 'amber'],
  ice: ['mint', 'blue', 'cyan', 'lime'],
  vapor: ['magenta', 'cyan', 'purple', 'yellow'],
  coral: ['red', 'mint', 'yellow', 'blue'],
  cobalt: ['blue', 'cyan', 'magenta', 'lime'],
  radioactive: ['lime', 'green', 'magenta', 'violet'],
  orchid: ['purple', 'pink', 'mint', 'yellow'],
  tangerine: ['orange', 'magenta', 'cyan', 'blue'],
  ember: ['red', 'orange', 'lime', 'blue'],
  lava: ['orange', 'green', 'violet', 'pink'],
  citrus: ['lime', 'amber', 'magenta', 'blue'],
  jungle: ['green', 'yellow', 'purple', 'magenta'],
  arctic: ['cyan', 'blue', 'yellow', 'pink'],
  disco: ['magenta', 'yellow', 'cyan', 'violet'],
  candy: ['pink', 'lime', 'cyan', 'violet'],
  cyber: ['yellow', 'violet', 'cyan', 'red'],
  nitro: ['lime', 'blue', 'red', 'amber'],
  plasma: ['purple', 'cyan', 'yellow', 'green'],
  flare: ['orange', 'pink', 'yellow', 'blue'],
  mojito: ['green', 'magenta', 'amber', 'blue'],
  grape: ['violet', 'lime', 'magenta', 'sky'],
  sunset: ['magenta', 'amber', 'violet', 'orange'],
  bolt: ['yellow', 'blue', 'sky', 'pink'],
  rave: ['pink', 'lime', 'blue', 'mint'],
  gamma: ['green', 'blue', 'amber', 'red'],
  fuchsia: ['magenta', 'green', 'violet', 'sky'],
  opal: ['mint', 'violet', 'amber', 'pink'],
  hyper: ['cyan', 'magenta', 'lime', 'purple'],
  scarlet: ['red', 'lime', 'violet', 'sky'],
  punch: ['pink', 'amber', 'blue', 'cyan'],
  lemonade: ['yellow', 'pink', 'green', 'blue'],
  frost: ['sky', 'purple', 'lime', 'red'],
} as const satisfies Record<string, readonly [Hue, Hue, Hue, Hue]>;

export type NeonId = keyof typeof SETS;
export const NEON_IDS = Object.keys(SETS) as NeonId[];

/** The four neons of a set, as colours. */
export function neonColors(id: NeonId): string[] {
  return SETS[id].map(hue => NEON_COLORS[hue]);
}

/** What the field and the type look like for one cut (or for the flash that opens it). */
export type PulisePhase = { field: string; ink: string; glow: string };

/** WCAG contrast ratio, 1 (identical) to 21. */
export function contrast(a: string, b: string) {
  const light = (color: string) => {
    const value = parseInt(color.slice(1), 16);
    const [r, g, b2] = [value >> 16 & 255, value >> 8 & 255, value & 255].map(channel => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [high, low] = [light(a), light(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** Saturation and brightness (HSV, 0 to 1) of a `#rrggbb` colour. */
export function strength(color: string) {
  const value = parseInt(color.slice(1), 16);
  const channels = [value >> 16 & 255, value >> 8 & 255, value & 255];
  const high = Math.max(...channels);
  return { saturation: high === 0 ? 0 : 1 - Math.min(...channels) / high, brightness: high / 255 };
}

/** The numeric rule for "strong neon": nothing pale, pastel or washed out ever reaches the screen. */
export const NEON_MIN_SATURATION = 0.85;
export const NEON_MIN_BRIGHTNESS = 0.95;
export function isNeon(color: string) {
  const { saturation, brightness } = strength(color);
  return saturation >= NEON_MIN_SATURATION && brightness >= NEON_MIN_BRIGHTNESS;
}

/** Type must stand this far apart from its field; black type takes over where no neon does. */
export const READABLE = 3.4;
/** What a neon needs to stand out against black. */
const ON_BLACK = 4.5;

function phase(field: string, ink: string): PulisePhase {
  const blend = (from: string, to: string) => {
    const [a, b] = [from, to].map(color => parseInt(color.slice(1), 16));
    const channel = (shift: number) => Math.round((a >> shift & 255) * 0.65 + (b >> shift & 255) * 0.35);
    return `#${[16, 8, 0].map(shift => channel(shift).toString(16).padStart(2, '0')).join('')}`;
  };
  return { field, ink, glow: blend(ink, field) };
}

/** The type colour on a neon field: the neon of the set that contrasts most, or black when none reaches `READABLE`. */
function inkOn(field: string, neons: readonly string[]) {
  const best = neons.filter(color => color !== field).sort((a, b) => contrast(b, field) - contrast(a, field))[0];
  return contrast(best, field) >= READABLE ? best : VOID;
}

/** One round of cuts: which neon of the set (0 to 3), or black (-1). */
const ORDER = [0, 1, -1, 2, 3, -1] as const;
export const CUTS_PER_ROUND = ORDER.length;

/** The colours of cut number `cut`: round and round through the set, black every third cut so the neon has room to land. */
export function puliseCut(id: NeonId, cut: number): PulisePhase {
  const neons = neonColors(id);
  const step = ((cut % ORDER.length) + ORDER.length) % ORDER.length;
  const pick = ORDER[step];
  if (pick >= 0) return phase(neons[pick], inkOn(neons[pick], neons));
  // On black the type is a neon that stands out against it; the round's two black cuts take different ones.
  const bright = neons.filter(color => contrast(color, VOID) >= ON_BLACK);
  const round = Math.floor(cut / ORDER.length);
  return phase(VOID, bright[(round + (step === 2 ? 0 : 1)) % bright.length]);
}

/** How long the inverted pair stays up at the start of a strong cut. */
export const FLASH_MS = 110;
/** Only cuts at least this long flash, so a round of flashes can never pass three a second (see the tests). */
export const MIN_FLASH_CUT_MS = 400;

/** The colours on screen `ageMs` into a cut that is `lengthMs` long; a strong cut opens with the field and type swapped. */
export function puliseColours(id: NeonId, cut: number, ageMs: number, lengthMs: number, strong: boolean): PulisePhase {
  const now = puliseCut(id, cut);
  return strong && lengthMs >= MIN_FLASH_CUT_MS && ageMs >= 0 && ageMs < FLASH_MS ? phase(now.ink, now.field) : now;
}
