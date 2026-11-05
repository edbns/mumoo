import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import handler, { validAccess } from '../netlify/functions/brain-gateway.mjs';

test('tester codes must be authentic and expire within one day', () => {
  const key = 'a'.repeat(40); const now = 1800000000;
  const code = expiry => `${expiry}.${createHmac('sha256', key).update(`mumoo-brain-staging:${expiry}`).digest('hex')}`;
  assert.equal(validAccess(code(now + 60), key, now), true);
  assert.equal(validAccess(code(now - 1), key, now), false);
  assert.equal(validAccess(code(now + 86401), key, now), false);
  assert.equal(validAccess(code(now + 60), 'b'.repeat(40), now), false);
});
test('gateway rejects unauthenticated, malformed, and private inputs', async () => {
  const old = { ...process.env };
  process.env.SITE_ID = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5'; process.env.MUMOO_BRAIN_TESTER_KEY = 'a'.repeat(40); process.env.MUMOO_BRAIN_SERVICE_SECRET = 'b'.repeat(40);
  const expiry = Math.floor(Date.now() / 1000) + 60;
  const access = `${expiry}.${createHmac('sha256', process.env.MUMOO_BRAIN_TESTER_KEY).update(`mumoo-brain-staging:${expiry}`).digest('hex')}`;
  const request = (token, payload) => new Request('https://mumoo-staging.netlify.app/api/brain-recommendations', { method: 'POST', headers: { origin: 'https://mumoo-staging.netlify.app', 'content-type': 'application/json', 'x-mumoo-brain-access': token }, body: JSON.stringify(payload) });
  try {
    assert.equal((await handler(request('bad', {}))).status, 401);
    assert.equal((await handler(request(access, { version: 1, videoType: 'visual', primaryGenre: 'house', lyrics: 'private' }))).status, 400);
    assert.equal((await handler(request(access, { version: 1, videoType: 'bad', primaryGenre: 'house' }))).status, 400);
    assert.equal((await handler(request(access, { version: 1, videoType: 'visual', primaryGenre: 'x'.repeat(9000) }))).status, 413);
  } finally { for (const key of ['SITE_ID', 'MUMOO_BRAIN_TESTER_KEY', 'MUMOO_BRAIN_SERVICE_SECRET']) { if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]; } }
});

test('gateway passes a validated profile and does not expose the service credential', async () => {
  const previous = { ...process.env }; const originalFetch = globalThis.fetch;
  process.env.SITE_ID = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5'; process.env.MUMOO_BRAIN_TESTER_KEY = 'a'.repeat(40); process.env.MUMOO_BRAIN_SERVICE_SECRET = 'b'.repeat(40);
  const expiry = Math.floor(Date.now() / 1000) + 60;
  const access = `${expiry}.${createHmac('sha256', process.env.MUMOO_BRAIN_TESTER_KEY).update(`mumoo-brain-staging:${expiry}`).digest('hex')}`;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://mumoo-brain-staging.netlify.app/api/recommend');
      assert.equal(options.headers.authorization, `Bearer ${process.env.MUMOO_BRAIN_SERVICE_SECRET}`);
      assert.deepEqual(JSON.parse(options.body), { version: 1, videoType: 'visual', primaryGenre: 'house' });
      return Response.json({ version: 1, catalogVersion: 1, algorithmVersion: 1, eligibleCount: 0, recommendations: [], catalog: [] });
    };
    const req = new Request('https://mumoo-staging.netlify.app/api/brain-recommendations', { method: 'POST', headers: { origin: 'https://mumoo-staging.netlify.app', 'content-type': 'application/json', 'x-mumoo-brain-access': access }, body: JSON.stringify({ version: 1, videoType: 'visual', primaryGenre: 'house' }) });
    const result = await handler(req); assert.equal(result.status, 200);
    assert.equal((await result.json()).eligibleCount, 0);
  } finally { globalThis.fetch = originalFetch; for (const key of ['SITE_ID', 'MUMOO_BRAIN_TESTER_KEY', 'MUMOO_BRAIN_SERVICE_SECRET']) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
});

test('Daily Screens is accepted only for lyric requests', async () => {
  const previous = { ...process.env }; const originalFetch = globalThis.fetch;
  process.env.SITE_ID = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5'; process.env.MUMOO_BRAIN_TESTER_KEY = 'a'.repeat(40); process.env.MUMOO_BRAIN_SERVICE_SECRET = 'b'.repeat(40);
  const expiry = Math.floor(Date.now() / 1000) + 60;
  const access = `${expiry}.${createHmac('sha256', process.env.MUMOO_BRAIN_TESTER_KEY).update(`mumoo-brain-staging:${expiry}`).digest('hex')}`;
  const item = { id: 'daily-screens', name: 'Daily Screens', description: 'Timed lyrics', version: 1, renderer: { kind: 'existing_canvas', template: 'daily-screens' }, preview: true, export: true };
  try {
    globalThis.fetch = async () => Response.json({ version: 1, catalogVersion: 2, algorithmVersion: 1, eligibleCount: 1, recommendations: [{ ...item, explanation: 'Supports timed lyrics.' }], catalog: [item] });
    const request = videoType => new Request('https://mumoo-staging.netlify.app/api/brain-recommendations', { method: 'POST', headers: { origin: 'https://mumoo-staging.netlify.app', 'content-type': 'application/json', 'x-mumoo-brain-access': access }, body: JSON.stringify({ version: 1, videoType, primaryGenre: 'house' }) });
    assert.equal((await handler(request('lyric'))).status, 200);
    assert.equal((await handler(request('visual'))).status, 502);
  } finally { globalThis.fetch = originalFetch; for (const key of ['SITE_ID', 'MUMOO_BRAIN_TESTER_KEY', 'MUMOO_BRAIN_SERVICE_SECRET']) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
});
