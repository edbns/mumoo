/**
 * Look Lab recipes — Shaders.com (Pro-informed) stacks that are baked OFFLINE
 * into static look plates. The shipped app never imports this file or `shaders`.
 *
 * Add a look = add a recipe here, run `npm run bake:looks`, ship the JPEG.
 */
import type { PresetConfig, ShaderOptions } from 'shaders/js';
import bankList from './bank.json';

/** `bank-<slug>`: a standalone Shaders Pro background. */
export type LookId = string;

export type BankEntry = { slug: string; title: string; presetId: string; mood: string; lanes: string[]; desc: string };
export const BANK: readonly BankEntry[] = bankList;

const presetFiles = import.meta.glob('./presets/*.json', { eager: true, import: 'default' }) as Record<
  string,
  { config: PresetConfig; options?: Partial<ShaderOptions> }
>;

export const LOOK_IDS: readonly LookId[] = BANK.map(item => `bank-${item.slug}`);

export type Recipe = { preset: PresetConfig; options: Partial<ShaderOptions> };

export function lookRecipe(id: LookId): Recipe {
  const file = presetFiles[`./presets/${id.slice('bank-'.length)}.json`];
  if (!file) throw new Error(`Unknown look: ${id}`);
  return { preset: file.config, options: file.options ?? {} };
}
