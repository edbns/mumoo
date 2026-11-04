import { DURATION_MS, FPS } from './composition';
import { sameClip, type ClipIdentity, type MusicAnalysisState } from './creative-profile';

export interface ReactiveTimeline {
  version: 1;
  clip: ClipIdentity;
  beatsMs: number[];
  onsetsMs: number[];
  energy: { timeMs: number; rms: number; centroidHz: number }[];
  tempo: { status: 'estimated' | 'ambiguous' | 'unavailable'; bpm: number | null; alternativesBpm: number[] };
}

export type AssemblyLayer =
  | { id: string; kind: 'image'; asset: 'horizon-a' | 'horizon-b'; startMs: number; endMs: number; opacity: number; fadeInMs?: number; fadeOutMs?: number }
  | { id: string; kind: 'procedural'; effect: 'orbit' | 'stripes'; startMs: number; endMs: number; opacity: number; fadeInMs?: number; fadeOutMs?: number }
  | { id: string; kind: 'lyrics'; startMs: number; endMs: number; opacity: number; fadeInMs?: number; fadeOutMs?: number };
export interface AssemblyPlan {
  version: 1;
  id: 'orbit-v1' | 'horizon-v1';
  compositionId: 'orbit' | 'horizon';
  clip: ClipIdentity;
  durationMs: typeof DURATION_MS;
  engineVersion: 1;
  variationSeed: number;
  assets: readonly ('horizon-a' | 'horizon-b')[];
  layers: AssemblyLayer[];
  timeline: ReactiveTimeline | null;
  provenance: 'MUMOO original procedural graphics';
}

export function timelineFor(clip: ClipIdentity, state: MusicAnalysisState): ReactiveTimeline | null {
  if (state.status !== 'ready') return null;
  // Hosted analysis receives only the selected excerpt and reports offset zero.
  // The separately verified client-side clip identity binds it to the source.
  if (!sameClip(state.clip, clip) || state.result.clip.offsetMs !== 0 || state.result.clip.durationMs !== DURATION_MS || (state.result.source && state.result.source.sha256 !== clip.sourceSha256)) throw new Error('Music analysis does not match the selected clip.');
  const result = state.result;
  return { version: 1, clip, beatsMs: [...result.rhythm.beatsMs], onsetsMs: [...result.features.transientsMs], energy: result.features.frames.map(({ timeMs, rms, centroidHz }) => ({ timeMs, rms, centroidHz })), tempo: { status: result.rhythm.tempo.status, bpm: result.rhythm.tempo.gridBpm, alternativesBpm: [...result.rhythm.tempo.alternativesBpm] } };
}

export function orbitPlan(clip: ClipIdentity, state: MusicAnalysisState, lyrics: boolean, variationSeed = 0): AssemblyPlan {
  if (!Number.isSafeInteger(variationSeed) || variationSeed < 0 || variationSeed > 0xffffffff) throw new Error('Invalid variation seed.');
  return { version: 1, id: 'orbit-v1', compositionId: 'orbit', clip, durationMs: DURATION_MS, engineVersion: 1, variationSeed, assets: [], timeline: timelineFor(clip, state), provenance: 'MUMOO original procedural graphics', layers: [
    { id: 'stripes', kind: 'procedural', effect: 'stripes', startMs: 0, endMs: DURATION_MS, opacity: 1 },
    { id: 'orbit', kind: 'procedural', effect: 'orbit', startMs: 0, endMs: DURATION_MS, opacity: 1 },
    ...(lyrics ? [{ id: 'lyrics', kind: 'lyrics' as const, startMs: 0, endMs: DURATION_MS, opacity: 1 }] : []),
  ] };
}

export function horizonPlan(clip: ClipIdentity, state: MusicAnalysisState, lyrics: boolean, variationSeed = 0): AssemblyPlan {
  const plan = orbitPlan(clip, state, lyrics, variationSeed);
  return { ...plan, id: 'horizon-v1', compositionId: 'horizon', assets: ['horizon-a', 'horizon-b'], layers: [
    { id: 'first', kind: 'image', asset: 'horizon-a', startMs: 0, endMs: 8200, opacity: 1, fadeOutMs: 1400 },
    { id: 'second', kind: 'image', asset: 'horizon-b', startMs: 6800, endMs: DURATION_MS, opacity: 1, fadeInMs: 1400 },
    { id: 'overlay', kind: 'procedural', effect: 'orbit', startMs: 0, endMs: DURATION_MS, opacity: 0.7 },
    ...(lyrics ? [{ id: 'lyrics', kind: 'lyrics' as const, startMs: 0, endMs: DURATION_MS, opacity: 1 }] : []),
  ] };
}

// Each channel is a pure function of seed and purpose; evaluating frames in a
// different order must never change the selected visual parameters.
export function variation(seed: number, channel: number): number {
  let value = (seed ^ Math.imul(channel + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
}

// Layer order is the order in the plan; intervals are half-open and sampled at
// the same integer frame time for previews and exports.
export function activeLayers(layers: AssemblyLayer[], frame: number) {
  const timeMs = frame * 1000 / FPS;
  return layers.flatMap(layer => {
    if (timeMs < layer.startMs || timeMs >= layer.endMs) return [];
    const fadeIn = layer.fadeInMs ? Math.min(1, (timeMs - layer.startMs) / layer.fadeInMs) : 1;
    const fadeOut = layer.fadeOutMs ? Math.min(1, (layer.endMs - timeMs) / layer.fadeOutMs) : 1;
    return [{ layer, opacity: Math.max(0, Math.min(1, layer.opacity * fadeIn * fadeOut)) }];
  });
}

export function reaction(timeline: ReactiveTimeline | null, frame: number) {
  const ms = frame * 1000 / FPS;
  const envelope = (times: number[], decay: number) => { let value = 0; for (const time of times) { if (time > ms) break; value = Math.exp(-(ms - time) / decay); } return value; };
  const beat = timeline?.beatsMs.length ? envelope(timeline.beatsMs, 180) : 0.5 + 0.5 * Math.sin(ms * Math.PI / 1000);
  const onset = timeline?.onsetsMs.length ? envelope(timeline.onsetsMs, 100) : 0;
  let energy = 0.2;
  if (timeline?.energy.length) { for (const sample of timeline.energy) { if (sample.timeMs > ms) break; energy = sample.rms; } }
  return { beat, onset, energy: Math.max(0, Math.min(1, energy)) };
}
