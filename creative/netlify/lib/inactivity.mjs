import { db } from './person.mjs';
import { removeRender } from './renders.mjs';
import { removeUpload } from './uploads.mjs';

/**
 * Nobody's files are kept forever for an account nobody uses. After 60 days without a visit we write to them,
 * after 83 days we write again, and after 90 days (and at least five days after that last letter) their
 * creatives and pictures are deleted. The account itself stays. Coming back clears the clock.
 */
export const REMIND_DAYS = [83, 60];
export const DELETE_DAYS = 90;
const GRACE_DAYS = 5;

const hasFiles = (userId) => db()`
  select (exists (select 1 from renders where user_id = ${userId}) or exists (select 1 from uploads where user_id = ${userId})) as has`;

function letter(days, siteUrl) {
  const left = DELETE_DAYS - days;
  return {
    subject: left > 10 ? 'Your MUMOO creatives are waiting' : `Your MUMOO files will be deleted in ${left} days`,
    text: [
      `You have not been to MUMOO for ${days} days.`,
      '',
      `To keep storage tidy, the creatives and pictures saved in your account are deleted after ${DELETE_DAYS} days without a visit. That is in about ${left} days.`,
      '',
      `Sign in at ${siteUrl} before then and everything stays. To keep a copy, open My library and choose "Download everything".`,
      '',
      'MUMOO',
    ].join('\n'),
  };
}

/** One pass. `send({to, subject, text})` writes the letters; it is passed in so a test can listen. */
export async function sweep({ send, siteUrl }) {
  const sql = db();
  const sent = [];
  for (const days of REMIND_DAYS) {
    // Past 83 days the 60-day letter is moot, so that one letter settles both.
    const due = days === 83
      ? await sql`select id, email from app_users where last_seen_at < now() - make_interval(days => ${days}) and reminded_83_at is null`
      : await sql`select id, email from app_users where last_seen_at < now() - make_interval(days => ${days}) and reminded_60_at is null`;
    for (const person of due) {
      const [{ has }] = await hasFiles(person.id);
      if (!has) continue;
      await send({ to: person.email, ...letter(days, siteUrl) });
      if (days === 83) await sql`update app_users set reminded_83_at = now(), reminded_60_at = coalesce(reminded_60_at, now()) where id = ${person.id}`;
      else await sql`update app_users set reminded_60_at = now() where id = ${person.id}`;
      sent.push({ id: person.id, days });
    }
  }
  const expired = await sql`
    select id from app_users
    where last_seen_at < now() - make_interval(days => ${DELETE_DAYS})
      and reminded_83_at is not null and reminded_83_at < now() - make_interval(days => ${GRACE_DAYS})`;
  const deleted = [];
  for (const person of expired) {
    const renders = await sql`select id from renders where user_id = ${person.id}`;
    const uploads = await sql`select id from uploads where user_id = ${person.id}`;
    for (const row of renders) await removeRender(person.id, row.id);
    for (const row of uploads) await removeUpload(person.id, row.id);
    if (renders.length || uploads.length) deleted.push(person.id);
  }
  return { sent, deleted };
}
