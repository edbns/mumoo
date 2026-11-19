import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { allowanceOf } from '../netlify/lib/credits.mjs';
import { db } from '../netlify/lib/person.mjs';
import { claimReferral, codeFor, firstPackBonus, referralStats, revokeReferral, rewardReferral, validCode } from '../netlify/lib/referrals.mjs';

/** Live check of give 10, get 10 against Postgres. Needs .env.local; skipped without it. */
const READY = Boolean(process.env.DATABASE_URL);

async function person(sql, made = 'now()') {
  const id = `test-${randomUUID()}`;
  await sql`insert into app_users (id, email, created_at) values (${id}, ${`${id}@example.com`}, ${made === 'now()' ? new Date() : made})`;
  return id;
}
const pay = (sql, userId, videos = 20) => {
  const id = `test-order-${randomUUID()}`;
  return sql`insert into credit_orders (id, user_id, videos, amount, currency, status) values (${id}, ${userId}, ${videos}, 500, 'USD', 'paid')`.then(() => id);
};

test('codes are short, readable and checked before any lookup', () => {
  assert.ok(validCode('ab23cd45'));
  for (const bad of ['', 'a', 'AB23CD45', 'ab23cd45; drop', 'x'.repeat(17), null, 12345678]) assert.equal(validCode(bad), false, String(bad));
});

test('give 10, get 10: friends join with the link, both get 10 on the first paid pack only, a refund takes both back', { skip: !READY, timeout: 60000 }, async () => {
  const sql = db();
  const made = [];
  const add = async created => { const id = await person(sql, created); made.push(id); return id; };
  try {
    const inviter = await add();
    const code = await codeFor(inviter);
    assert.ok(validCode(code));
    assert.equal(await codeFor(inviter), code, 'the code is kept');

    assert.equal(await claimReferral(inviter, code), 'self');
    assert.equal(await claimReferral(inviter, 'nosuchcode'), 'unknown');
    const old = await add(new Date(Date.now() - 30 * 86400_000));
    assert.equal(await claimReferral(old, code), 'not_new', 'an older account did not sign up with the link');
    const paidAlready = await add();
    await pay(sql, paidAlready);
    assert.equal(await claimReferral(paidAlready, code), 'not_new', 'someone who already paid is not a new friend');

    const friend = await add();
    assert.equal(await firstPackBonus(friend), 0);
    assert.equal(await claimReferral(friend, code), 'joined');
    assert.equal(await claimReferral(friend, code), 'already');
    assert.equal(await firstPackBonus(friend), 10);

    const order = await pay(sql, friend, 20);
    const reward = await rewardReferral(friend, order);
    assert.equal(reward.referrerId, inviter);
    assert.equal(reward.rewarded, true);
    assert.equal(await rewardReferral(friend, order), null, 'Polar sending the event again gives nothing more');
    assert.equal((await allowanceOf(friend)).credits, 30, '20 bought + 10 from the invite');
    assert.equal((await allowanceOf(inviter)).credits, 10);
    assert.equal(await firstPackBonus(friend), 0);

    const second = await pay(sql, friend, 100);
    assert.equal(await rewardReferral(friend, second), null, 'only the first pack counts');
    assert.equal((await allowanceOf(inviter)).credits, 10);

    assert.deepEqual(await referralStats(inviter), { joined: 1, bought: 1, thisMonth: 1, earned: 10, cap: 20, videos: 10 });

    await sql`update credit_orders set status = 'refunded' where id = ${order}`;
    await revokeReferral(order);
    await revokeReferral(order);
    assert.equal((await allowanceOf(friend)).credits, 100, 'the refunded pack and its bonus are gone');
    assert.equal((await allowanceOf(inviter)).credits, 0);
    assert.equal((await referralStats(inviter)).thisMonth, 0, 'the place under the cap is freed');
  } finally {
    for (const id of made.reverse()) await sql`delete from app_users where id = ${id}`;
  }
});

test('the cap: past it, friends still get their 10 but the inviter gets nothing more that month', { skip: !READY, timeout: 90000 }, async () => {
  const sql = db();
  const made = [];
  const add = async () => { const id = await person(sql); made.push(id); return id; };
  try {
    const inviter = await add();
    await sql`update app_users set referral_cap = 2 where id = ${inviter}`;
    const code = await codeFor(inviter);
    const friends = [await add(), await add(), await add()];
    for (const friend of friends) assert.equal(await claimReferral(friend, code), 'joined');
    // All three pay at the same moment: exactly two places under the cap are taken.
    const rewards = await Promise.all(friends.map(async friend => rewardReferral(friend, await pay(sql, friend, 20))));
    assert.equal(rewards.filter(reward => reward?.rewarded).length, 2);
    assert.equal(rewards.filter(Boolean).length, 3);
    for (const friend of friends) assert.equal((await allowanceOf(friend)).credits, 30);
    assert.equal((await allowanceOf(inviter)).credits, 20);
    assert.equal((await referralStats(inviter)).thisMonth, 2);
  } finally {
    for (const id of made.reverse()) await sql`delete from app_users where id = ${id}`;
  }
});

test('the pricing page and popups say the same numbers the server gives', async () => {
  const { readFileSync } = await import('node:fs');
  const { REFERRAL_CAP, REFERRAL_VIDEOS } = await import('../netlify/lib/referrals.mjs');
  const pricing = readFileSync(new URL('../src/pricing-page.tsx', import.meta.url), 'utf8');
  assert.match(pricing, new RegExp(`they get ${REFERRAL_VIDEOS} extra on their first pack, you get ${REFERRAL_VIDEOS} free once they pay`));
  assert.match(pricing, new RegExp(`up to ${REFERRAL_CAP} friends a month`));
  assert.match(pricing, new RegExp(`comes with ${REFERRAL_VIDEOS} extra videos`));
  const route = readFileSync(new URL('../netlify/functions/referral.mjs', import.meta.url), 'utf8');
  assert.match(route, /path: '\/api\/referral'/);
});
