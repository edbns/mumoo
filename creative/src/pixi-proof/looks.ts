/** Art-directed bounds for the three reproducible editorial treatments. */
export const EDITORIAL_LOOKS = [
  { name: 'Window', crop: 1.03, maskX: 320, maskWidth: 520, tint: 0xffffff, light: 0xffb365, drift: 12 },
  { name: 'Close', crop: 1.15, maskX: 430, maskWidth: 420, tint: 0xd5e8e3, light: 0xaedbce, drift: 20 },
  { name: 'Wide', crop: 1.08, maskX: 180, maskWidth: 650, tint: 0xf2dec5, light: 0xffcf96, drift: 8 },
] as const;

export function editorialLook(seed: number) {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('Invalid visual variation.');
  return EDITORIAL_LOOKS[seed % EDITORIAL_LOOKS.length];
}
