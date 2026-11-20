import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { SHELF_ROWS } = await server.ssrLoadModule('/src/creatives-pack.ts');
const learning = await server.ssrLoadModule('/src/admin/learning.tsx');
await server.close();

test('the Learning tab names every template of the shelf, in its order', () => {
  assert.deepEqual(Object.keys(learning.TEMPLATE_TITLES), SHELF_ROWS.map(row => row.id));
  assert.deepEqual(Object.values(learning.TEMPLATE_TITLES), SHELF_ROWS.map(row => row.title));
});

test('a template is judged by downloads out of the cards shown, against the shelf', () => {
  const shelf = 0.03;
  assert.equal(learning.verdict(10, 200, shelf), 'working', '5% against 3%');
  assert.equal(learning.verdict(6, 200, shelf), 'average');
  assert.equal(learning.verdict(2, 200, shelf), 'rework', '1% against 3%');
  assert.equal(learning.verdict(0, 200, shelf), 'rework', 'shown often, never downloaded');
  assert.equal(learning.verdict(2, 20, shelf), 'early', 'too few cards shown to say');
  assert.equal(learning.verdict(2, 40, shelf), 'average', 'a high rate on two downloads is not yet working');
});
