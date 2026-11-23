import { allowanceOf } from './credits.mjs';
import { friendInvite, welcome } from './letters.mjs';
import { sendMail } from './mail.mjs';
import { db } from './person.mjs';
import { REFERRAL_VIDEOS } from './referrals.mjs';

/** How many invites one person can email a day. */
export const INVITES_A_DAY = 10;
/** An address gets at most one invite this often, however many people ask. */
const SAME_ADDRESS = '30 days';
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Welcomes a new account once, the first time it is seen, when its free video is still to come (an address that had its free
 * video on an earlier account is not welcomed again). A letter that does not go is not tried again.
 */
export async function welcomeOnce(userId, send = sendMail, siteUrl = process.env.URL) {
  const [row] = await db()`update app_users set welcomed_at = now() where id = ${userId} and welcomed_at is null returning email`;
  if (!row || !(await allowanceOf(userId)).freeVideo) return false;
  try {
    await send({ to: row.email, ...welcome(siteUrl), once: `welcome-${userId}` });
  } catch (cause) {
    console.error('welcome letter:', cause);
  }
  return true;
}

/**
 * Emails the person's invite `link` to a friend's address. Returns {status: 200} or {status, error} with words to show.
 * Someone who already has an account is not emailed, and neither is an address invited in the last month, but the person is told
 * it went either way: the form must not tell who uses mumoo.
 */
export async function inviteByEmail(person, rawEmail, link, send = sendMail) {
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL.test(email)) return { status: 400, error: 'Check the email address and try again.' };
  const sql = db();
  const [own] = await sql`select free_video_key(${email}) = free_video_key(${person.email}) as same`;
  if (own.same) return { status: 400, error: 'That’s your own email. Send it to a friend.' };
  await sql`delete from invite_emails where sent_at < now() - ${SAME_ADDRESS}::interval`;
  const [today] = await sql`select count(*)::int as sent from invite_emails where inviter_id = ${person.id} and sent_at > now() - interval '1 day'`;
  const [skip] = await sql`
    select exists (select 1 from neon_auth."user" where lower(email) = ${email})
        or exists (select 1 from invite_emails where email_key = free_video_key(${email})) as quiet`;
  if (today.sent >= INVITES_A_DAY) return { status: 429, error: `You’ve sent ${INVITES_A_DAY} invites today. Try again tomorrow, or share your link.` };
  if (skip.quiet) return { status: 200 };
  const [sent] = await sql`insert into invite_emails (email_key, inviter_id) values (free_video_key(${email}), ${person.id}) returning id`;
  try {
    await send({ to: email, ...friendInvite(link, REFERRAL_VIDEOS, new URL(link).origin) });
  } catch (cause) {
    console.error('invite letter:', cause);
    await sql`delete from invite_emails where id = ${sent.id}`;
    return { status: 502, error: 'Couldn’t send the invite. Try again in a moment.' };
  }
  return { status: 200 };
}
