import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptableFile, acceptableFiles, HANDOFF_SECONDS, handoffFromToken, MAX_HANDOFF_BYTES, MAX_HANDOFF_FILES, newHandoff } from '../netlify/lib/handoff.mjs';

const KEY = 'k'.repeat(40);
const NOW = 1_800_000_000;

test('a phone link opens only its own handoff, of its own kind, and only for 15 minutes', () => {
  const { id, token } = newHandoff(KEY, 'song', NOW);
  assert.deepEqual(handoffFromToken(token, KEY, NOW + 60), { id, expiry: NOW + HANDOFF_SECONDS, kind: 'song' });
  assert.equal(handoffFromToken(newHandoff(KEY, 'picture', NOW).token, KEY, NOW)?.kind, 'picture');
  assert.equal(handoffFromToken(token, KEY, NOW + HANDOFF_SECONDS), null, 'expired');
  assert.equal(handoffFromToken(token, 'x'.repeat(40), NOW), null, 'another key');
  const [, expiry, kind, signature] = token.split('.');
  const other = newHandoff(KEY, 'song', NOW).id;
  assert.equal(handoffFromToken(`${other}.${expiry}.${kind}.${signature}`, KEY, NOW), null, 'pointed at another id');
  assert.equal(handoffFromToken(`${id}.${Number(expiry) + 600}.${kind}.${signature}`, KEY, NOW), null, 'stretched');
  assert.equal(handoffFromToken(`${id}.${expiry}.picture.${signature}`, KEY, NOW), null, 'given another kind');
  assert.equal(handoffFromToken('nonsense', KEY, NOW), null);
  assert.equal(handoffFromToken(token, 'short', NOW), null, 'a weak key opens nothing');
});

test('a song may be a song or a video; a picture a photo, video or GIF; nothing huge', () => {
  assert.equal(acceptableFile('song', 'audio/mpeg', 5_000_000), true);
  assert.equal(acceptableFile('song', 'video/quicktime', 90_000_000), true);
  assert.equal(acceptableFile('song', '', 5_000_000), true, 'phones often leave a song\'s type out; the computer checks the bytes');
  assert.equal(acceptableFile('song', 'image/png', 5_000), false);
  assert.equal(acceptableFile('picture', 'image/jpeg', 5_000_000), true);
  assert.equal(acceptableFile('picture', 'image/gif', 5_000_000), true);
  assert.equal(acceptableFile('picture', 'video/quicktime', 90_000_000), true);
  assert.equal(acceptableFile('picture', 'audio/mpeg', 5_000), false);
  assert.equal(acceptableFile('picture', '', 5_000), false, 'the computer needs a picture\'s type to send it on');
  assert.equal(acceptableFile('picture', 'image/svg+xml', 5_000), false);
  assert.equal(acceptableFile('song', 'text/html', 5_000), false);
  assert.equal(acceptableFile('song', 'audio/mpeg', MAX_HANDOFF_BYTES + 1), false);
  assert.equal(acceptableFile('song', 'audio/mpeg', 0), false);
  assert.equal(acceptableFile('other', 'audio/mpeg', 5), false);
});

test('the song step takes one file from a phone; the creatives up to ten, each one acceptable', () => {
  const photo = { type: 'image/jpeg', bytes: 5_000 };
  assert.equal(acceptableFiles('song', [{ type: 'audio/mpeg', bytes: 5_000 }]), true);
  assert.equal(acceptableFiles('song', [{ type: 'audio/mpeg', bytes: 5_000 }, { type: 'audio/mpeg', bytes: 5_000 }]), false, 'one song at a time');
  assert.equal(acceptableFiles('picture', Array(MAX_HANDOFF_FILES.picture).fill(photo)), true);
  assert.equal(acceptableFiles('picture', Array(MAX_HANDOFF_FILES.picture + 1).fill(photo)), false);
  assert.equal(acceptableFiles('picture', [photo, { type: 'audio/mpeg', bytes: 5_000 }]), false, 'one wrong file refuses the lot');
  assert.equal(acceptableFiles('picture', []), false);
  assert.equal(acceptableFiles('picture', 'nonsense'), false);
});
