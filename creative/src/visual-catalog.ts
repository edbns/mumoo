import { PRESETS, type Composition } from './composition';

export interface VisualCatalogEntry {
  id: string;
  version: number;
  name: string;
  family: 'kinetic_typography' | 'daily_screens' | 'lyric_impact' | 'procedural' | 'living_matter' | 'licensed_video' | 'user_media';
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
  family: preset.id === 'daily-screens' ? 'daily_screens' : preset.id === 'lyric-impact' ? 'lyric_impact' : 'kinetic_typography',
  videoTypes: preset.id === 'orbit' || preset.id === 'horizon' ? ['lyric', 'visual'] : ['lyric'],
  genreTags: [],
  influenceTags: [],
  characteristics: [preset.description],
  response: { beats: ['orbit', 'horizon', 'lyric-impact'].includes(preset.id), energy: ['orbit', 'horizon', 'lyric-impact'].includes(preset.id), onsets: ['orbit', 'horizon'].includes(preset.id) },
  assets: [
    { kind: 'font', license: 'SIL Open Font License 1.1', provenance: 'Bundled Inter Variable font' },
    ...(preset.id === 'horizon' ? [{ kind: 'image' as const, license: 'Original MUMOO artwork', provenance: 'Two vector images created for MUMOO' }] : []),
  ],
  capabilities: { preview: true, export: true },
  performance: { renderer: 'canvas2d', notes: 'Existing canvas renderer; performance varies by device.' },
  renderer: { kind: 'existing_canvas', template: preset.id },
}));
