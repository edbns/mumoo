import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
test('media profile requires real analysis and excludes lyrics, source identity and metadata', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  try {
    const { mediaProfile } = await server.ssrLoadModule('/src/media-studio.tsx');
    const clip = { sourceSha256: 'a'.repeat(64), offsetMs: 1000, durationMs: 15000 };
    const profile = { version: 1, clip, videoType: 'lyric', creator: { primaryGenre: { value: 'House', source: 'creator' }, title: { value: 'private title', source: 'creator' } }, approvedLyrics: { cues: [{ text: 'private words', startMs: 0, endMs: 500 }], source: 'creator_reviewed' }, musicAnalysis: { status: 'unavailable', reason: 'not_requested' } };
    assert.equal(mediaProfile(profile), null);
    profile.musicAnalysis = { status: 'ready', clip, result: { rhythm: { beatsMs: [400, 860], tempo: { status: 'ambiguous', gridBpm: 130 } }, features: { transientsMs: [300], frames: [{ rms: 0.2, centroidHz: 1000 }, { rms: 0.4, centroidHz: 2000 }] } } };
    const data = mediaProfile(profile); assert.equal(data.music.tempoStatus, 'ambiguous'); assert.equal(data.music.gridBpm, 130); assert.equal(data.music.centroidHz, 1500);
    assert.equal(JSON.stringify(data).includes('private'), false); assert.equal('clip' in data, false);
  } finally { await server.close(); }
});
