import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { db, recordPerson } from './person.mjs';
import { emailChangeCode } from './letters.mjs';
import { sendMail } from './mail.mjs';

/**
 * Changing a person's email, which Neon's managed sign-in does not allow: we email a 6-digit code to the new address, and once it is
 * entered we change the email in Neon's own user table (neon_auth."user") and in ours. The account id stays the same, so everything
 * the person made stays theirs, and Google sign-in keeps working (it is linked by Google's id, not the email).
 */
const CODE_MINUTES = 10;
const MOST_TRIES = 5;
/** A new code for the same person no sooner than this. */
const RESEND_SECONDS = 30;
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

const hashOf = (userId, email, code) => createHash('sha256').update(`${userId}:${email}:${code}`).digest('hex');
const refuse = (status, error) => ({ status, error });

/** Sends a code to `newEmail`. Returns {status: 200} or {status, error} with words to show. */
export async function requestEmailChange(person, newEmail) {
  const email = typeof newEmail === 'string' ? newEmail.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL.test(email)) return refuse(400, 'Check the email address and try again.');
  if (email === person.email.toLowerCase()) return refuse(400, 'That’s already your email.');
  const sql = db();
  const [taken] = await sql`select 1 from neon_auth."user" where email = ${email} and id::text <> ${person.id}`;
  if (taken) return refuse(409, 'That email already has a MUMOO account.');
  await recordPerson(person);
  const [recent] = await sql`select 1 from email_changes where user_id = ${person.id} and sent_at > now() - make_interval(secs => ${RESEND_SECONDS})`;
  if (recent) return refuse(429, 'A code was just sent. Wait a moment before asking for another.');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await sql`
    insert into email_changes (user_id, new_email, code_hash) values (${person.id}, ${email}, ${hashOf(person.id, email, code)})
    on conflict (user_id) do update set new_email = excluded.new_email, code_hash = excluded.code_hash, attempts = 0, sent_at = now()`;
  try {
    await sendMail({ to: email, ...emailChangeCode(code, CODE_MINUTES) });
  } catch (cause) {
    console.error('email change code:', cause);
    await sql`delete from email_changes where user_id = ${person.id}`;
    return refuse(502, 'Couldn’t send the code. Try again in a moment.');
  }
  return { status: 200 };
}

/** Checks the code and changes the email. Returns {status: 200, email} or {status, error} with words to show. */
export async function confirmEmailChange(person, newEmail, code) {
  const email = typeof newEmail === 'string' ? newEmail.trim().toLowerCase() : '';
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return refuse(400, 'That code is wrong or expired.');
  const sql = db();
  // Every try counts before the code is compared, so guesses run out even when they arrive together.
  const [pending] = await sql`
    update email_changes set attempts = attempts + 1
    where user_id = ${person.id} and new_email = ${email} and sent_at > now() - make_interval(mins => ${CODE_MINUTES}) and attempts < ${MOST_TRIES}
    returning code_hash`;
  if (!pending || !timingSafeEqual(Buffer.from(pending.code_hash), Buffer.from(hashOf(person.id, email, code)))) {
    return refuse(400, 'That code is wrong or expired.');
  }
  try {
    const [changed] = await sql`update neon_auth."user" set email = ${email}, "emailVerified" = true, "updatedAt" = now() where id::text = ${person.id} returning id`;
    if (!changed) return refuse(404, 'Sign in again to continue.');
  } catch (cause) {
    if (cause?.code === '23505') return refuse(409, 'That email already has a MUMOO account.');
    throw cause;
  }
  await sql`update app_users set email = ${email} where id = ${person.id}`;
  await sql`delete from email_changes where user_id = ${person.id}`;
  return { status: 200, email };
}
