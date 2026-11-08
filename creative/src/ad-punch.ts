import { HEIGHT } from './composition';

/** What each creatives-pack style is made of; the drawing lives in pack-renderer.ts (Pixi WebGL). */

export const AD_BASES = ['pulse', 'paper-cutout', 'riso', 'noir', 'oil', 'slam', 'hold', 'bank'] as const;
export type AdBaseId = (typeof AD_BASES)[number];

/** Elements that ride the beat on top of the base. */
export const AD_BEAT_PROPS = ['none', 'beast', 'scratch'] as const;
export type AdBeatProp = (typeof AD_BEAT_PROPS)[number];

export const META_SAFE_BOTTOM = Math.round(HEIGHT * 0.82);

export const AD_PUNCH_STYLES = [
  'slam',
  'slam-flash',
  'slam-rise',
  'slam-split',
  'noir',
  'oil',
  'riso',
  'paper-cutout',
  'paper-cutout-beast',
  'paper-cutout-scratch',
  'pulse',
  'pulse-beast',
  'pulse-scratch',
  'lyric-hold',
  'bank',
] as const;
export type AdPunchStyle = (typeof AD_PUNCH_STYLES)[number];

export const AD_PUNCH_META: {
  id: AdPunchStyle;
  name: string;
  description: string;
  tags: string[];
  base: AdBaseId;
  prop: AdBeatProp;
}[] = [
  { id: 'slam', name: 'Color Slam', description: 'Full-bleed color + kinetic lyric scale/slam', tags: ['uplifting', 'kinetic', 'high', 'saturated', 'aggressive', 'balanced'], base: 'slam', prop: 'none' },
  { id: 'slam-flash', name: 'Slam · Flash', description: 'Beat invert flash + lyric punch', tags: ['aggressive', 'kinetic', 'high', 'saturated', 'cinematic'], base: 'slam', prop: 'none' },
  { id: 'slam-rise', name: 'Slam · Rise', description: 'Lyrics rise into frame on the hit', tags: ['uplifting', 'kinetic', 'balanced', 'restrained', 'mellow'], base: 'slam', prop: 'none' },
  { id: 'slam-split', name: 'Slam · Split', description: 'Split-field color + kinetic type', tags: ['cinematic', 'balanced', 'saturated', 'kinetic', 'dark'], base: 'slam', prop: 'none' },
  { id: 'noir', name: 'Noir', description: 'Cleared photo through cinematic film grain + light', tags: ['cinematic', 'dark', 'balanced', 'restrained', 'ambient', 'mellow'], base: 'noir', prop: 'none' },
  { id: 'oil', name: 'Oil', description: 'Cleared photo as a painterly oil plate', tags: ['cinematic', 'uplifting', 'balanced', 'restrained', 'mellow', 'saturated'], base: 'oil', prop: 'none' },
  { id: 'riso', name: 'Riso', description: 'Cleared photo through riso drums + halftone', tags: ['uplifting', 'balanced', 'saturated', 'kinetic', 'restrained', 'mellow'], base: 'riso', prop: 'none' },
  { id: 'paper-cutout', name: 'Paper Cutout', description: 'Cleared photo under stacked cut-paper sheets', tags: ['uplifting', 'balanced', 'saturated', 'kinetic', 'restrained'], base: 'paper-cutout', prop: 'none' },
  { id: 'paper-cutout-beast', name: 'Paper · Beast', description: 'Paper cutout plate + beast prop on the pulse', tags: ['uplifting', 'kinetic', 'high', 'saturated', 'aggressive'], base: 'paper-cutout', prop: 'beast' },
  { id: 'paper-cutout-scratch', name: 'Paper · Scratch', description: 'Paper cutout plate + scratch flares on hits', tags: ['cinematic', 'balanced', 'kinetic', 'restrained'], base: 'paper-cutout', prop: 'scratch' },
  { id: 'pulse', name: 'Pulse', description: 'Graphic pulse plate — Nosebleeds flash', tags: ['aggressive', 'kinetic', 'high', 'dark', 'cinematic'], base: 'pulse', prop: 'none' },
  { id: 'pulse-beast', name: 'Pulse · Beast', description: 'Pulse plate + animal head hitting with the beat', tags: ['uplifting', 'kinetic', 'high', 'saturated', 'aggressive'], base: 'pulse', prop: 'beast' },
  { id: 'pulse-scratch', name: 'Pulse · Scratch', description: 'Pulse plate + scratches that flare on hits', tags: ['cinematic', 'dark', 'balanced', 'kinetic'], base: 'pulse', prop: 'scratch' },
  { id: 'bank', name: 'Look Bank', description: 'Shaders Pro background + trend lyric type', tags: ['uplifting', 'balanced', 'saturated', 'kinetic', 'restrained', 'mellow', 'cinematic', 'dark', 'ambient'], base: 'bank', prop: 'none' },
  { id: 'lyric-hold', name: 'Lyric Hold', description: 'Quiet hold — no beat prop', tags: ['cinematic', 'dark', 'balanced', 'restrained', 'ambient', 'mellow'], base: 'hold', prop: 'none' },
];
