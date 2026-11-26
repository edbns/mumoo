import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUMAN_HEADER, humanProblem, sendsEmail } from '../netlify/lib/turnstile.mjs';
import handler from '../netlify/functions/neon-auth.mjs';

/** The sign-in email is sent only for a person: Cloudflare Turnstile's token, checked before Neon is asked. */

const SEND = 'https://mumoo.app/api/neon-auth/email-otp/send-verification-otp';
const post = (url, headers = {}) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{"email":"a@b.co","type":"sign-in"}' });

function withKeys(secret, site, run) {
  const before = { TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY, TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY };
  for (const [name, value] of Object.entries({ TURNSTILE_SECRET_KEY: secret, TURNSTILE_SITE_KEY: site })) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  return Promise.resolve(run()).finally(() => {
    for (const [name, value] of Object.entries(before)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  });
}
const withSecret = (secret, run) => withKeys(secret, secret === undefined ? undefined : 'site-key', run);
const cloudflare = (answer) => async (_url, init) => { cloudflare.sent = Object.fromEntries(init.body); return Response.json(answer); };

test('only the requests that email someone are checked', () => {
  assert.equal(sendsEmail(post(SEND)), true);
  assert.equal(sendsEmail(post('https://mumoo.app/api/neon-auth/sign-in/email-otp')), false, 'typing the code sends nothing');
  assert.equal(sendsEmail(new Request('https://mumoo.app/api/neon-auth/get-session')), false);
});

test('a missing, refused or wrong-purpose token stops the email; a good one, an outage or no key lets it through', async () => {
  await withSecret('s3cret', async () => {
    assert.equal(await humanProblem(post(SEND), 'sign-in', cloudflare({ success: true })), 'missing');
    assert.equal(await humanProblem(post(SEND, { [HUMAN_HEADER]: 'tok' }), 'sign-in', cloudflare({ success: false, 'error-codes': ['invalid-input-response'] })), 'invalid-input-response');
    assert.equal(await humanProblem(post(SEND, { [HUMAN_HEADER]: 'tok' }), 'sign-in', cloudflare({ success: true, action: 'checkout' })), 'wrong-action');
    assert.equal(await humanProblem(post(SEND, { [HUMAN_HEADER]: 'tok', 'x-nf-client-connection-ip': '203.0.113.9' }), 'sign-in', cloudflare({ success: true, action: 'sign-in' })), null);
    assert.deepEqual(cloudflare.sent, { secret: 's3cret', response: 'tok', remoteip: '203.0.113.9' });
    assert.equal(await humanProblem(post(SEND, { [HUMAN_HEADER]: 'tok' }), 'sign-in', async () => { throw new Error('down'); }), null, 'an outage of the check never locks people out');
  });
  await withSecret(undefined, async () => assert.equal(await humanProblem(post(SEND), 'sign-in'), null));
  await withKeys('s3cret', undefined, async () => assert.equal(await humanProblem(post(SEND), 'sign-in'), null, 'a secret alone (pages built without the site key) refuses no one'));
});

test('Cloudflare itself agrees with its test keys', { skip: !process.env.TURNSTILE_LIVE && 'set TURNSTILE_LIVE=1 to ask Cloudflare' }, async () => {
  await withSecret('1x0000000000000000000000000000000AA', async () => assert.equal(await humanProblem(post(SEND, { [HUMAN_HEADER]: 'XXXX.DUMMY.TOKEN.XXXX' }), 'sign-in'), null));
  await withSecret('2x0000000000000000000000000000000AA', async () => assert.notEqual(await humanProblem(post(SEND, { [HUMAN_HEADER]: 'XXXX.DUMMY.TOKEN.XXXX' }), 'sign-in'), null));
});

test('the sign-in proxy answers a bot itself, and Neon never hears of it', async () => {
  const base = process.env.NEON_AUTH_BASE_URL;
  process.env.NEON_AUTH_BASE_URL = 'https://neon.invalid/auth';
  try {
    await withSecret('s3cret', async () => {
      const answer = await handler(post(SEND));
      assert.equal(answer.status, 403);
      assert.equal((await answer.json()).code, 'HUMAN_CHECK');
    });
  } finally {
    if (base === undefined) delete process.env.NEON_AUTH_BASE_URL; else process.env.NEON_AUTH_BASE_URL = base;
  }
});
