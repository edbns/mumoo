/**
 * Photo effects ("Our photography" looks) — LICENCE + BUILD NOTE
 *
 * These recipes wrap presets from the owner's Shaders Pro licence (shaders.com,
 * "image-effects" category: Impression Trail, Tinted Lenses, Glass Facets, ...).
 * They are BAKED OFFLINE into static 1080x1920 JPEGs (punch-plates/effects/*.jpg) by
 * `npm run bake:photo-effects`. The `shaders` package is a devDependency only and is
 * never imported by the shipped browser bundle: the app loads the JPEGs, nothing else.
 * Do not copy the preset JSON files into public/ or into any runtime import.
 *
 * Each preset normally ships with a demo photo/webcam. Here every media input is swapped
 * for our own approved photograph (ImageTexture, objectFit cover).
 *
 * To add or tune a look: edit RECIPES below (patches change component props, `sweep`
 * moves a real mouse across the canvas for the cursor-driven effects), then run
 *   npm run bake:photo-effects -- <slug>
 */
import type { PresetConfig, ShaderOptions } from 'shaders/js';

/** Path where the photo is served by the vite dev server (relative to project root). */
export const PHOTO_PATH = '/punch-plates/out/burnnet-woman-1547507-1920.jpg';

type Node = { type: string; id?: string; props?: Record<string, unknown>; children?: Node[] };
type Preset = { presetId: string; title: string; collection: string; description: string; config: PresetConfig; options: Partial<ShaderOptions> };

const presetFiles = import.meta.glob('./presets/*.json', { eager: true, import: 'default' }) as Record<string, Preset>;

/** Pointer path as [x, y] fractions of the canvas (0..1). */
export type Sweep = 'none' | 'zigzag' | 'body' | 'wide' | 'slow-circles';

export const SWEEPS: Record<Sweep, [number, number][]> = {
  none: [],
  // a lazy S across the whole frame, ends away from the face
  zigzag: [[0.1, 0.55], [0.9, 0.62], [0.12, 0.72], [0.88, 0.8], [0.15, 0.9], [0.8, 0.95], [0.5, 0.7]],
  // keeps below the face so the face stays clean while the body gets treated
  body: [[0.2, 0.5], [0.85, 0.55], [0.3, 0.68], [0.8, 0.78], [0.25, 0.88], [0.75, 0.9], [0.5, 0.8]],
  wide: [[0.05, 0.1], [0.95, 0.2], [0.05, 0.35], [0.95, 0.5], [0.05, 0.65], [0.95, 0.8], [0.05, 0.92], [0.6, 0.6]],
  'slow-circles': [[0.5, 0.75], [0.75, 0.65], [0.7, 0.85], [0.35, 0.9], [0.25, 0.7], [0.5, 0.6], [0.7, 0.75], [0.5, 0.8]],
};

export type Patch = {
  /** Match by component type (and optionally nth occurrence) or by id. */
  type?: string;
  id?: string;
  nth?: number;
  props: Record<string, unknown>;
};

export type Variant = {
  /** Suffix for the file name: `{slug}-{suffix}.jpg`. */
  suffix: string;
  label: string;
  patches?: Patch[];
  sweep?: Sweep;
  settleMs?: number;
};

export type Recipe = {
  slug: string;
  mood: string;
  settleMs?: number;
  sweep?: Sweep;
  patches?: Patch[];
  /** Extra baked variants that look clearly different from the main one. */
  variants?: Variant[];
  /** Set true to skip the bake (kept in the file so the reason stays visible). */
  skip?: string;
};

