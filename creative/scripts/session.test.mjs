import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { readSession, writeSession } = await server.ssrLoadModule('/src/session.ts');
const { readPending, writePending, expired } = await server.ssrLoadModule('/src/cart-jobs.ts');
await server.close();

const word = (text, startMs, endMs, line = 0) => ({ text, startMs, endMs, line, estimated: false });
const session = (change = {}) => ({
  sourceSha256: 'a'.repeat(64), genre: 'Pop', subGenre: 'General Pop', step: 2, clipStartMs: 42_000,
  words: [word('hello', 100, 400), word('world', 500, 900, 1)], lyricsOrigin: 'transcribed', lyricsLanguage: 'en', inCreatives: false, ...change,
});

test('a saved session comes back as it was, line breaks and all', () => {
  const saved = session({ inCreatives: true });
  assert.deepEqual(readSession(writeSession(saved)), saved);
  const { lyricsLanguage: _language, ...bare } = session({ words: [], step: 1 });
  void _language;
  assert.deepEqual(readSession(writeSession(bare)), bare);
});

test('nothing saved, damaged or from another version is no session', () => {
  assert.equal(readSession(null), null);
  assert.equal(readSession('{nope'), null);
  assert.equal(readSession(JSON.stringify({ version: 0, ...session() })), null);
  assert.equal(readSession(JSON.stringify({ ...session() })), null);
});

test('a session that does not hold together is refused', () => {
  const refused = [
    { sourceSha256: 'nope' },
    { step: 3 },
    { genre: 5 },
    { subGenre: 'x'.repeat(101) },
    { clipStartMs: -1 },
    { clipStartMs: 1.5 },
    { lyricsOrigin: 'guessed' },
    { lyricsLanguage: 7 },
    { inCreatives: 'yes' },
    { inCreatives: true, words: [] },
    { words: [word('b', 500, 900), word('a', 100, 400)] },
    { words: [word('late', 14_000, 15_001)] },
    { words: [{ text: 'x', startMs: 0, endMs: 5 }] },
    { words: [{ ...word('x', 0, 5), estimated: 'no' }] },
    { words: [word('', 0, 5)] },
    { words: 'text' },
  ];
  for (const change of refused) {
    assert.equal(readSession(JSON.stringify({ version: 2, ...session(change) })), null, JSON.stringify(change));
  }
});

const pending = (change = {}) => ({ songKey: 'sha:1000', startedAt: 1_000, jobs: [{ itemId: 'a', jobId: 'j1' }, { itemId: 'b', jobId: 'j2' }], ...change });

test('pending cloud jobs come back after a refresh with their song and items', () => {
  assert.deepEqual(readPending(writePending(pending())), pending());
});

test('missing or damaged pending jobs are no download', () => {
  assert.equal(readPending(null), null);
  assert.equal(readPending('{nope'), null);
  assert.equal(readPending(JSON.stringify({ version: 2, ...pending() })), null);
  for (const change of [{ songKey: '' }, { startedAt: 'now' }, { jobs: [] }, { jobs: [{ itemId: 'a' }] }, { jobs: [{ itemId: '', jobId: 'j' }] }, { jobs: 'x' }]) {
    assert.equal(readPending(JSON.stringify({ version: 1, ...pending(change) })), null, JSON.stringify(change));
  }
});

test('a download is only waited for as long as renders are', () => {
  assert.equal(expired(pending(), 1_000 + 900_000, 900_000), false);
  assert.equal(expired(pending(), 1_001 + 900_000, 900_000), true);
});
