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
test('approved media delivery only fetches the permitted museum image host and bounds content', async () => {
  env(); const original = globalThis.fetch;
  try {
    globalThis.fetch = async url => String(url).includes('mumoo-brain-staging') ? Response.json({ previewUrl: 'https://images.metmuseum.org/image.jpg' }) : new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
    const result = await media(request('/api/media-catalog', { operation: 'asset', id: 'met-123' }));
    assert.equal(result.status, 200); assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [1, 2, 3]);
    globalThis.fetch = async () => Response.json({ previewUrl: 'https://example.com/private' });
    assert.equal((await media(request('/api/media-catalog', { operation: 'asset', id: 'met-123' }))).status, 502);
    globalThis.fetch = async url => String(url).includes('mumoo-brain-staging') ? Response.json({ previewUrl: 'https://images.metmuseum.org/image.jpg' }) : new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/jpeg' } });
    assert.equal((await media(request('/api/media-catalog', { operation: 'asset', id: 'met-123' }))).status, 502);
  } finally { globalThis.fetch = original; }
});
test('director receives only bounded music timing and rejects invalid input', async () => {
  env(); const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (_url, options) => { calls++; const data = JSON.parse(options.body); assert.deepEqual(data.onsetsMs, [1000, 2000]); assert.equal('lyrics' in data.profile, false); return Response.json({ version: 1, status: 'unavailable' }); };
  try {
    assert.equal((await media(request('/api/media-catalog', { operation: 'director', profile, onsetsMs: [2000, 1000] }))).status, 400);
    assert.equal((await media(request('/api/media-catalog', { operation: 'director', profile: { ...profile, lyrics: 'private' }, onsetsMs: [1000] }))).status, 400);
    assert.equal(calls, 0);
    assert.equal((await media(request('/api/media-catalog', { operation: 'director', profile, onsetsMs: [1000, 2000] }))).status, 200);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test('research catalog operations require staging access and bounded provider input', async () => {
  env(); const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ assets: [] }); };
  try {
    assert.equal((await media(request('/api/media-catalog', { operation: 'research-list' }, 'invalid'))).status, 401);
    assert.equal((await media(request('/api/media-catalog', { operation: 'research-discover', provider: 'smithsonian', query: 'city', unit: '../x', shard: '00' }))).status, 400);
    assert.equal((await media(request('/api/media-catalog', { operation: 'research-review', id: 'cma-1', rightsStatus: 'APPROVED', adSafety: 'UNKNOWN' }))).status, 400);
    assert.equal((await media(request('/api/media-catalog', { operation: 'pixabay-search', query: '' }))).status, 400);
    assert.equal((await media(request('/api/media-catalog', { operation: 'pixabay-review', query: 'city', id: 'pixabay-1', rightsStatus: 'APPROVED', adSafety: 'SAFE', renderUrl: 'https://evil.example' }))).status, 400);
    assert.equal(calls, 0);
    assert.equal((await media(request('/api/media-catalog', { operation: 'research-list', offset: 0 }))).status, 200);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test('Core media delivery requires staging access and a permitted source', async () => {
  env(); const original = globalThis.fetch; let calls = 0;
  try {
    globalThis.fetch = async url => { calls++; return String(url).includes('mumoo-brain-staging') ? Response.json({ type: 'video', renderUrl: 'https://upload.wikimedia.org/a.webm' }) : new Response(new Uint8Array([1,2,3]), { headers: { 'content-type': 'video/webm' } }); };
    assert.equal((await media(request('/api/media-catalog', { operation: 'research-asset', id: 'commons2-1' }, 'invalid'))).status, 401); assert.equal(calls, 0);
    const result = await media(request('/api/media-catalog', { operation: 'research-asset', id: 'commons2-1' })); assert.equal(result.status, 200); assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [1,2,3]);
    globalThis.fetch = async () => Response.json({ type: 'video', renderUrl: 'https://evil.example/a.webm' });
    assert.equal((await media(request('/api/media-catalog', { operation: 'research-asset', id: 'commons2-1' }))).status, 502);
    assert.equal((await media(request('/api/media-catalog', { operation: 'research-plan', profile, onsetsMs: [2000, 1000] }))).status, 400);
  } finally { globalThis.fetch = original; }
});
test('owner footage upload requires tester access and stays within staging limits', async () => {
  env(); const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (_url, options) => { calls++; assert.equal(options.headers['x-mumoo-operation'], 'staging-upload'); assert.equal(options.headers.authorization, `Bearer ${service}`); return Response.json({ asset: { rights: 'STAGING_TEST_ONLY' } }); };
  const upload = (auth, tags = '') => new Request('https://mumoo-staging.netlify.app/api/media-catalog', { method: 'POST', headers: { origin: 'https://mumoo-staging.netlify.app', 'content-type': 'video/mp4', 'x-mumoo-brain-access': auth, 'x-mumoo-operation': 'staging-upload', 'x-mumoo-tags': tags }, body: new Uint8Array(100) });
  try {
    assert.equal((await media(upload('invalid'))).status, 401); assert.equal(calls, 0);
    assert.equal((await media(upload(token, 'invented'))).status, 400); assert.equal(calls, 0);
    assert.equal((await media(upload(token, 'people,street'))).status, 200); assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
