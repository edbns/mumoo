import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { estimatedPercent, RENDER_PACE_MS, slowNote } = await server.ssrLoadModule('/src/cart-jobs.ts');
await server.close();

test('the download bar keeps moving while the worker only says "not yet", and never claims to be done early', () => {
  assert.equal(estimatedPercent(0, 1, 0), 0);
  const steps = [5_000, 30_000, RENDER_PACE_MS, 3 * RENDER_PACE_MS, 30 * RENDER_PACE_MS].map(ms => estimatedPercent(0, 1, ms));
  for (let index = 1; index < steps.length; index++) assert.ok(steps[index] > steps[index - 1] || steps[index] === 95, `${steps}`);
  assert.ok(steps[0] > 3, 'it visibly starts within seconds');
  assert.equal(steps.at(-1), 95, 'it waits at 95% for a slow render');
  assert.equal(estimatedPercent(1, 1, 1000), 100);
  for (const ms of [1234, 45_678, 99_999]) assert.ok(Number.isInteger(estimatedPercent(1, 3, ms)), 'the cart shows a whole number');
});

test('a finished video counts in full, and the bar never goes back when one finishes', () => {
  const before = estimatedPercent(0, 3, 40_000);
  const after = estimatedPercent(1, 3, 40_000);
  assert.ok(after > before);
  assert.ok(estimatedPercent(2, 3, 0) >= 66);
  assert.ok(estimatedPercent(2, 3, 10 * RENDER_PACE_MS) <= 95);
  assert.equal(estimatedPercent(0, 0, 1000), 0);
});

test('a video taking longer than usual is told, with why the person need not wait on the page', () => {
  assert.equal(slowNote(0, 4), '');
  assert.match(slowNote(1, 4), /^1 video is taking longer than usual/);
  assert.match(slowNote(2, 4), /^2 videos are /);
  assert.match(slowNote(1, 1), /^This one is /);
  assert.match(slowNote(1, 4), /leave this page.*Media.*credit back/);
});
