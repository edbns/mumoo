import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { QUOTA_BYTES } from '../netlify/lib/allowance.mjs';
import { accountDeleted, creditsAdded, emailChangeCode, inactivityReminder, referralEarned, signInCode, storageAlmostFull } from '../netlify/lib/letters.mjs';
import { db } from '../netlify/lib/person.mjs';
import { warnFullStorage } from '../netlify/lib/storage-warning.mjs';

/** Every email we send, the webhook that sends Neon's sign-in codes, and the almost-full storage letter. */

const SITE = 'https://mumoo-staging.netlify.app';
const LETTERS = {
  'sign-in code': signInCode('123456', 5),
  'password code': signInCode('123456', 5, 'forget-password'),
  'email change code': emailChangeCode('654321', 10),
  'account deleted': accountDeleted(),
  'inactivity, early': inactivityReminder(60, 90, SITE),
  'inactivity, late': inactivityReminder(83, 90, SITE),
  'storage almost full': storageAlmostFull(4.6e9, QUOTA_BYTES, SITE),
  'credits added': creditsAdded(100, 120, '$20.00', SITE),
  'credits added with an invite': creditsAdded(20, 30, '$5.00', SITE, 10),
  'referral earned': referralEarned(10, 15, SITE),
};

test('every letter is from mumoo in lowercase, never says app, and shows no address or name', () => {
  for (const [name, { subject, text }] of Object.entries(LETTERS)) {
    const all = `${subject}\n${text}`.replace(SITE, 'SITE');
    assert.match(all, /mumoo/, name);
    assert.doesNotMatch(all, /MUMOO|Mumoo|\bapp\b/, `${name} writes mumoo in lowercase and never "app"`);
    assert.doesNotMatch(all, /@|\bHi\b|\bDear\b/, `${name} greets nobody and shows no address`);
    assert.match(text, /\nmumoo$/, `${name} is signed mumoo`);
  }
});

test('the receipt says what was added and paid, and where the invoice is', () => {
  const { subject, text } = LETTERS['credits added'];
  assert.equal(subject, 'Your 100 mumoo videos are ready');
  assert.match(text, /You paid \$20\.00\. You now have 120 credits\./);
  assert.match(text, /https:\/\/mumoo-staging\.netlify\.app\/invoices/);
});

test('an invited friend\'s receipt counts the invite, and the inviter is told what they earned', () => {
  const friend = LETTERS['credits added with an invite'];
  assert.equal(friend.subject, 'Your 30 mumoo videos are ready');
  assert.match(friend.text, /20 video credits are now in your mumoo account/);
  assert.match(friend.text, /Your friend's invite added 10 more, free\./);
  assert.doesNotMatch(LETTERS['credits added'].text, /invite/);
  const inviter = LETTERS['referral earned'];
  assert.equal(inviter.subject, 'A friend joined mumoo: 10 free videos for you');
  assert.match(inviter.text, /You now have 15 credits\./);
  assert.match(inviter.text, /Invite friends/);
});

test('a code is in the subject', () => {
  assert.equal(LETTERS['sign-in code'].subject, '123456 is your mumoo code');
  assert.equal(LETTERS['email change code'].subject, '654321 is your mumoo code');
  assert.match(LETTERS['password code'].text, /reset your password/);
});

test('the storage letter says how full it is', () => {
  assert.match(LETTERS['storage almost full'].text, /4\.6 GB of 5 GB/);
  assert.match(LETTERS['inactivity, early'].text, /about 30 days/);
  assert.match(LETTERS['inactivity, late'].subject, /deleted in 7 days/);
});

/** Neon's signature: Ed25519 over `header.base64url(timestamp.base64url(body))`, sent as a detached JWS. */
function signed(body, privateKey, kid, timestamp = Date.now()) {
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid })).toString('base64url');
  const payload = Buffer.from(`${timestamp}.${Buffer.from(body).toString('base64url')}`).toString('base64url');
  const signature = sign(null, Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return new Headers({ 'x-neon-signature': `${header}..${signature}`, 'x-neon-signature-kid': kid, 'x-neon-timestamp': String(timestamp) });
}

