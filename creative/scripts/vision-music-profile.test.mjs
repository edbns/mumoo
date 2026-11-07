import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
test('vision music profile preserves temporal measurements without sending lyrics', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  try {
    const { buildVisionMusicProfile } = await server.ssrLoadModule('/src/vision-music-profile.ts');
    const clip = { sourceSha256: 'a'.repeat(64), offsetMs: 900, durationMs: 15000 };
    const frame = (timeMs, rms, onsetStrength, centroidHz = 2200, bandwidthHz = 700) => ({ timeMs, rms, onsetStrength, centroidHz, bandwidthHz, rolloffHz: centroidHz + 400 });
    // Keep historic envelope fixtures in bins 0–1, then pad enough frames for DSP Intent.
    const frames = [frame(100,.2,1), frame(200,.4,3), frame(650,.8,2), ...Array.from({ length: 8 }, (_, i) => frame(1000 + i * 100, .3, 1))];
    const a = { clip: { offsetMs: 0, durationMs: 15000, sha256: 'b'.repeat(64) }, rhythm: { beatsMs: [0, 500], tempo: { status: 'ambiguous', gridBpm: 120, alternativesBpm: [60] } }, features: { transientsMs: [100, 600], frames } };
    a.temporalV1 = {version:1,status:'available',durationMs:15000,bins:[],segments:[]};
    const p = { clip, videoType: 'visual', creator: { primaryGenre: { value: 'House' } }, approvedLyrics: { source: 'creator_reviewed', cues: [{text:'do not send', startMs:0, endMs:500}] }, musicAnalysis: { status:'ready', clip, result:a } };
    const v = buildVisionMusicProfile(p); assert.equal(v.measured.envelope[0].rmsMean, .3); assert.equal(v.measured.envelope[1].onsetMean, 2); assert.deepEqual(v.lyricCues, []); assert.equal(v.measured.tempo.status, 'ambiguous'); assert.equal(v.measured.temporal.version, 1);
    assert.equal(v.intent.method, 'dsp-timbre-v1'); assert.equal(v.intent.vibe, 'Uplifting/Energetic');
    p.videoType='lyric'; assert.equal(buildVisionMusicProfile(p).lyricCues.length, 1);
    p.musicAnalysis.clip = { ...clip, offsetMs: 1000 }; assert.equal(buildVisionMusicProfile(p), null);
  } finally { await server.close(); }
});