/** Default recipe for every preset: sweep the body, settle, capture. Tuned entries below. */
export const RECIPES: Record<string, Partial<Recipe>> = {
  'broken-track-1': { mood: 'graphic' },
  // Ascii "gamma" was driven by the cursor trail; fixed so the portrait reads everywhere.
  'container-ship-1': { mood: 'techno', sweep: 'none', patches: [{ type: 'Ascii', props: { gamma: 1.6, cellSize: 7 } }] },
  'damaged-sensor-1': { mood: 'glitchy' },
  'dither-cam-1': { mood: 'retro' },
  'dithered-reveal-1': { mood: 'moody' },
  'fluid-displacement-1': { skip: 'the liquid push lands on the mouth and chin and warps the face (milder settings were just the plain photo)' },
  'focal-plane-1': { mood: 'soft', sweep: 'none' },
  'focal-plane-2': { skip: 'almost identical to the plain photo (only a faint tilt-shift)' },
  'glass-facets-1': { mood: 'editorial' },
  'glass-facets-2': { mood: 'bold' },
  // The cursor trail masked the colour split and never showed; mask removed, split kept.
  'glitch-trail-1': { mood: 'glitchy', sweep: 'wide', patches: [{ type: 'ChromaticAberration', props: { maskSource: undefined, strength: 0.06 } }] },
  'impression-trail-1': { mood: 'warm' },
  'impression-trail-2': { mood: 'playful' },
  'impression-trail-3': { mood: 'fresh' },
  'impression-trail-4': { mood: 'editorial' },
  'impression-trail-5': { skip: 'too close to impression-trail-1 and -3 (another yellow/orange duotone), face dimmer' },
  'impression-trail-6': { mood: 'cool' },
  'impression-trail-7': { mood: 'fresh' },
  'impression-trail-8': { mood: 'graphic' },
  'impression-trail-9': { mood: 'dreamy' },
  'liquid-reveal-1': { mood: 'dreamy' },
  'magnify-1': { mood: 'bright', sweep: 'none' },
  // Blur patches were big enough to hide the face; made larger and softer.
  'noise-passes-1': { mood: 'dreamy', settleMs: 3500, patches: [{ type: 'SimplexNoise', props: { scale: 0.22, balance: -0.35 } }, { type: 'DiffuseBlur', props: { intensity: 22 } }] },
  'onward-1': { mood: 'techno' },
  'pixel-reveal-1': { mood: 'playful' },
  'pixel-reveal-2': { mood: 'moody' },
  'prime-lens-1': { mood: 'soft' },
  'quantized-1': { mood: 'glitchy' },
  'shuffle-sort-1': { mood: 'editorial' },
  'the-wobbles-1': { skip: 'the 3D surface zooms into the body and cuts the face off, even with the cursor push removed' },
  'tinted-lenses-1': { mood: 'bold' },
  'tinted-lenses-2': { mood: 'fresh' },
  'tinted-lenses-3': { mood: 'bold' },
  // Original glass was so strong it shredded the face; softened.
  'tinted-lenses-4': { mood: 'graphic', sweep: 'none', patches: [{ type: 'FlutedGlass', props: { refraction: 0.9, frequency: 4, softness: 0.6 } }] },
  'tinted-lenses-5': { mood: 'warm' },
  'tinted-lenses-6': { mood: 'fresh' },
  'tinted-lenses-7': { mood: 'moody' },
  'tinted-lenses-8': { mood: 'playful' },
  'tinted-lenses-9': { skip: 'almost black and the angled bars hide half the face, even after lifting the shadows' },
  // Smaller cells so the portrait reads.
  'tropical-ascii-cam-1': { mood: 'techno', sweep: 'none', patches: [{ type: 'Ascii', props: { cellSize: 11 } }] },
  'uncertain-blueprint-1': { mood: 'graphic' },
  'water-colors-1': { mood: 'soft' },
};

export function presetSlugs(): string[] {
  return Object.keys(presetFiles)
    .map(path => path.replace('./presets/', '').replace('.json', ''))
    .sort();
}

export function presetOf(slug: string): Preset {
  const file = presetFiles[`./presets/${slug}.json`];
  if (!file) throw new Error(`Unknown photo effect: ${slug}`);
  return file;
}

export function recipeOf(slug: string): Recipe {
  return { slug, mood: '', sweep: 'zigzag', settleMs: 2200, ...RECIPES[slug] };
}

function patchMatches(node: Node, patch: Patch, counters: Map<string, number>): boolean {
  if (patch.id) return node.id === patch.id;
  if (patch.type && node.type === patch.type) {
    const seen = counters.get(patch.type) ?? 0;
    counters.set(patch.type, seen + 1);
    return seen === (patch.nth ?? 0);
  }
  return false;
}

/** Deep-clone the preset, point every media input at our photo, and apply the recipe patches. */
export function buildConfig(slug: string, patches: Patch[] = [], photoUrl: string = PHOTO_PATH): { config: PresetConfig; options: Partial<ShaderOptions> } {
  const preset = presetOf(slug);
  const config = structuredClone(preset.config) as { components: Node[] };
  const counters = patches.map(() => new Map<string, number>());
  const walk = (nodes: Node[]) => {
    for (const node of nodes) {
      node.props ??= {};
      if (node.type === 'ImageTexture') {
        node.props.url = photoUrl;
        node.props.objectFit = 'cover';
      }
      // Never ship a live camera/video input into a bake.
      if (node.type === 'WebcamTexture' || node.type === 'VideoTexture') {
        node.type = 'ImageTexture';
        node.props = { url: photoUrl, objectFit: 'cover' };
      }
      patches.forEach((patch, index) => {
        if (patchMatches(node, patch, counters[index])) Object.assign(node.props!, patch.props);
      });
      if (node.children) walk(node.children);
    }
  };
  walk(config.components);
  return { config: config as unknown as PresetConfig, options: structuredClone(preset.options) };
}
