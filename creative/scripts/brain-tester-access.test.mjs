import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/brain-tester-access.mjs';
import { validAccess } from '../netlify/functions/brain-gateway.mjs';
test('issuer requires an independent password and mints a short-lived signed token', async () => {
  const previous = { ...process.env };
  process.env.SITE_ID = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
  process.env.MUMOO_BRAIN_TESTER_KEY = 'a'.repeat(40);
  process.env.MUMOO_BRAIN_TESTER_PASSWORD = 'b'.repeat(40);
  const request = password => new Request('https://mumoo-staging.netlify.app/api/brain-tester-access', { method: 'POST', headers: { origin: 'https://mumoo-staging.netlify.app', 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
  try {
    assert.equal((await handler(request('wrong'))).status, 401);
    const result = await handler(request('b'.repeat(40))); assert.equal(result.status, 200);
    const body = await result.json(); assert.equal(validAccess(body.token, process.env.MUMOO_BRAIN_TESTER_KEY), true);
    assert.ok(body.expires <= Math.floor(Date.now() / 1000) + 900);
    assert.doesNotMatch(JSON.stringify(body), /aaaaaaaa|bbbbbbbb/);
    delete process.env.MUMOO_BRAIN_TESTER_PASSWORD;
    assert.equal((await handler(request('wrong'))).status, 503);
  } finally { for (const key of ['SITE_ID', 'MUMOO_BRAIN_TESTER_KEY', 'MUMOO_BRAIN_TESTER_PASSWORD']) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
});
