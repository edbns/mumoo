/**
 * Two colours that belong together: a ground and the dust that lives on it.
 * Never just black and white. Each pair is a deliberate relationship on the colour wheel, and the dust is
 * always far enough from the ground in brightness to read at phone size.
 */
export type DustColors = { ground: string; dust: string };

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function hsl(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = clamp(s) * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

const hex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map(v => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('')}`;

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(color: string) {
  const channel = (i: number) => {
    const v = parseInt(color.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** How far round the wheel the dust sits from the ground, and how it is lit. */
const RELATIONS = [
  { name: 'complementary', turn: 180 },
  { name: 'split', turn: 150 },
  { name: 'triadic', turn: 120 },
  { name: 'analogous', turn: 35 },
  { name: 'near', turn: 12 },
] as const;

/**
 * A ground and a dust colour for this seed. `hue` pins the ground's hue (for example from the song's cover);
 * without it the seed picks one. Same seed, same pair.
 */
export function dustColors(seed: number, hue?: number): DustColors {
  const pick = (salt: number, count: number) => Math.abs(Math.imul(seed ^ (salt * 0x9e3779b1), 0x85ebca6b) >>> 8) % count;
  const ground = hue ?? pick(1, 360);
  const relation = RELATIONS[pick(2, RELATIONS.length)];
  const side = pick(3, 2) ? 1 : -1;
  const lightGround = pick(4, 4) === 0;
  const dustHue = ground + side * relation.turn;
  const groundColor = lightGround
    ? hex(hsl(ground, 0.55 + pick(5, 25) / 100, 0.86))
    : hex(hsl(ground, 0.55 + pick(5, 35) / 100, 0.1 + pick(7, 8) / 100));
  // Start from a lively dust colour, then move it along the brightness axis until it reads against the ground.
  let lightness = lightGround ? 0.28 + pick(6, 8) / 100 : 0.64 + pick(8, 12) / 100;
  let dust = hex(hsl(dustHue, 0.85, lightness));
  for (let step = 0; step < 20 && contrast(groundColor, dust) < 5; step++) {
    lightness = clamp(lightness + (lightGround ? -0.03 : 0.03));
    dust = hex(hsl(dustHue, 0.85, lightness));
  }
  return { ground: groundColor, dust };
}

export const hexToRgb = (color: string): [number, number, number] => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255) as [number, number, number];
