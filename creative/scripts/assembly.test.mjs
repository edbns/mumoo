import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('music timeline is clip-bound and responds to events', async () => {
  const server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { timelineFor, reaction, orbitPlan, horizonPlan, variation, activeLayers } = await server.ssrLoadModule('/src/assembly.ts');
    const clip = { sourceSha256: 'a'.repeat(64), offsetMs: 1000, durationMs: 15000 };
    const result = { source: null, clip: { offsetMs: 0, durationMs: 15000 }, rhythm: { beatsMs: [1000], tempo: { status: 'estimated', gridBpm: 120, alternativesBpm: [60] } }, features: { transientsMs: [1000], frames: [{ timeMs: 0, rms: 0.3, centroidHz: 1000 }] } };
    const state = { status: 'ready', clip, result };
    const timeline = timelineFor(clip, state);
    assert.ok(reaction(timeline, 30).beat > reaction(timeline, 45).beat);
    assert.throws(() => timelineFor({ ...clip, offsetMs: 2000 }, state));
    assert.equal(orbitPlan(clip, { status: 'unavailable', reason: 'not_requested' }, false).timeline, null);
    assert.equal(variation(42, 3), variation(42, 3));
    assert.notEqual(variation(42, 3), variation(43, 3));
    assert.throws(() => orbitPlan(clip, state, false, -1));
    const layers = [{ id: 'a', kind: 'lyrics', startMs: 1000, endMs: 2000, opacity: 1, fadeInMs: 500 }, { id: 'b', kind: 'lyrics', startMs: 1000, endMs: 1500, opacity: 0.5 }];
    assert.deepEqual(activeLayers(layers, 30).map(item => item.opacity), [0, 0.5]);
    assert.deepEqual(activeLayers(layers, 45).map(item => item.layer.id), ['a']);
    assert.equal(activeLayers(layers, 60).length, 0);
    const scenes = horizonPlan(clip, state, false).layers;
    assert.deepEqual(activeLayers(scenes, 180).filter(x => x.layer.kind === 'image').map(x => x.layer.asset), ['horizon-a']);
    assert.equal(activeLayers(scenes, 225).filter(x => x.layer.kind === 'image').length, 2);
    assert.deepEqual(activeLayers(scenes, 270).filter(x => x.layer.kind === 'image').map(x => x.layer.asset), ['horizon-b']);
  } finally { await server.close(); }
});
