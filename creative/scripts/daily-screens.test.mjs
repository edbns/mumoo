import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('Daily Screens preserves approved words and reveals them only on their timed frames', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { dailyScreenFrame } = await server.ssrLoadModule('/src/daily-screens.ts');
    const cues = [
      { text: 'Make', startMs: 1000, endMs: 1200 },
      { text: 'it', startMs: 1200, endMs: 1400 },
      { text: 'move!', startMs: 1400, endMs: 1800 },
      { text: 'Again.', startMs: 2500, endMs: 2800 },
    ];
    assert.deepEqual(dailyScreenFrame(cues, 29).lines, []);
    assert.deepEqual(dailyScreenFrame(cues, 30).lines.map(line => line.text), ['Make']);
    assert.deepEqual(dailyScreenFrame(cues, 42).lines.map(line => line.text), ['Make it move!']);
    assert.deepEqual(dailyScreenFrame(cues, 75).lines.map(line => line.text), ['Make it move!', 'Again.']);
    assert.deepEqual(dailyScreenFrame(cues, 75), dailyScreenFrame(cues, 75));
    assert.deepEqual(dailyScreenFrame([{ text: 'End', startMs: 14990, endMs: 15000 }], 449).lines.map(line => line.text), ['End']);
  } finally { await server.close(); }
});

test('long unspaced lyrics fit the bubble and the newest message stays visible', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { wrapScreenText, layoutScreenLines } = await server.ssrLoadModule('/src/daily-screens.ts');
    const ctx = { measureText: value => ({ width: [...value].length * 40 }) };
    const word = '世界'.repeat(24);
    const wrapped = wrapScreenText(ctx, word, 670);
    assert.equal(wrapped.join(''), word);
    assert.ok(wrapped.every(line => ctx.measureText(line).width <= 670));
    const emoji = '👩‍🎤'.repeat(12);
    const emojiLines = wrapScreenText(ctx, emoji, 150);
    assert.equal(emojiLines.join(''), emoji);
    assert.ok(emojiLines.every(line => line === '👩‍🎤'));
    const lines = Array.from({ length: 4 }, (_, i) => ({ text: word, startFrame: i, active: i === 3 }));
    const layout = layoutScreenLines(ctx, lines);
    assert.equal(layout.at(-1).line.text, word);
    assert.ok(layout.at(-1).y + layout.at(-1).height <= 1550);
  } finally { await server.close(); }
});
