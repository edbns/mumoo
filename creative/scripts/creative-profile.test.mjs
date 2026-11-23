import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('clip identity isolates shared analysis, and compositions validate', async () => {
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
    const base = { sourceSha256: clip.sourceSha256, clipStartMs: clip.offsetMs };
    assert.doesNotThrow(() => validate({ ...base, cues: [{ text: 'hello', startMs: 0, endMs: 1000 }] }, 18000));
    assert.doesNotThrow(() => validate({ ...base, cues: [] }, 18000));
    assert.throws(() => validate({ ...base, cues: [{ text: ' ', startMs: 0, endMs: 1000 }] }, 18000));
    assert.throws(() => validate({ ...base, cues: [{ text: 'late', startMs: 14000, endMs: 15001 }] }, 18000));
    assert.throws(() => validate({ ...base, clipStartMs: 4000 }, 18000));
  } finally {
    await server.close();
  }
});

test('a song of 10 to 15 seconds is the clip, whole; a shorter one is refused', async () => {
  const server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { clipLengthMs, framesOf, playheadFrame, validate } = await server.ssrLoadModule('/src/composition.ts');
    assert.equal(clipLengthMs(180_000), 15_000);
    assert.equal(clipLengthMs(15_000), 15_000);
    assert.equal(clipLengthMs(12_389.7), 12_300, 'whole tenths of a second');
    assert.equal(clipLengthMs(10_000), 10_000);
    assert.equal(framesOf(12_300), 369);
    assert.equal(playheadFrame(12_299, 12_300), 368);
    assert.equal(playheadFrame(14_000, 12_300), 368, 'never past the clip');
    const base = { sourceSha256: 'a'.repeat(64), clipStartMs: 0 };
    assert.doesNotThrow(() => validate({ ...base, cues: [{ text: 'hi', startMs: 11_000, endMs: 12_300 }] }, 12_389.7));
    assert.throws(() => validate({ ...base, cues: [{ text: 'hi', startMs: 11_000, endMs: 12_301 }] }, 12_389.7), /inside the clip/);
    assert.throws(() => validate({ ...base, clipStartMs: 100, cues: [] }, 12_389.7), /12\.3-second range/);
    assert.doesNotThrow(() => validate({ ...base, cues: [] }, 10_000));
    assert.throws(() => validate({ ...base, cues: [] }, 9_900), /Need at least 10/);
  } finally {
    await server.close();
  }
});
