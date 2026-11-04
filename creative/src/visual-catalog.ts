import { PRESETS, type Composition } from './composition';

export interface VisualCatalogEntry {
  id: string;
  version: number;
  name: string;
  family: 'kinetic_typography' | 'procedural' | 'living_matter' | 'licensed_video' | 'user_media';
  videoTypes: readonly ('lyric' | 'visual')[];
  genreTags: readonly string[];
  influenceTags: readonly string[];
  characteristics: readonly string[];
  response: { beats: boolean; energy: boolean; onsets: boolean };
  assets: readonly { kind: 'font' | 'image' | 'video'; license: string; provenance: string }[];
  capabilities: { preview: boolean; export: boolean };
  performance: { renderer: 'canvas2d' | 'other'; notes: string };
  renderer:
    | { kind: 'existing_canvas'; template: Extract<Composition, { version: 2 }>['template'] }
    | { kind: 'deterministic_frame'; entryPoint: string };
}

// The existing presets render lyric typography. They do not yet produce a visual-only animation.
export const VISUAL_CATALOG = PRESETS.map((preset): VisualCatalogEntry & {
  renderer: { kind: 'existing_canvas'; template: typeof preset.id };
} => ({
  id: preset.id,
  version: 1,
  name: preset.name,
  family: 'kinetic_typography',
  videoTypes: ['lyric'],
  genreTags: [],
  influenceTags: [],
  characteristics: [preset.description],
  response: { beats: false, energy: false, onsets: false },
  assets: [{ kind: 'font', license: 'SIL Open Font License 1.1', provenance: 'Bundled Inter Variable font' }],
  capabilities: { preview: true, export: true },
  performance: { renderer: 'canvas2d', notes: 'Existing canvas renderer; performance varies by device.' },
  renderer: { kind: 'existing_canvas', template: preset.id },
}));