test('the sign-in webhook mails Neon\'s code from mumoo, once per event, and only when Neon signed it', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const kid = `test-${randomUUID()}`;
  const saved = { jwks: process.env.NEON_AUTH_JWKS_URL, resend: process.env.RESEND_API_KEY, fetch: globalThis.fetch };
  process.env.NEON_AUTH_JWKS_URL = `data:application/json,${encodeURIComponent(JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid }] }))}`;
  process.env.RESEND_API_KEY = 'test';
  const sent = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.resend.com/')) { sent.push({ ...JSON.parse(init.body), once: init.headers['Idempotency-Key'] }); return new Response('{}'); }
    return saved.fetch(url, init);
  };
  try {
    const { default: handler } = await import('../netlify/functions/auth-email.mjs');
    const post = (body, headers) => handler(new Request('https://example.test/api/auth/email', { method: 'POST', body, headers }));
    const event = JSON.stringify({
      event_id: 'evt-1', event_type: 'send.otp', user: { email: 'someone@example.com', name: '' },
      event_data: { otp_code: '482913', otp_type: 'sign-in', expires_at: new Date(Date.now() + 5 * 60_000).toISOString() },
    });

    assert.equal((await post(event, signed(event, privateKey, kid))).status, 200);
    assert.equal(sent.length, 1);
    assert.deepEqual([sent[0].from, sent[0].to, sent[0].subject, sent[0].once], ['mumoo <moo@mumoo.app>', 'someone@example.com', '482913 is your mumoo code', 'neon-evt-1']);
    assert.match(sent[0].text, /works for 5 minutes/);
    assert.ok(!sent[0].text.includes('someone@example.com'));

    const forged = event.replace('482913', '000000');
    assert.equal((await post(forged, signed(event, privateKey, kid))).status, 401, 'a changed body is refused');
    assert.equal((await post(event, signed(event, privateKey, kid, Date.now() - 10 * 60_000))).status, 401, 'an old request is refused');
    assert.equal((await post(event, signed(event, generateKeyPairSync('ed25519').privateKey, kid))).status, 401, 'another key is refused');
    assert.equal((await post(event, new Headers())).status, 401, 'an unsigned request is refused');
    const other = JSON.stringify({ event_id: 'evt-2', event_type: 'user.created', user: { email: 'someone@example.com' } });
    assert.equal((await post(other, signed(other, privateKey, kid))).status, 200, 'other events are let through');
    assert.equal(sent.length, 1, 'and nothing else was mailed');
  } finally {
    process.env.NEON_AUTH_JWKS_URL = saved.jwks;
    if (saved.resend === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.resend;
    globalThis.fetch = saved.fetch;
  }
});

test('storage is reported almost full once, and again only after the person has made room', { skip: !process.env.DATABASE_URL, timeout: 60000 }, async () => {
  const sql = db();
  const id = `test-${randomUUID()}`;
  const email = `${id}@example.com`;
  const letters = [];
  const run = () => warnFullStorage({ send: async (mail) => { if (mail.to === email) letters.push(mail); }, siteUrl: SITE });
  /** Their uploads add up to `share` of the allowance (a row holds at most 2 GB, so in three). */
  const fill = async (share) => {
    await sql`delete from uploads where user_id = ${id}`;
    for (let n = 0; n < 3; n++) await sql`insert into uploads (id, user_id, kind, bytes, rights_confirmed_at) values (${randomUUID()}, ${id}, 'photo', ${Math.round(QUOTA_BYTES * share / 3)}, now())`;
  };
  try {
    await sql`insert into app_users (id, email) values (${id}, ${email})`;
    await fill(0.85);
    await run();
    assert.equal(letters.length, 0, 'at 85% nobody is written to');
    await fill(0.92);
    await run();
    await run();
    assert.equal(letters.length, 1, 'past 90% once, not every day');
    assert.match(letters[0].text, /4\.6 GB of 5 GB/);
    await fill(0.85);
    await run();
    const [{ warned }] = await sql`select storage_warned_at as warned from app_users where id = ${id}`;
    assert.ok(warned, 'dropping a little under 90% is not yet room made');
    await fill(0.1);
    await run();
    await fill(0.95);
    await run();
    assert.equal(letters.length, 2, 'filling up again after making room warns again');
  } finally {
    await sql`delete from app_users where id = ${id}`;
  }
});
