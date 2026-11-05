import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
test('vision music profile preserves temporal measurements without sending lyrics', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  try {
    const { buildVisionMusicProfile } = await server.ssrLoadModule('/src/vision-music-profile.ts');
    const clip = { sourceSha256: 'a'.repeat(64), offsetMs: 900, durationMs: 15000 };
    const a = { clip: { offsetMs: 0, durationMs: 15000, sha256: 'b'.repeat(64) }, rhythm: { beatsMs: [0, 500], tempo: { status: 'ambiguous', gridBpm: 120, alternativesBpm: [60] } }, features: { transientsMs: [100, 600], frames: [{ timeMs: 100, rms: .2, onsetStrength: 1 }, { timeMs: 200, rms: .4, onsetStrength: 3 }, { timeMs: 650, rms: .8, onsetStrength: 2 }] } };
    a.temporalV1 = {version:1,status:'available',durationMs:15000,bins:[],segments:[]};
    const p = { clip, videoType: 'visual', creator: { primaryGenre: { value: 'House' } }, approvedLyrics: { source: 'creator_reviewed', cues: [{text:'do not send', startMs:0, endMs:500}] }, musicAnalysis: { status:'ready', clip, result:a } };
    const v = buildVisionMusicProfile(p); assert.equal(v.measured.envelope[0].rmsMean, .3); assert.equal(v.measured.envelope[1].onsetMean, 2); assert.deepEqual(v.lyricCues, []); assert.equal(v.measured.tempo.status, 'ambiguous'); assert.equal(v.measured.temporal.version, 1);
    p.videoType='lyric'; assert.deepEqual(buildVisionMusicProfile(p).lyricCues, []);
    p.musicAnalysis.clip = { ...clip, offsetMs: 1000 }; assert.equal(buildVisionMusicProfile(p), null);
  } finally { await server.close(); }
});
