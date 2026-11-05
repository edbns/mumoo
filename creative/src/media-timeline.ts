import { DURATION_MS, FPS, type Composition } from './composition';
import { sameClip, type ClipIdentity, type MusicAnalysisState } from './creative-profile';

export interface MediaAsset { id: string; type: 'image' | 'video'; url: string; title: string }
export interface MediaShot { assetId: string; startMs: number; endMs: number; transition: 'cut' | 'dissolve' | 'impact' }
export interface MediaEdit { version: 1; clip: ClipIdentity; durationMs: typeof DURATION_MS; shots: MediaShot[]; assets: MediaAsset[] }

/** Assemble measured beat/onset opportunities into a small number of long shots. */
export function assembleMediaEdit(clip: ClipIdentity, analysis: MusicAnalysisState, assets: MediaAsset[]): MediaEdit {
  if (analysis.status !== 'ready' || !sameClip(analysis.clip, clip)) throw new Error('Music analysis is required for an automatic edit.');
  if (assets.length < 2 || assets.some(asset => !asset.id || !['image', 'video'].includes(asset.type) || !asset.url)) throw new Error('At least two available media assets are required.');
  const result = analysis.result;
  if (result.clip.offsetMs !== 0 || result.clip.durationMs !== DURATION_MS) throw new Error('Music analysis does not match this clip.');
  const beats = result.rhythm.beatsMs.filter(t => Number.isSafeInteger(t) && t >= 0 && t < DURATION_MS);
  const onsets = result.features.transientsMs.filter(t => Number.isSafeInteger(t) && t >= 0 && t < DURATION_MS);
  const candidates = [...new Set([...beats, ...onsets])].sort((a, b) => a - b);
  if (candidates.length < 3) throw new Error('Not enough detected musical events to assemble an edit.');
  const frames = result.features.frames;
  const energyAt = (ms: number) => { let energy = 0; for (const frame of frames) { if (frame.timeMs > ms) break; energy = frame.rms; } return Number.isFinite(energy) ? energy : 0; };
  const cuts: number[] = [];
  for (const target of [3750, 7500, 11250]) {
    const last = cuts.at(-1) ?? 0;
    const suitable = candidates.filter(ms => ms >= last + 1800 && ms <= DURATION_MS - 1800 && Math.abs(ms - target) <= 1250);
    suitable.sort((a, b) => (Math.abs(a - target) - Math.abs(b - target)) || energyAt(b) - energyAt(a) || a - b);
    if (suitable.length) cuts.push(suitable[0]);
  }
  if (!cuts.length) throw new Error('Detected events do not provide enough timing evidence for this edit.');
  const maxEnergy = Math.max(0.001, ...frames.map(frame => Number.isFinite(frame.rms) ? frame.rms : 0));
  const positions = [0, ...cuts, DURATION_MS];
  return { version: 1, clip, durationMs: DURATION_MS, assets: assets.slice(0, positions.length - 1), shots: positions.slice(0, -1).map((startMs, i) => {
    const strong = i > 0 && energyAt(startMs) >= maxEnergy * 0.7 && onsets.some(time => Math.abs(time - startMs) <= 100);
    return { assetId: assets[i % assets.length].id, startMs, endMs: positions[i + 1], transition: i === 0 ? 'cut' : strong ? 'impact' : i % 2 ? 'dissolve' : 'cut' };
  }) };
}

export function frameState(edit: MediaEdit, frame: number) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= FPS * DURATION_MS / 1000) throw new Error('Invalid frame.');
  const timeMs = frame * 1000 / FPS;
  const index = edit.shots.findIndex(shot => timeMs >= shot.startMs && timeMs < shot.endMs);
  if (index < 0) throw new Error('No shot for frame.');
  const shot = edit.shots[index];
  const age = timeMs - shot.startMs;
  return { timeMs, shot, previous: index > 0 ? edit.shots[index - 1] : null,
    mix: shot.transition === 'dissolve' ? Math.min(1, age / 300) : 1,
    impact: shot.transition === 'impact' ? Math.exp(-age / 120) : 0 };
}

export function validateEditLyrics(edit: MediaEdit, composition: Composition) {
  if (edit.clip.sourceSha256 !== composition.sourceSha256 || edit.clip.offsetMs !== composition.clipStartMs) throw new Error('Media edit does not match the selected song.');
}
