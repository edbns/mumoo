import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  return { server, grade: await server.ssrLoadModule('/src/mood-grade.ts') };
}

const apply = (matrix, [r, g, b]) => [0, 1, 2].map(row => matrix[row * 5] * r + matrix[row * 5 + 1] * g + matrix[row * 5 + 2] * b + matrix[row * 5 + 4]);

test('neutral words grade nothing; the matrix for no change is the identity', async () => {
  const { server, grade } = await load();
  try {
    assert.equal(grade.moodGrade(null), undefined);
    assert.equal(grade.moodGrade({ attitude: 'neutral', sadness: 0, intensity: 3 }), undefined);
    const identity = grade.gradeMatrix({ saturation: 1, warmth: 0, brightness: 1, contrast: 1, calm: 0 });
    assert.deepEqual(identity, [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
    assert.equal(grade.calmBeat(0.8, undefined), 0.8);
  } finally { await server.close(); }
});

test('sad words desaturate, cool and darken; calm shrinks the beat but never removes it', async () => {
  const { server, grade } = await load();
  try {
    const sad = grade.moodGrade({ attitude: 'sad', sadness: 3, intensity: 1 });
    const [r, g, b] = apply(grade.gradeMatrix(sad), [0.8, 0.4, 0.2]);
    // An orange pixel turns duller, bluer and darker than it was.
    assert.ok(b / r > 0.2 / 0.8, 'cooler');
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 0.6, 'duller');
    assert.ok(0.2126 * r + 0.7152 * g + 0.0722 * b < 0.2126 * 0.8 + 0.7152 * 0.4 + 0.0722 * 0.2, 'darker');
    assert.equal(sad.calm, 1);
    assert.ok(Math.abs(grade.calmBeat(1, sad) - 0.35) < 1e-9);
    assert.ok(grade.calmBeat(1, sad) > 0);
  } finally { await server.close(); }
});

test('every grade the app can produce stays inside what the cloud renderer accepts', async () => {
  const { server, grade } = await load();
  try {
    const ranges = { saturation: [0.55, 1.15], warmth: [-1, 1], brightness: [0.8, 1], contrast: [1, 1.1], calm: [0, 1] };
    const { ATTITUDES } = await server.ssrLoadModule('/src/lyric-meaning.ts');
    for (const attitude of ATTITUDES) for (let sadness = 0; sadness <= 3; sadness++) for (let intensity = 1; intensity <= 5; intensity++) {
      const value = grade.moodGrade({ attitude, sadness, intensity });
      if (!value) continue;
      assert.deepEqual(Object.keys(value).sort(), Object.keys(ranges).sort());
      for (const [key, [low, high]] of Object.entries(ranges)) assert.ok(value[key] >= low && value[key] <= high, `${attitude} ${sadness} ${intensity} ${key}=${value[key]}`);
    }
  } finally { await server.close(); }
});
