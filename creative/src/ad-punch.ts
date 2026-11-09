import { HEIGHT } from './composition';

/**
 * The kinds of creative the shelf offers; each is drawn by its own world in pack-scenes.ts (Pixi WebGL).
 * `filter` is the Our photography row. Its name is the key a person's picture is kept under (uploads `use`), so it stays.
 */
export const AD_PUNCH_STYLES = ['bank', 'pulise', 'dust', 'filter'] as const;
export type AdPunchStyle = (typeof AD_PUNCH_STYLES)[number];

export const STYLE_NAMES: Record<AdPunchStyle, string> = {
  bank: 'Look Bank',
  pulise: 'Pulise',
  dust: 'Dust',
  filter: 'Photography',
};

export const META_SAFE_BOTTOM = Math.round(HEIGHT * 0.82);
