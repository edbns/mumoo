import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Live checks of Neon Auth (email-code sign-in, mail sent through Resend) and the /api/account guard.
 * Needs the Neon variables from `neon deploy` (.env.local); skipped without them.
 * A real code only ever arrives in the person's inbox, so the signed-in path is checked by hand
 * (sign in on the page, see your email in the masthead and a row in app_users).
 */
const READY = Boolean(process.env.DATABASE_URL && process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_JWKS_URL);
const ORIGIN = 'http://localhost:5173';
// Resend's own test inbox: it accepts mail like a real address and never bounces.
const INBOX = 'delivered@resend.dev';

const auth = (path, body) => fetch(`${process.env.NEON_AUTH_BASE_URL}/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body),
});

const call = async (token) => {
  const { default: handler } = await import('../netlify/functions/account/account.mjs');
  return handler(new Request('https://example.test/api/account', { headers: token ? { Authorization: `Bearer ${token}` } : {} }));
};

test('/api/account turns away requests without a valid Neon Auth token', { skip: !READY, timeout: 30000 }, async () => {
  assert.equal((await call(null)).status, 401, 'no token');
  assert.equal((await call('not.a.token')).status, 401, 'garbage token');
});

test('Neon Auth emails a sign-in code and refuses a wrong one', { skip: !READY, timeout: 30000 }, async () => {
  const sent = await auth('email-otp/send-verification-otp', { email: INBOX, type: 'sign-in' });
  assert.equal(sent.status, 200, await sent.clone().text());
  const wrong = await auth('sign-in/email-otp', { email: INBOX, otp: '000000' });
  assert.ok(wrong.status >= 400 && wrong.status < 500, `wrong code refused, got ${wrong.status}`);
});
