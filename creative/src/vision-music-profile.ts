import { DURATION_MS } from './composition';
import { sameClip, type CreativeProfileV1 } from './creative-profile';

/** A compact clip-relative description of observations, never inferred mood. */
export function buildVisionMusicProfile(profile: CreativeProfileV1) {
  if (profile.musicAnalysis.status !== 'ready' || !sameClip(profile.clip, profile.musicAnalysis.clip)) return null;
  const a = profile.musicAnalysis.result;
  if (a.clip.offsetMs !== 0 || a.clip.durationMs !== DURATION_MS || !/^[a-f0-9]{64}$/.test(a.clip.sha256)) return null;
  const bins = Array.from({ length: 30 }, (_, i) => ({ startMs: i * 500, endMs: (i + 1) * 500, rms: [] as number[], onsetStrength: [] as number[] }));
  for (const f of a.features.frames) {
    if (!Number.isFinite(f.timeMs) || f.timeMs < 0 || f.timeMs >= DURATION_MS) continue;
    const b = bins[Math.floor(f.timeMs / 500)];
    if (Number.isFinite(f.rms) && f.rms >= 0 && f.rms <= 1) b.rms.push(f.rms);
    if (Number.isFinite(f.onsetStrength) && f.onsetStrength >= 0 && f.onsetStrength <= 100000) b.onsetStrength.push(f.onsetStrength);
  }
  const mean = (items: number[]) => items.length ? Math.round((items.reduce((s, n) => s + n, 0) / items.length) * 1000000) / 1000000 : null;
  const timed = (values: number[]) => values.filter((n, i) => Number.isSafeInteger(n) && n >= 0 && n < DURATION_MS && (i === 0 || n >= values[i - 1])).slice(0, 1000);
  const lyricCues = profile.videoType === 'lyric' && Array.isArray(profile.approvedLyrics?.cues)
    ? profile.approvedLyrics.cues
      .filter(cue => cue && typeof cue.text === 'string' && cue.text.trim() && Number.isSafeInteger(cue.startMs) && Number.isSafeInteger(cue.endMs) && cue.startMs >= 0 && cue.endMs > cue.startMs && cue.endMs <= DURATION_MS)
      .slice(0, 40)
      .map(cue => ({ text: cue.text.trim().slice(0, 120), startMs: cue.startMs, endMs: cue.endMs }))
    : [];
  return { version: 1 as const, durationMs: DURATION_MS, clipSha256: a.clip.sha256,
    creator: { primaryGenre: profile.creator.primaryGenre.value, influence: profile.creator.influence?.value ?? null }, videoType: profile.videoType,
    measured: { tempo: a.rhythm.tempo, beatsMs: timed(a.rhythm.beatsMs), onsetsMs: timed(a.features.transientsMs),
      envelope: bins.map(b => ({ startMs: b.startMs, endMs: b.endMs, rmsMean: mean(b.rms), onsetMean: mean(b.onsetStrength) })),
      ...(a.temporalV1 && { temporal: { version: a.temporalV1.version, status: a.temporalV1.status, durationMs: a.temporalV1.durationMs, bins: a.temporalV1.bins, segments: a.temporalV1.segments } }) },
    lyricCues,
    unavailable: ['vocal_character', 'emotion', 'isolated_bass', 'structural_events'] };
}
