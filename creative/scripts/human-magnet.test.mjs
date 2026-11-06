import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('footage observations use bounded, deterministic source moments and measured pixel changes', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { humanSampleOffsets, frameMotion } = await server.ssrLoadModule('/src/human-observation.ts');
    assert.deepEqual(humanSampleOffsets(15000, 5000), [0, 5000, 10000]);
    assert.deepEqual(humanSampleOffsets(5000, 5000), [0]);
    assert.equal(frameMotion(new Uint8ClampedArray([0, 0, 0, 255]), new Uint8ClampedArray([0, 0, 0, 255])), 0);
    assert.equal(frameMotion(new Uint8ClampedArray([0, 0, 0, 255]), new Uint8ClampedArray([255, 255, 255, 255])), 1);
  } finally { await server.close(); }
});
