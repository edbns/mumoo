import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { estimatedPercent, RENDER_PACE_MS } = await server.ssrLoadModule('/src/cart-jobs.ts');
await server.close();

test('the download bar keeps moving while the worker only says "not yet", and never claims to be done early', () => {
  assert.equal(estimatedPercent(0, 1, 0), 0);
  const steps = [5_000, 30_000, RENDER_PACE_MS, 3 * RENDER_PACE_MS, 30 * RENDER_PACE_MS].map(ms => estimatedPercent(0, 1, ms));
  for (let index = 1; index < steps.length; index++) assert.ok(steps[index] > steps[index - 1] || steps[index] === 95, `${steps}`);
  assert.ok(steps[0] > 3, 'it visibly starts within seconds');
  assert.equal(steps.at(-1), 95, 'it waits at 95% for a slow render');
  assert.equal(estimatedPercent(1, 1, 1000), 100);
});

test('a finished video counts in full, and the bar never goes back when one finishes', () => {
  const before = estimatedPercent(0, 3, 40_000);
  const after = estimatedPercent(1, 3, 40_000);
  assert.ok(after > before);
  assert.ok(estimatedPercent(2, 3, 0) >= 66);
  assert.ok(estimatedPercent(2, 3, 10 * RENDER_PACE_MS) <= 95);
  assert.equal(estimatedPercent(0, 0, 1000), 0);
});
