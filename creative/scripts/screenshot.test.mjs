/**
 * Screenshot: each phrase is a message from one side or the other, in the song's order; the phone shows the time the card was made.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { chatMessages, clockFaces, clockNow } = await server.ssrLoadModule('/src/pack-screenshot.ts');
const pack = await server.ssrLoadModule('/src/creatives-pack.ts');
await server.close();

const LYRICS = 'I keep on running back to you | every night the city calls my name | hold me close until the morning | we were young and we were wild | dancing on the edge of something | never let the music stop';
const CUES = LYRICS.split(' | ').flatMap((line, row) => line.split(' ').map((text, k) => ({ text, startMs: row * 2000 + k * 300, endMs: row * 2000 + k * 300 + 280 })));

test('every phrase is a message, in the order it is sung, from both sides', () => {
  for (const seed of [1, 42, 777, 123456]) {
    const messages = chatMessages(CUES, seed);
    assert.equal(messages.map(message => message.text).join(' '), CUES.map(cue => cue.text).join(' '), `seed ${seed}`);
    assert.ok(messages.every((message, index) => index === 0 || message.atMs > messages[index - 1].atMs), `seed ${seed}: out of order`);
    assert.ok(messages.some(message => message.mine) && messages.some(message => !message.mine), `seed ${seed}: one side only`);
  }
});

test('the same seed makes the same chat; no lyrics, no messages', () => {
  assert.deepEqual(chatMessages(CUES, 9), chatMessages(CUES, 9));
  assert.deepEqual(chatMessages([], 9), []);
});

test('the clock reads like a phone: 12 hours in the status bar, AM or PM on a message', () => {
  assert.deepEqual(clockFaces('00:05'), { status: '12:05', message: '12:05 AM' });
  assert.deepEqual(clockFaces('13:40'), { status: '1:40', message: '1:40 PM' });
  assert.deepEqual(clockFaces('09:00'), { status: '9:00', message: '9:00 AM' });
  assert.match(clockNow(new Date(2026, 10, 19, 7, 3)), /^07:03$/);
});

test('Screenshot is made of the lyrics: off the shelf without them', () => {
  assert.ok(pack.rowsFor(false).some(row => row.id === 'screenshot'));
  assert.ok(!pack.rowsFor(true).some(row => row.id === 'screenshot'));
});

test('preview and cloud both carry the clock', () => {
  const studio = readFileSync(new URL('../src/creatives-pack-studio.tsx', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../../audio-intelligence/modal_creatives_encode_staging.py', import.meta.url), 'utf8');
  assert.ok(/slot\.treatment === 'screenshot' \? \{ clock: clockNow\(\) \}/.test(studio));
  assert.ok(/"clock",\n\}/.test(worker) && /CLOCK_RE/.test(worker));
});
