import { QUOTA_BYTES } from './allowance.mjs';
import { storageAlmostFull } from './letters.mjs';
import { db } from './person.mjs';

/** Past this share of the allowance we write once, so the person downloads and deletes before it is full (we pay for every byte). */
export const WARN_SHARE = 0.9;
/** Below this share the warning is forgotten, so filling up again warns again (the gap stops one file going back and forth from writing twice). */
export const CLEAR_SHARE = 0.8;

/** One pass. `send({to, subject, text})` writes the letters; it is passed in so a test can listen. Returns who was written to. */
export async function warnFullStorage({ send, siteUrl }) {
  const sql = db();
  const people = await sql`
    select u.id, u.email, u.storage_warned_at,
      (coalesce((select sum(bytes) from renders r where r.user_id = u.id), 0)
     + coalesce((select sum(bytes) from uploads p where p.user_id = u.id), 0))::float8 as used
    from app_users u
    where u.storage_warned_at is not null
       or exists (select 1 from renders r where r.user_id = u.id)
       or exists (select 1 from uploads p where p.user_id = u.id)`;
  const warned = [];
  for (const person of people) {
    if (person.storage_warned_at && person.used < QUOTA_BYTES * CLEAR_SHARE) {
      await sql`update app_users set storage_warned_at = null where id = ${person.id}`;
    } else if (!person.storage_warned_at && person.used >= QUOTA_BYTES * WARN_SHARE) {
      await send({ to: person.email, ...storageAlmostFull(person.used, QUOTA_BYTES, siteUrl) });
      await sql`update app_users set storage_warned_at = now() where id = ${person.id}`;
      warned.push(person.id);
    }
  }
  return warned;
}
