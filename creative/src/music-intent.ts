import type { MusicAnalysisV1 } from './creative-profile';

/** License-safe DSP Intent: read from the analysis we already measure (no NN weights). */
export const INTENT_VIBES = [
  'Uplifting/Energetic',
  'Aggressive/Industrial',
  'Ambient/Mellow',
  'Dark/Cinematic',
] as const;

export type IntentVibe = (typeof INTENT_VIBES)[number];

export interface MusicIntentV1 {
  version: 1;
  method: 'dsp-drive-v2';
  bpm: number | null;
  brightnessHz: number;
  /** 0 = still, 1 = pounding. Tempo and how often something hits. */
  drive: number;
  mode: 'major' | 'minor' | 'ambiguous' | null;
  /** Spectral flatness: distorted, noisy sounds read higher than tones. Null on old analyses. */
  flatness: number | null;
  vibe: IntentVibe;
  cutRate: 'high' | 'medium' | 'low';
  palette: 'saturated' | 'high-contrast' | 'cool-soft' | 'desaturated';
  searchBias: string[];
  treatmentHint: 'kinetic' | 'restrained' | 'balanced';
}

const RECIPES: Record<IntentVibe, Pick<MusicIntentV1, 'palette' | 'searchBias' | 'treatmentHint'>> = {
  'Uplifting/Energetic': {
    palette: 'saturated',
    treatmentHint: 'kinetic',
    searchBias: ['dancing night', 'city lights motion', 'crowd celebration', 'rooftop party'],
  },
  'Aggressive/Industrial': {
    palette: 'high-contrast',
    treatmentHint: 'kinetic',
    searchBias: ['factory sparks metal', 'concrete underpass night', 'welding industrial', 'subway tunnel motion'],
  },
  'Ambient/Mellow': {
    palette: 'cool-soft',
    treatmentHint: 'restrained',
    searchBias: ['soft window light', 'calm landscape', 'slow water', 'quiet interior'],
  },
  'Dark/Cinematic': {
    palette: 'desaturated',
    treatmentHint: 'balanced',
    searchBias: ['rain tunnel night', 'shadow architecture', 'cinematic street', 'moody skyline'],
  },
};

/** Below this the song barely moves. */
const STILL = 0.35;
/** A minor song under this drive feels brooding rather than danceable. */
const BROODING = 0.45;
const DRIVING = 0.6;
const POUNDING = 0.85;
/** Flatness of distorted, saw-heavy or noisy mixes. Clean pop and house sit near 0.001. */
const HARSH_FLATNESS = 0.0018;
const MINOR_MARGIN = -0.05;
const VERY_MINOR_MARGIN = -0.15;

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function measuredBpm(analysis: MusicAnalysisV1): number | null {
  const tempo = analysis.rhythm?.tempo;
  const raw = tempo?.gridBpm ?? tempo?.bpm ?? null;
  return finite(raw) && raw > 0 && raw <= 400 ? raw : null;
}

/** When the tracker gives no tempo, the beat spacing still says how fast it goes. */
function beatBpm(analysis: MusicAnalysisV1): number | null {
  const beats = (analysis.rhythm?.beatsMs ?? []).filter(finite);
  if (beats.length < 8) return null;
  const gaps = beats.slice(1).map((b, i) => b - beats[i]).filter(g => g > 0).sort((a, b) => a - b);
  const gap = gaps[gaps.length >> 1];
  return gap ? 60000 / gap : null;
}

/** Trackers sometimes count half or double time; pull those back without speeding up real ballads. */
function foldBpm(bpm: number) {
  let b = bpm;
  while (b > 160) b /= 2;
  while (b < 60) b *= 2;
  return b;
}

/** Read the song's drive, key colour and grit into a Director Intent card. */
export function deriveMusicIntent(analysis: MusicAnalysisV1): MusicIntentV1 | null {
  const frames = analysis?.features?.frames;
  if (!Array.isArray(frames) || frames.length < 8) return null;
  const centroids = frames.map(f => f.centroidHz).filter((n): n is number => finite(n) && n >= 0 && n <= 12000);
  const brightnessHz = mean(centroids);
  if (brightnessHz === null) return null;

  const bpm = measuredBpm(analysis);
  const times = frames.map(f => f.timeMs).filter(finite);
  const seconds = Math.max(1, (Math.max(...times) - Math.min(...times)) / 1000);
  const onsets = Array.isArray(analysis.features?.transientsMs) ? analysis.features.transientsMs.length : 0;
  const paceBpm = bpm ?? beatBpm(analysis);
  const pace = paceBpm === null ? 0.5 : clamp01((foldBpm(paceBpm) - 70) / 70);
  const hits = clamp01((onsets / seconds - 1) / 6);
  const drive = Math.round((pace + hits) * 50) / 100;

  const tonality = analysis.tonalityV1?.status === 'available' ? analysis.tonalityV1 : null;
  const margin = finite(tonality?.majorMinorMargin) ? tonality.majorMinorMargin : 0;
  const minor = margin <= MINOR_MARGIN;
  const flatnessRaw = analysis.timbreV1?.flatnessMean;
  const flatness = finite(flatnessRaw) ? flatnessRaw : null;
  const harsh = flatness !== null && flatness >= HARSH_FLATNESS;

  const vibe: IntentVibe =
    drive < STILL ? (minor ? 'Dark/Cinematic' : 'Ambient/Mellow')
    : (harsh && drive >= DRIVING) || (margin <= VERY_MINOR_MARGIN && drive >= POUNDING) ? 'Aggressive/Industrial'
    : minor && drive < BROODING ? 'Dark/Cinematic'
    : 'Uplifting/Energetic';

  return {
    version: 1,
    method: 'dsp-drive-v2',
    bpm: bpm === null ? null : Math.round(bpm),
    brightnessHz: Math.round(brightnessHz * 100) / 100,
    drive,
    mode: tonality?.mode ?? null,
    flatness,
    vibe,
    cutRate: drive >= 0.7 ? 'high' : drive < 0.4 ? 'low' : 'medium',
    ...RECIPES[vibe],
  };
}
