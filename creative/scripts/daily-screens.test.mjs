import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('screen status is deterministic and chat timestamps use one tick', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { screenDeviceStatus, formatChatTime, chatBubbleWidth } = await server.ssrLoadModule('/src/daily-screens.ts');
    const time = new Date(2026, 10, 6, 14, 7).getTime();
    assert.deepEqual(screenDeviceStatus(time), screenDeviceStatus(time));
    assert.equal(screenDeviceStatus(time).batteryPercent, 12);
    assert.equal(formatChatTime(time, 0), '2:07 ✓');
    assert.ok(chatBubbleWidth(180, 72) <= 245);
    assert.ok(chatBubbleWidth(25, 72) >= 104);
  } finally { await server.close(); }
});

test('five screen designs use a captured real time and reject invalid variants', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { SCREEN_DESIGNS, formatScreenClock } = await server.ssrLoadModule('/src/daily-screens.ts');
    const { validate } = await server.ssrLoadModule('/src/composition.ts');
    assert.deepEqual(SCREEN_DESIGNS.map(design => design.id), ['messages', 'whatsapp', 'telegram', 'messenger', 'instagram']);
    const capturedAtMs = new Date(2026, 10, 6, 14, 7).getTime();
    assert.equal(formatScreenClock(capturedAtMs, 0).time, '2:07');
    const nearNextMinute = new Date(2026, 10, 6, 14, 7, 59).getTime();
    assert.equal(formatScreenClock(nearNextMinute, 0).time, '2:07');
    assert.equal(formatScreenClock(nearNextMinute, 60).time, '2:08');
    const base = { version: 2, template: 'daily-screens', sourceSha256: 'a'.repeat(64), clipStartMs: 0, cues: [{ text: 'Hello', startMs: 0, endMs: 1000 }] };
    for (const { id } of SCREEN_DESIGNS) assert.doesNotThrow(() => validate({ ...base, dailyScreen: { variant: id, capturedAtMs } }, 15000));
    assert.throws(() => validate({ ...base, dailyScreen: { variant: 'invalid', capturedAtMs } }, 15000));
    assert.throws(() => validate({ ...base, dailyScreen: null }, 15000));
    assert.throws(() => validate({ ...base, dailyScreen: { variant: 'messages', capturedAtMs: 8640000000000000 } }, 15000));
  } finally { await server.close(); }
});

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
