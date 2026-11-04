import { DURATION_MS, type LyricCue } from './composition';

export interface ClipIdentity {
  sourceSha256: string;
  offsetMs: number;
  durationMs: typeof DURATION_MS;
}

export interface MusicAnalysisV1 {
  version: 1;
  method: 'beat_this_librosa';
  source: { sha256: string } | null;
  clip: {
    offsetMs: number;
    durationMs: number;
    sha256: string;
    receivedAudio: { durationMs: number; codec: string; sampleRateHz: number; channels: number };
  };
  rhythm: {
    status: 'detected' | 'unavailable';
    reason: string | null;
    beatsMs: number[];
    downbeatsMs: number[];
    tempo: {
      status: 'estimated' | 'ambiguous' | 'unavailable';
      bpm: number | null;
      gridBpm: number | null;
      alternativesBpm: number[];
      intervalCount: number;
      supportFraction: number | null;
    };
  };
  features: {
    sampleRateHz: number;
    windowSamples: number;
    hopSamples: number;
    frameTime: 'center';
    transientsMs: number[];
    frames: { timeMs: number; rms: number; onsetStrength: number; centroidHz: number; bandwidthHz: number; rolloffHz: number }[];
  };
  provenance: {
    beatModel: { name: string; version: string; checkpointSha256: string } | null;
    librosaVersion: string;
    contextMs: number;
  };
  metrics: {
    wallSeconds: number;
    pythonCpuSeconds: number;
    childCpuSeconds: number;
    peakPythonRssBytes: number;
    decodeSeconds: number;
    featureSeconds: number;
    beatLoadSeconds: number | null;
    beatInferenceSeconds: number[];
    firstInContainer?: boolean;
  };
}

export type MusicAnalysisState =
  | { status: 'unavailable'; reason: 'not_requested' }
  | { status: 'pending'; clip: ClipIdentity }
  | { status: 'ready'; clip: ClipIdentity; result: MusicAnalysisV1 }
  | { status: 'error'; clip: ClipIdentity; message: string };

export const NO_ANALYSIS: MusicAnalysisState = { status: 'unavailable', reason: 'not_requested' };

export function sameClip(a: ClipIdentity | null, b: ClipIdentity): boolean {
  return a !== null && a.sourceSha256 === b.sourceSha256 && a.offsetMs === b.offsetMs && a.durationMs === b.durationMs;
}

export function analysisForClip(state: MusicAnalysisState, clip: ClipIdentity): MusicAnalysisState {
  return state.status === 'unavailable' || sameClip(state.clip, clip) ? state : NO_ANALYSIS;
}

export interface CreativeProfileV1 {
  version: 1;
  clip: ClipIdentity;
  creator: {
    primaryGenre: { value: string; source: 'creator' };
    influence?: { value: string; source: 'creator' };
    title?: { value: string; source: 'embedded_metadata' | 'creator' };
    artist?: { value: string; source: 'embedded_metadata' | 'creator' };
    creativeDirection?: { value: string; source: 'creator' };
  };
  videoType: 'lyric' | 'visual';
  musicAnalysis: MusicAnalysisState;
  approvedLyrics?: { cues: LyricCue[]; source: 'creator_reviewed' };
}
