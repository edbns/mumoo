import type { ReactiveTimeline } from '../assembly';

export interface MusicSignals { beat: number; transient: number; energy: number; source: 'analysis' | 'fallback' }
export interface SignalOptions { recoveryMs: number }
const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/** Stateless, clip-relative signals. No BPM-derived event grid or downbeats. */
export function createMusicSignalAdapter(timeline: ReactiveTimeline | null, options: SignalOptions) {
  const recovery = Math.max(80, Math.min(1600, options.recoveryMs));
  const samples = (timeline?.energy ?? []).filter(item => Number.isFinite(item.timeMs) && Number.isFinite(item.rms)).slice().sort((a, b) => a.timeMs - b.timeMs);
  const values = samples.map(item => Math.max(0, item.rms)).sort((a, b) => a - b);
  const reference = Math.max(0.02, values[Math.floor((values.length - 1) * 0.9)] ?? 0.2);
  const energyAt = (ms: number) => {
    if (!timeline) return 0.42;
    if (!samples.length) return 0;
    let index = 0;
    while (index + 1 < samples.length && samples[index + 1].timeMs <= ms) index++;
    const a = samples[index], b = samples[Math.min(index + 1, samples.length - 1)];
    const mix = b.timeMs > a.timeMs ? clamp((ms - a.timeMs) / (b.timeMs - a.timeMs)) : 0;
    return clamp((a.rms + (b.rms - a.rms) * mix) / reference);
  };
  const beats = timeline ? timeline.beatsMs : [1200, 3600, 6000, 8400, 10800, 13200];
  const transients = timeline ? timeline.onsetsMs : [1200, 6000, 10800];
  const envelope = (events: readonly number[], ms: number, decay: number) => {
    let result = 0;
    for (const event of events) {
      if (!Number.isFinite(event) || event > ms) continue;
      const age = ms - event;
      if (age <= decay * 8) result = Math.max(result, Math.exp(-age / decay) * (0.3 + 0.7 * energyAt(event)));
    }
    return clamp(result);
  };
  return (frame: number): MusicSignals => {
    if (!Number.isInteger(frame) || frame < 0 || frame >= 450) throw new Error('Invalid signal frame.');
    const ms = frame * 1000 / 30;
    return { beat: envelope(beats, ms, recovery), transient: envelope(transients, ms, Math.min(110, recovery / 3)), energy: energyAt(ms), source: timeline ? 'analysis' : 'fallback' };
  };
}
