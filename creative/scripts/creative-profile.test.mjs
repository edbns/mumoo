import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('clip identity isolates shared analysis, and legacy compositions still validate', async () => {
  const server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { sameClip, analysisForClip, acceptsAnalysis } = await server.ssrLoadModule('/src/creative-profile.ts');
    const { validate } = await server.ssrLoadModule('/src/composition.ts');
    const clip = { sourceSha256: 'a'.repeat(64), offsetMs: 2000, durationMs: 15000 };
    const ready = { status: 'ready', clip, result: { version: 1 } };
    assert.equal(analysisForClip(ready, { ...clip }), ready);
    assert.equal(sameClip(clip, { ...clip, offsetMs: 2001 }), false);
    assert.equal(analysisForClip(ready, { ...clip, offsetMs: 2001 }).status, 'unavailable');
    assert.equal(analysisForClip(ready, { ...clip, sourceSha256: 'b'.repeat(64) }).status, 'unavailable');
    assert.equal(analysisForClip(ready, { ...clip, durationMs: 14999 }).status, 'unavailable');
    assert.equal(acceptsAnalysis(clip, ready), true);
    assert.equal(acceptsAnalysis({ ...clip, offsetMs: 2001 }, ready), false);
    assert.equal(acceptsAnalysis(null, ready), false);
    const base = { template: 'scribble', sourceSha256: clip.sourceSha256, clipStartMs: clip.offsetMs };
    assert.doesNotThrow(() => validate({ ...base, version: 1, lyric: { text: 'hello', startMs: 0, endMs: 1000 } }, 18000));
    assert.doesNotThrow(() => validate({ ...base, version: 2, cues: [] }, 18000));
  } finally {
    await server.close();
  }
});
