import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sweep } from '../netlify/lib/inactivity.mjs';
import { db, recordPerson } from '../netlify/lib/person.mjs';
import { putObject, storageReady } from '../netlify/lib/storage.mjs';

/** Live check of the 60/83/90-day clock against Postgres and R2, with a fake mailbox. Needs .env.local; skipped without it. */
const READY = storageReady() && Boolean(process.env.DATABASE_URL);

async function person(sql, daysAway) {
  const id = `test-${randomUUID()}`;
  const email = `${id}@example.com`;
  await sql`insert into app_users (id, email, last_seen_at) values (${id}, ${email}, now() - make_interval(days => ${daysAway}))`;
  const photo = randomUUID();
  await putObject(`uploads/${id}/${photo}.jpg`, new Uint8Array([0xff, 0xd8, 0xff, 1]), 'image/jpeg');
  await sql`insert into uploads (id, user_id, bytes, rights_confirmed_at) values (${photo}, ${id}, 4, now())`;
  return { id, email, photo };
}

test('people are written to at 60 and 83 days, files go at 90 only after the last letter, and a visit restarts the clock', { skip: !READY, timeout: 90000 }, async () => {
  const sql = db();
  const people = { fresh: await person(sql, 1), sixty: await person(sql, 61), eighty: await person(sql, 84), gone: await person(sql, 95) };
  const letters = [];
  const mine = (list) => list.filter(item => Object.values(people).some(p => p.id === item.id));
  const run = async () => mine((await sweep({ send: async (mail) => { if (mail.to.startsWith('test-')) letters.push(mail); }, siteUrl: 'https://example.test' })).deleted.map(id => ({ id })));
  try {
    // The 95-day person has never been written to, so they get the 83-day letter first and keep their files.
    assert.deepEqual(await run(), []);
    const to = (p) => letters.filter(mail => mail.to === p.email);
    assert.equal(to(people.fresh).length, 0);
    assert.equal(to(people.sixty).length, 1, 'the 61-day person is reminded once');
    assert.match(to(people.sixty)[0].text, /about 30 days/);
    assert.equal(to(people.eighty).length, 1);
    assert.equal(to(people.gone).length, 1, 'one letter, not two');
    const [{ n }] = await sql`select count(*)::int as n from uploads where user_id = ${people.gone.id}`;
    assert.equal(n, 1, 'files stay until the grace days after the last letter');

    await run();
    assert.equal(letters.length, 3, 'nobody is written to twice');

    await sql`update app_users set reminded_83_at = now() - interval '6 days' where id = ${people.gone.id}`;
    assert.deepEqual((await run()).map(item => item.id), [people.gone.id]);
    const [{ left }] = await sql`select count(*)::int as left from uploads where user_id = ${people.gone.id}`;
    assert.equal(left, 0, 'their pictures are deleted');
    const [{ kept }] = await sql`select count(*)::int as kept from uploads where user_id = any(${[people.fresh.id, people.sixty.id, people.eighty.id]})`;
    assert.equal(kept, 3, 'everyone else keeps theirs');

    await recordPerson({ id: people.sixty.id, email: people.sixty.email });
    const [row] = await sql`select reminded_60_at, reminded_83_at from app_users where id = ${people.sixty.id}`;
    assert.deepEqual([row.reminded_60_at, row.reminded_83_at], [null, null], 'a visit restarts the clock');
  } finally {
    await sql`delete from app_users where id = any(${Object.values(people).map(p => p.id)})`;
  }
});
