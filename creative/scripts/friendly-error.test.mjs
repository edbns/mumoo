import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { friendlyError, quietError, NO_GRAPHICS, NO_WEBGL } = await server.ssrLoadModule('/src/friendly-error.ts');
await server.close();

const FALLBACK = 'Try again soon.';

test('the browser’s and the network’s words never reach the public', () => {
  const system = [
    new TypeError('Failed to fetch'), new TypeError('Load failed'), new TypeError('NetworkError when attempting to fetch resource.'),
    new SyntaxError('Unexpected token < in JSON at position 0'), new DOMException('The user aborted a request.', 'AbortError'),
    new DOMException('Unable to decode audio data', 'EncodingError'), new TypeError("Cannot read properties of undefined (reading 'id')"),
    new Error('Unable to fetch'), new Error('HTTP 502'), new Error('Open mumoo Staging to render a creative.'), new Error('Invalid request.'),
    new Error('<!doctype html><title>502</title>'), 'a string', null, undefined, {},
  ];
  for (const cause of system) assert.equal(friendlyError(cause, FALLBACK), FALLBACK, String(cause?.message ?? cause));
});

test('the words our own code wrote for the person come through', () => {
  for (const message of ['That picture has no cut-out yet.', 'Looks like you’re offline. Check your connection and try again.', 'That name is taken.']) {
    assert.equal(friendlyError(new Error(message), FALLBACK), message);
  }
  class LyricsError extends Error {}
  assert.equal(friendlyError(new LyricsError('Lyrics didn’t start. Reload and try again.'), FALLBACK), 'Lyrics didn’t start. Reload and try again.');
});

test('a tab left open over a deploy is asked to reload; the page’s own machinery only ever shows its fallback', () => {
  assert.match(friendlyError(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'), FALLBACK), /Reload/);
  assert.match(quietError(new TypeError('Importing a module script failed.'), FALLBACK), /Reload/);
  assert.equal(quietError(new Error('Dust is drawn from the lyrics alone.'), FALLBACK), FALLBACK);
});

test('no public page puts an error’s own message on screen', () => {
  const root = new URL('../src/', import.meta.url).pathname;
  const files = [];
  const walk = dir => readdirSync(dir).forEach(name => {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) { if (name !== 'admin') walk(path); } else if (/\.tsx?$/.test(name)) files.push(path);
  });
  walk(root.replace(/\/$/, ''));
  for (const file of files) {
    if (file.endsWith('friendly-error.ts')) continue;
    // Reports to our server may carry the real message; nothing else may.
    const lines = readFileSync(file, 'utf8').split('\n').filter(line => /(cause|error|reason)( as Error\))?\??\.message/.test(line) && !/reportProblem|note\(`(Uncaught|Unhandled)/.test(line));
    assert.deepEqual(lines, [], file);
  }
});

test('a browser that switched off graphics is told how to get them back, instead of blank cards', () => {
  assert.equal(quietError(new Error(NO_WEBGL), FALLBACK), NO_GRAPHICS);
  assert.match(NO_GRAPHICS, /Quit the browser/);
  assert.equal(quietError(new Error('Drawing took too long.'), FALLBACK), FALLBACK);
});
