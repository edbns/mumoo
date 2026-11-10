import type { CoverRead } from './cover-palette';
import { DURATION_MS, type LyricCue } from './composition';
import type { LyricMeaningState } from './lyric-meaning';

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
  temporalV1?: { version: 1; status: 'available' | 'unavailable'; durationMs: number; bins: { startMs: number; endMs: number; relativeEnergy: number | null; bandShares: { low: number | null; lowMid: number | null; midHighMid: number | null; high: number | null }; onsetCount: number }[]; segments: { startMs: number; endMs: number; relativeEnergy: number | null; bandShares: { low: number | null; lowMid: number | null; midHighMid: number | null; high: number | null }; onsetsPerSecond: number; beatCount: number; energyChange: number | null }[] };
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

export function acceptsAnalysis(current: ClipIdentity | null, state: MusicAnalysisState): boolean {
  return state.status !== 'unavailable' && sameClip(current, state.clip);
}

export interface CreativeProfileV1 {
  version: 1;
  clip: ClipIdentity;
  creator: {
    primaryGenre: { value: string; source: 'creator' };
    /** The sub-genre inside the genre, as the creator chose it. */
    subGenre?: { value: string; source: 'creator' };
    title?: { value: string; source: 'embedded_metadata' | 'creator' };
    artist?: { value: string; source: 'embedded_metadata' | 'creator' };
    /** What the cover art inside the uploaded file looks like (numbers only; the picture is never kept). */
    cover?: { value: CoverRead; source: 'embedded_metadata' };
    creativeDirection?: { value: string; source: 'creator' };
  };
  musicAnalysis: MusicAnalysisState;
  /** Timed words the creator reviewed. `language` is an ISO 639 code; `origin` says whether we heard them or the creator typed them. */
  /** What the approved words mean, once our own model has read them. Absent until asked for. */
  lyricMeaning?: LyricMeaningState;
  /** The creator said the song has no words (instrumental, or only sounds): nothing is listened to or read, and only creatives that work without words are made. */
  noLyrics?: true;
  approvedLyrics?: { cues: LyricCue[]; source: 'creator_reviewed'; language?: string; origin: 'transcribed' | 'typed' };
}
