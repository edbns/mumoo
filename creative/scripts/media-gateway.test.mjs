import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import media from '../netlify/functions/media-gateway.mjs';
import music from '../netlify/functions/analyze-music.mjs';
const key = 'k'.repeat(48), service = 's'.repeat(48), musicSecret = 'm'.repeat(48);
const expiry = Math.floor(Date.now() / 1000) + 600;
const token = `${expiry}.${createHmac('sha256', key).update(`mumoo-brain-staging:${expiry}`).digest('hex')}`;
const profile = { version: 1, videoType: 'visual', primaryGenre: 'House', music: { beatsMs: [1000, 2000], tempoStatus: 'unavailable', gridBpm: null, rmsMean: 0.2, onsetCount: 2, centroidHz: 1000, dynamics: 'unavailable' } };
function env() { process.env.SITE_ID = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5'; process.env.MUMOO_BRAIN_TESTER_KEY = key; process.env.MUMOO_BRAIN_SERVICE_SECRET = service; process.env.MUMOO_MUSIC_BRIDGE_SECRET = musicSecret; }
function request(path, body, auth = token) { return new Request(`https://mumoo-staging.netlify.app${path}`, { method: 'POST', headers: { origin: 'https://mumoo-staging.netlify.app', 'content-type': 'application/json', 'x-mumoo-brain-access': auth }, body: JSON.stringify(body) }); }
test('media gateway rejects unauthenticated and private input before contacting Brain', async () => {
  env(); const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  try {
    assert.equal((await media(request('/api/media-catalog', { operation: 'list' }, 'invalid'))).status, 401);
    assert.equal((await media(request('/api/media-catalog', { operation: 'recommend', profile: { ...profile, lyrics: 'private' } }))).status, 400);
    assert.equal((await media(request('/api/media-catalog', { operation: 'recommend', profile: { ...profile, music: undefined } }))).status, 400);
    assert.equal(calls, 0);
    assert.equal((await media(request('/api/media-catalog', { operation: 'recommend', profile }))).status, 200); assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test('music gateway forwards only the selected clip and server credential after tester authentication', async () => {
  env(); const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (_url, options) => { calls++; assert.equal(options.body.byteLength, 480044); assert.equal(options.headers.Authorization, `Bearer ${musicSecret}`); assert.equal('X-Mumoo-Brain-Access' in options.headers, false); return Response.json({ version: 1 }); };
  const make = auth => new Request('https://mumoo-staging.netlify.app/.netlify/functions/analyze-music', { method: 'POST', headers: { origin: 'https://mumoo-staging.netlify.app', 'content-type': 'audio/wav', 'x-mumoo-brain-access': auth }, body: new Uint8Array(480044) });
  try { assert.equal((await music(make('invalid'))).status, 401); assert.equal(calls, 0); assert.equal((await music(make(token))).status, 200); assert.equal(calls, 1); }
  finally { globalThis.fetch = original; }
});
