import type { MusicAnalysisV1 } from './creative-profile';

/** License-safe DSP Intent: timbre proxies from existing analysis frames (no NN weights). */
export const INTENT_VIBES = [
  'Uplifting/Energetic',
  'Aggressive/Industrial',
  'Ambient/Mellow',
  'Dark/Cinematic',
] as const;

export type IntentVibe = (typeof INTENT_VIBES)[number];

export interface MusicIntentV1 {
  version: 1;
  method: 'dsp-timbre-v1';
  bpm: number | null;
  brightnessHz: number;
  noisiness: number;
  vibe: IntentVibe;
  cutRate: 'high' | 'medium' | 'low';
  palette: 'saturated' | 'high-contrast' | 'cool-soft' | 'desaturated';
  searchBias: string[];
  treatmentHint: 'kinetic' | 'restrained' | 'balanced';
}

const RECIPES: Record<IntentVibe, Omit<MusicIntentV1, 'version' | 'method' | 'bpm' | 'brightnessHz' | 'noisiness' | 'vibe'>> = {
  'Uplifting/Energetic': {
    cutRate: 'high',
    palette: 'saturated',
    treatmentHint: 'kinetic',
    searchBias: ['dancing night', 'city lights motion', 'crowd celebration', 'rooftop party'],
  },
  'Aggressive/Industrial': {
    cutRate: 'high',
    palette: 'high-contrast',
    treatmentHint: 'kinetic',
    searchBias: ['factory sparks metal', 'concrete underpass night', 'welding industrial', 'subway tunnel motion'],
  },
  'Ambient/Mellow': {
    cutRate: 'low',
    palette: 'cool-soft',
    treatmentHint: 'restrained',
    searchBias: ['soft window light', 'calm landscape', 'slow water', 'quiet interior'],
  },
  'Dark/Cinematic': {
    cutRate: 'medium',
    palette: 'desaturated',
    treatmentHint: 'balanced',
    searchBias: ['rain tunnel night', 'shadow architecture', 'cinematic street', 'moody skyline'],
  },
};

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Map measured spectral brightness + bandwidth noisiness into a Director Intent card. */
export function deriveMusicIntent(analysis: MusicAnalysisV1): MusicIntentV1 | null {
  const frames = analysis?.features?.frames;
  if (!Array.isArray(frames) || frames.length < 8) return null;
  const centroids = frames.map(f => f.centroidHz).filter((n): n is number => Number.isFinite(n) && n >= 0 && n <= 12000);
  const bandwidths = frames.map(f => f.bandwidthHz).filter((n): n is number => Number.isFinite(n) && n >= 0 && n <= 12000);
  const brightnessHz = mean(centroids);
  const bandwidthHz = mean(bandwidths);
  if (brightnessHz === null || bandwidthHz === null) return null;

  // Bandwidth relative to centroid approximates flatness without a separate flatness pass.
  const noisiness = Math.max(0, Math.min(1, Math.round((bandwidthHz / Math.max(brightnessHz, 1)) * 10000) / 10000));
  const bright = brightnessHz > 2000;
  const noisy = noisiness > 0.85;
  const vibe: IntentVibe = bright
    ? (noisy ? 'Aggressive/Industrial' : 'Uplifting/Energetic')
    : (noisy ? 'Dark/Cinematic' : 'Ambient/Mellow');

  const tempo = analysis.rhythm?.tempo;
  const bpmRaw = tempo?.gridBpm ?? tempo?.bpm ?? null;
  const bpm = typeof bpmRaw === 'number' && Number.isFinite(bpmRaw) && bpmRaw > 0 && bpmRaw <= 400
    ? Math.round(bpmRaw)
    : null;

  const onsets = Array.isArray(analysis.features?.transientsMs) ? analysis.features.transientsMs.length : 0;
  const recipe = { ...RECIPES[vibe] };
  if (onsets >= 60 && recipe.cutRate === 'medium') recipe.cutRate = 'high';
  if (onsets < 20 && recipe.cutRate === 'high') recipe.cutRate = 'medium';

  return {
    version: 1,
    method: 'dsp-timbre-v1',
    bpm,
    brightnessHz: Math.round(brightnessHz * 100) / 100,
    noisiness,
    vibe,
    ...recipe,
  };
}
