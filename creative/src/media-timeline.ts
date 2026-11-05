import { DURATION_MS, FPS, type Composition } from './composition';
import { sameClip, type ClipIdentity, type MusicAnalysisState } from './creative-profile';

export interface MediaAsset { id: string; type: 'image' | 'video'; url: string; title: string }
export interface MediaShot { assetId: string; startMs: number; endMs: number; transition: 'cut' | 'dissolve' | 'impact'; sourceStartMs?: number; startFrame?: number; endFrame?: number }
export interface MediaEdit { version: 1; clip: ClipIdentity; durationMs: typeof DURATION_MS; shots: MediaShot[]; assets: MediaAsset[] }

/** Validate a Core-only research plan after all media was fetched by the authenticated gateway. */
export function researchDirectorEdit(clip: ClipIdentity, blueprint: unknown, loaded: Map<string, string>): MediaEdit {
  const plan = blueprint as { version?: unknown; status?: unknown; durationMs?: unknown; scope?: unknown; assets?: unknown; shots?: unknown };
  if (!plan || plan.version !== 1 || plan.status !== 'ready' || plan.durationMs !== DURATION_MS || !Array.isArray(plan.assets) || plan.assets.length < 2 || plan.assets.length > 4 || !Array.isArray(plan.shots) || plan.shots.length < 2 || plan.shots.length > 4) throw new Error('Not enough approved media for this test.');
  const assets: MediaAsset[] = plan.assets.map((item: { id?: unknown; type?: unknown; title?: unknown; rights?: unknown; adSafety?: unknown }) => {
    const approved = typeof item.id === 'string' && !item.id.startsWith('owned-') && item.rights === 'APPROVED' && item.adSafety === 'SAFE';
    const stagingTest = plan.scope === 'staging-test-only' && typeof item.id === 'string' && /^(?:owned-[a-f0-9]{24}|pixabay-\d+)$/.test(item.id) && item.type === 'video' && item.rights === 'STAGING_TEST_ONLY' && item.adSafety === 'REVIEW_REQUIRED';
    if (typeof item.id !== 'string' || !/^(?:cma-\d+|si-[a-f0-9]{24}|commons2-\d+|owned-[a-f0-9]{24}|pixabay-\d+)$/.test(item.id) || !['image', 'video'].includes(String(item.type)) || typeof item.title !== 'string' || !(approved || stagingTest)) throw new Error('Unapproved media.');
    const url = loaded.get(item.id); if (!url?.startsWith('blob:')) throw new Error('Media was not loaded securely.');
    return { id: item.id, type: item.type as 'image' | 'video', title: item.title, url };
  });
  if (new Set(assets.map(item => item.id)).size !== assets.length) throw new Error('Duplicate media.');
  let position = 0;
  const shots: MediaShot[] = plan.shots.map((shot: MediaShot) => { if (!shot || !assets.some(a => a.id === shot.assetId) || !Number.isSafeInteger(shot.startMs) || !Number.isSafeInteger(shot.endMs) || shot.startMs !== position || shot.endMs <= shot.startMs || shot.endMs > DURATION_MS || !['cut', 'dissolve', 'impact'].includes(shot.transition)) throw new Error('Invalid video timeline.'); position = shot.endMs; if (shot.startFrame !== undefined || shot.endFrame !== undefined) { if (!Number.isInteger(shot.startFrame) || !Number.isInteger(shot.endFrame) || Math.round(shot.startFrame! * 1000 / FPS) !== shot.startMs || Math.round(shot.endFrame! * 1000 / FPS) !== shot.endMs) throw new Error('Invalid frame timeline.'); } const sourceStartMs = shot.sourceStartMs ?? 0; if (!Number.isSafeInteger(sourceStartMs) || sourceStartMs < 0 || sourceStartMs > 3600000) throw new Error('Invalid source range.'); return { assetId: shot.assetId, startMs: shot.startMs, endMs: shot.endMs, transition: shot.transition, sourceStartMs }; });
  if (position !== DURATION_MS) throw new Error('Invalid video duration.');
  return { version: 1, clip, durationMs: DURATION_MS, assets, shots };
}

/** Accept only a bounded, contiguous director plan for reviewed Commons video. */
export function directorEdit(clip: ClipIdentity, blueprint: unknown): MediaEdit {
  const value = blueprint as { version?: unknown; status?: unknown; durationMs?: unknown; assets?: unknown; shots?: unknown };
  if (!value || value.version !== 1 || value.status !== 'ready' || value.durationMs !== DURATION_MS || !Array.isArray(value.assets) || value.assets.length < 2 || value.assets.length > 4 || !Array.isArray(value.shots) || value.shots.length < 2 || value.shots.length > 4) throw new Error('A video cannot be assembled from the approved footage yet.');
  const assets: MediaAsset[] = value.assets.map((asset: { id?: unknown; type?: unknown; assetUrl?: unknown; title?: unknown; status?: unknown; commercialUseEligible?: unknown }) => {
    if (typeof asset.id !== 'string' || !/^commons-\d+$/.test(asset.id) || asset.type !== 'video' || asset.status !== 'approved' || asset.commercialUseEligible !== true || typeof asset.title !== 'string' || typeof asset.assetUrl !== 'string') throw new Error('Unapproved footage.');
    const url = new URL(asset.assetUrl); if (url.protocol !== 'https:' || url.hostname !== 'upload.wikimedia.org' || url.port || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('.webm')) throw new Error('Invalid footage source.');
    return { id: asset.id, type: 'video', url: url.href, title: asset.title };
  });
  if (new Set(assets.map(a => a.id)).size !== assets.length) throw new Error('Duplicate footage.');
  let position = 0;
  const shots: MediaShot[] = value.shots.map((shot: MediaShot) => { if (!shot || !assets.some(a => a.id === shot.assetId) || !Number.isSafeInteger(shot.startMs) || !Number.isSafeInteger(shot.endMs) || shot.startMs !== position || shot.endMs <= shot.startMs || shot.endMs > DURATION_MS || !['cut', 'dissolve', 'impact'].includes(shot.transition)) throw new Error('Invalid video timeline.'); position = shot.endMs; return { assetId: shot.assetId, startMs: shot.startMs, endMs: shot.endMs, transition: shot.transition }; });
  if (position !== DURATION_MS) throw new Error('Invalid video duration.');
  return { version: 1, clip, durationMs: DURATION_MS, assets, shots };
}

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
