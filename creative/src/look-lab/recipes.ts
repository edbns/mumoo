/**
 * Look Lab recipes — Shaders.com (Pro-informed) stacks that are baked OFFLINE
 * into static look plates. The shipped app never imports this file or `shaders`.
 *
 * Add a look = add a recipe here, run `npm run bake:looks`, ship the JPEG.
 */
import type { PresetConfig, ShaderOptions } from 'shaders/js';
import bankList from './bank.json';

/** `noir-mono` = photo treatment. `bank-<slug>` = standalone Shaders Pro background (no photo). */
export type LookId = 'noir-mono' | `bank-${string}`;

export type BankEntry = { slug: string; title: string; presetId: string; mood: string; lanes: string[]; desc: string };
export const BANK: readonly BankEntry[] = bankList;

const presetFiles = import.meta.glob('./presets/*.json', { eager: true, import: 'default' }) as Record<
  string,
  { config: PresetConfig; options?: Partial<ShaderOptions> }
>;

export const LOOK_IDS: readonly LookId[] = ['noir-mono', ...BANK.map(item => `bank-${item.slug}` as const)];

/** Noir · Mono 400 — measured mono film LUT + grade + grain + vignette. */
function noirMono(plateUrl: string): PresetConfig {
  return {
    components: [
      { type: 'ImageTexture', id: 'plate', props: { url: plateUrl, objectFit: 'cover' } },
      {
        type: 'FilmStock',
        id: 'stock',
        props: { stock: 'mono400', strength: 1, halation: 0.2, halationRadius: 22, weave: 0 },
      },
      { type: 'BrightnessContrast', id: 'grade', props: { brightness: -0.04, contrast: 0.16 } },
      { type: 'FilmGrain', id: 'grain', props: { strength: 0.045, bias: 2.5, animated: false } },
      {
        type: 'Vignette',
        id: 'vignette',
        props: {
          color: '#000000',
          center: { x: 0.5, y: 0.48 },
          radius: 0.4,
          falloff: 0.55,
          intensity: 0.82,
        },
      },
    ],
  };
}

export type Recipe = { preset: PresetConfig; options: Partial<ShaderOptions> };

export function lookRecipe(id: LookId, plateUrl: string): Recipe {
  if (id === 'noir-mono') return { preset: noirMono(plateUrl), options: {} };
  const file = presetFiles[`./presets/${id.slice('bank-'.length)}.json`];
  if (!file) throw new Error(`Unknown look: ${id}`);
  return { preset: file.config, options: file.options ?? {} };
}
