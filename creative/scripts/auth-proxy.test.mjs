/**
 * Sign-in through our own address: each request reaches Neon Auth as sent, from our origin, and its session cookie comes back
 * as our site's (no Domain), so browsers that block third-party cookies keep the person signed in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forwardAuth, ownCookie, upstreamUrl } from '../netlify/lib/auth-proxy.mjs';

const BASE = 'https://ep-x.neonauth.example.tech/neondb/auth';
const SITE = 'https://mumoo-staging.netlify.app';

test('a path under /api/neon-auth goes to the same path on Neon Auth, with its query; nothing else does', () => {
  assert.equal(upstreamUrl(`${SITE}/api/neon-auth/get-session`, BASE), `${BASE}/get-session`);
  assert.equal(upstreamUrl(`${SITE}/api/neon-auth/get-session?neon_auth_session_verifier=abc`, `${BASE}/`), `${BASE}/get-session?neon_auth_session_verifier=abc`);
  assert.equal(upstreamUrl(`${SITE}/api/neon-authx/get-session`, BASE), null);
  assert.equal(upstreamUrl(`${SITE}/api/neon-auth/../admin/overview`, BASE), null);
});

test("Neon's cookie is kept for our site: the same cookie without its Domain", () => {
  assert.equal(ownCookie('__Secure-neon-auth.session_token=abc; Path=/; Domain=ep-x.neonauth.example.tech; HttpOnly; Secure; SameSite=None'),
    '__Secure-neon-auth.session_token=abc; Path=/; HttpOnly; Secure; SameSite=None');
  assert.equal(ownCookie('a=1; Path=/; Secure'), 'a=1; Path=/; Secure');
});

test('a sign-in is passed on as sent, from our origin, and its answer comes back with our cookies', async () => {
  let seen;
  const fetcher = async (url, init) => {
    seen = { url, init, body: Buffer.from(init.body).toString() };
    const headers = new Headers({ 'content-type': 'application/json', 'access-control-allow-origin': SITE, 'content-encoding': 'gzip' });
    headers.append('set-cookie', '__Secure-neon-auth.session_token=t; Path=/; Domain=ep-x.neonauth.example.tech; HttpOnly; Secure; SameSite=None');
    headers.append('set-cookie', '__Secure-neon-auth.session_data=d; Path=/; HttpOnly; Secure');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  };
  const request = new Request(`${SITE}/api/neon-auth/sign-in/email-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie: 'x=1', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify({ email: 'a@b.c', otp: '123456' }),
  });
  const answer = await forwardAuth(request, BASE, fetcher);
  assert.equal(seen.url, `${BASE}/sign-in/email-otp`);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.body, '{"email":"a@b.c","otp":"123456"}');
  assert.equal(seen.init.headers.get('origin'), SITE, 'Neon sees the page\'s own origin, our site');
  assert.equal(seen.init.headers.get('cookie'), 'x=1');
  assert.equal(seen.init.headers.get('x-forwarded-for'), null);
  assert.equal(answer.status, 200);
  assert.deepEqual(await answer.json(), { ok: true });
  assert.deepEqual(answer.headers.getSetCookie(), [
    '__Secure-neon-auth.session_token=t; Path=/; HttpOnly; Secure; SameSite=None',
    '__Secure-neon-auth.session_data=d; Path=/; HttpOnly; Secure',
  ]);
  assert.equal(answer.headers.get('access-control-allow-origin'), null);
  assert.equal(answer.headers.get('content-encoding'), null);
  assert.equal(answer.headers.get('cache-control'), 'no-store');
});

test('a redirect from Neon is handed to the browser, not followed', async () => {
  const fetcher = async (_url, init) => {
    assert.equal(init.redirect, 'manual');
    return new Response(null, { status: 302, headers: { location: 'https://accounts.google.com/o/oauth2' } });
  };
  const answer = await forwardAuth(new Request(`${SITE}/api/neon-auth/sign-in/social`), BASE, fetcher);
  assert.equal(answer.status, 302);
  assert.equal(answer.headers.get('location'), 'https://accounts.google.com/o/oauth2');
});

test('a session check without a session cookie is answered at once, signed out; one with a cookie or a verifier still asks Neon', async () => {
  let asked = 0;
  const fetcher = async () => { asked += 1; return Response.json({ session: { token: 't' } }); };
  const check = (path, cookie) => forwardAuth(new Request(`${SITE}/api/neon-auth/${path}`, { headers: cookie ? { cookie } : {} }), BASE, fetcher);
  const quick = await check('get-session', 'mumoo-consent=1; _ga=x');
  assert.equal(await quick.json(), null);
  assert.equal(quick.headers.get('cache-control'), 'no-store');
  assert.equal(asked, 0, 'nobody to look up');
  await check('get-session', 'a=1; __Secure-neon-auth.session_token=abc');
  assert.equal(asked, 1, 'a session cookie is checked by Neon');
  await check('get-session?neon_auth_session_verifier=abc');
  assert.equal(asked, 2, 'the Google sign-in starts its session from the verifier');
  await check('sign-in/email-otp');
  assert.equal(asked, 3);
});
