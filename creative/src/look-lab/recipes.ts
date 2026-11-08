/**
 * Look Lab recipes — Shaders.com (Pro-informed) stacks that are baked OFFLINE
 * into static look plates. The shipped app never imports this file or `shaders`.
 *
 * Add a look = add a recipe here, run `npm run bake:looks`, ship the JPEG.
 */
import type { PresetConfig, ShaderOptions } from 'shaders/js';
import bankList from './bank.json';
import photoList from './photo-looks.json';

/** A photo treatment (cleared library photo through Shaders) or `bank-<slug>`: a standalone Shaders Pro background. */
export const PHOTO_LOOKS: readonly { slug: string; title: string }[] = photoList;
export type LookId = string;

export type BankEntry = { slug: string; title: string; presetId: string; mood: string; lanes: string[]; desc: string };
export const BANK: readonly BankEntry[] = bankList;

const presetFiles = import.meta.glob('./presets/*.json', { eager: true, import: 'default' }) as Record<
  string,
  { config: PresetConfig; options?: Partial<ShaderOptions> }
>;

export const LOOK_IDS: readonly LookId[] = [...PHOTO_LOOKS.map(item => item.slug), ...BANK.map(item => `bank-${item.slug}`)];

/** Noir — measured mono film LUT + grade + grain + vignette. */
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

const plate = (url: string) => ({ type: 'ImageTexture', id: 'plate', props: { url, objectFit: 'cover' } }) as const;

/** Neon Night — shadows indigo, midtones hot pink, highlights ice cyan, with a prismatic edge and bloom. */
function neonNight(plateUrl: string): PresetConfig {
  return {
    components: [
      plate(plateUrl),
      { type: 'BrightnessContrast', id: 'night', props: { brightness: -0.08, contrast: 0.12 } },
      { type: 'Tritone', id: 'tones', props: { colorA: '#07011a', colorB: '#d81c78', colorC: '#46d2ff', blendMid: 0.5, colorSpace: 'oklab' } },
      { type: 'ChromaticAberration', id: 'prism', props: { strength: 0.09, angle: 0 } },
      { type: 'Glow', id: 'bloom', props: { intensity: 5, threshold: 0.62, size: 34 } },
      { type: 'FilmGrain', id: 'grain', props: { strength: 0.05, bias: 2.5, animated: false } },
    ],
  };
}

/** Golden Hour — warm measured film stock, an orange light leak from the right edge, soft vignette. */
function goldenHour(plateUrl: string): PresetConfig {
  return {
    components: [
      plate(plateUrl),
      { type: 'FilmStock', id: 'stock', props: { stock: 'warm200', strength: 1, halation: 0.45, halationRadius: 30, weave: 0 } },
      { type: 'LightLeak', id: 'leak', props: { position: { x: 0.96, y: 0.22 }, spread: 0.75, intensity: 0.26, streaks: 0.5, flicker: 0, speed: 0 } },
      { type: 'FilmGrain', id: 'grain', props: { strength: 0.05, bias: 2.5, animated: false } },
      { type: 'Vignette', id: 'vignette', props: { color: '#1a0a02', center: { x: 0.5, y: 0.5 }, radius: 0.55, falloff: 0.6, intensity: 0.5 } },
    ],
  };
}

/** Pop Print — saturated CMYK halftone on cream paper with a little plate misregistration. */
function popPrint(plateUrl: string): PresetConfig {
  return {
    components: [
      plate(plateUrl),
      { type: 'Saturation', id: 'punch', props: { intensity: 1.35 } },
      { type: 'Halftone', id: 'print', props: { style: 'cmyk', frequency: 90, misprint: 0.004, misprintAngle: 30, paperColor: '#f4efe4' } },
    ],
  };
}

const PHOTO_RECIPES: Record<string, (plateUrl: string) => PresetConfig> = {
  'noir-mono': noirMono,
  'neon-night': neonNight,
  'golden-hour': goldenHour,
  'pop-print': popPrint,
};

export type Recipe = { preset: PresetConfig; options: Partial<ShaderOptions> };

export function lookRecipe(id: LookId, plateUrl: string): Recipe {
  const photo = PHOTO_RECIPES[id];
  if (photo) return { preset: photo(plateUrl), options: {} };
  const file = presetFiles[`./presets/${id.slice('bank-'.length)}.json`];
  if (!file) throw new Error(`Unknown look: ${id}`);
  return { preset: file.config, options: file.options ?? {} };
}
