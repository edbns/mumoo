import { HEIGHT } from './composition';

/** The kinds of creative the shelf offers; each is drawn by its own world in pack-scenes.ts (Pixi WebGL). */
export const AD_PUNCH_STYLES = ['bank', 'pulise', 'dust', 'filter'] as const;
export type AdPunchStyle = (typeof AD_PUNCH_STYLES)[number];

export const STYLE_NAMES: Record<AdPunchStyle, string> = {
  bank: 'Look Bank',
  pulise: 'Pulise',
  dust: 'Dust',
  filter: 'Filter',
};

export const META_SAFE_BOTTOM = Math.round(HEIGHT * 0.82);
