import { randomInt } from 'node:crypto';
import { db } from './person.mjs';

/**
 * Give 10, get 10. Each account has its own link (`/?ref=<code>`). Someone who signs up with it is the inviter's friend: their
 * first paid pack comes with `REFERRAL_VIDEOS` extra videos, and the inviter gets as many once that payment is in, for at most
 * `REFERRAL_CAP` friends a calendar month (the friends always get theirs). A full refund of that order takes both back.
 */
export const REFERRAL_VIDEOS = 10;
export const REFERRAL_CAP = 20;
/** Only an account this new can be someone's friend: an older one did not sign up with the link. */
const NEW_ACCOUNT = '7 days';
/** No 0/o, 1/l/i: the code is read aloud and typed. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE = /^[a-z0-9]{6,16}$/;

const newCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
export const validCode = code => typeof code === 'string' && CODE.test(code);

/** The person's own code, made the first time it is asked for. */
export async function codeFor(userId) {
  const sql = db();
  const [row] = await sql`select referral_code from app_users where id = ${userId}`;
  if (!row) return null;
  if (row.referral_code) return row.referral_code;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [made] = await sql`
        update app_users set referral_code = coalesce(referral_code, ${newCode()}) where id = ${userId} returning referral_code`;
      return made.referral_code;
    } catch (cause) {
      if (cause?.code !== '23505') throw cause;
    }
  }
  throw new Error('could not make a referral code');
}

/**
 * Makes the signed-in person the friend of whoever owns `code`: 'joined', or why not ('unknown' code, 'self', 'not_new' (an older
 * account, or one that has paid already), 'already' someone's friend).
 */
export async function claimReferral(friendId, code) {
  if (!validCode(code)) return 'unknown';
  const sql = db();
  const [row] = await sql`
    with referrer as (select id from app_users where referral_code = ${code}),
    friend as (
      select id, created_at > now() - ${NEW_ACCOUNT}::interval
        and not exists (select 1 from credit_orders where user_id = ${friendId}) as fresh
      from app_users where id = ${friendId}
    ),
    joined as (
      insert into referrals (friend_id, referrer_id)
      select friend.id, referrer.id from friend, referrer where friend.fresh and friend.id <> referrer.id
      on conflict (friend_id) do nothing
      returning referrer_id
    )
    select (select id from referrer) as referrer, (select fresh from friend) as fresh, exists (select 1 from joined) as joined,
      exists (select 1 from referrals where friend_id = ${friendId}) as already`;
  if (row?.joined) return 'joined';
  if (!row?.referrer) return 'unknown';
  if (row.referrer === friendId) return 'self';
  if (row.already) return 'already';
  return 'not_new';
}

/**
 * The friend's first paid order is in: their bonus, and the inviter's if they have room under their cap this month. Safe to repeat
 * (Polar may send the event twice). Returns the inviter to tell, or null when the order earned nothing.
 */
export async function rewardReferral(friendId, orderId) {
  const sql = db();
  const [, rows] = await sql.transaction([
    // Two friends paying at once must not both take the inviter's last place under the cap.
    sql`select pg_advisory_xact_lock(hashtext('referrals:' || referrer_id)) from referrals where friend_id = ${friendId}`,
    sql`
      with target as (
        select r.friend_id, r.referrer_id,
          (select count(*) from referrals x where x.referrer_id = r.referrer_id and x.rewarded_at >= date_trunc('month', now()))
            < coalesce(u.referral_cap, ${REFERRAL_CAP}::int) as room
        from referrals r join app_users u on u.id = r.referrer_id
        where r.friend_id = ${friendId} and r.order_id is null
          and not exists (select 1 from credit_orders o where o.user_id = ${friendId} and o.id <> ${orderId})
      ),
      claimed as (
        update referrals r set order_id = ${orderId}, rewarded_at = case when t.room then now() end
        from target t where r.friend_id = t.friend_id
        returning r.referrer_id, t.room as rewarded
      ),
      given as (
        insert into credit_bonuses (user_id, videos, reason, order_id)
        select ${friendId}::text, ${REFERRAL_VIDEOS}::int, 'referred', ${orderId}::text from claimed
        union all
        select referrer_id, ${REFERRAL_VIDEOS}::int, 'referral', ${orderId}::text from claimed where rewarded
        on conflict do nothing
        returning user_id
      )
      select c.referrer_id, c.rewarded, u.email, (select count(*) from given) as given
      from claimed c join app_users u on u.id = c.referrer_id`,
  ]);
  const row = rows[0];
  return row ? { referrerId: row.referrer_id, email: row.email, rewarded: row.rewarded } : null;
}

/** A fully refunded order: the bonuses it gave are taken back, and the inviter's place under the cap is freed. */
export async function revokeReferral(orderId) {
  const sql = db();
  await sql.transaction([
    sql`update credit_bonuses set revoked_at = now() where order_id = ${orderId} and revoked_at is null`,
    sql`update referrals set rewarded_at = null where order_id = ${orderId}`,
  ]);
}

/** Videos the friend's invite still adds to their first pack: REFERRAL_VIDEOS while they have one and have not paid yet. */
export async function firstPackBonus(userId) {
  const [row] = await db()`
    select exists (select 1 from referrals where friend_id = ${userId} and order_id is null)
      and not exists (select 1 from credit_orders where user_id = ${userId}) as waiting`;
  return row?.waiting ? REFERRAL_VIDEOS : 0;
}

/** What the Invite friends popup shows. */
export async function referralStats(userId) {
  const [row] = await db()`
    select
      (select count(*) from referrals where referrer_id = ${userId}) as joined,
      (select count(*) from referrals where referrer_id = ${userId} and order_id is not null) as bought,
      (select count(*) from referrals where referrer_id = ${userId} and rewarded_at >= date_trunc('month', now())) as this_month,
      (select coalesce(sum(videos), 0) from credit_bonuses where user_id = ${userId} and reason = 'referral' and revoked_at is null) as earned,
      (select coalesce(referral_cap, ${REFERRAL_CAP}) from app_users where id = ${userId}) as cap`;
  return {
    joined: Number(row.joined), bought: Number(row.bought), thisMonth: Number(row.this_month),
    earned: Number(row.earned), cap: Number(row.cap), videos: REFERRAL_VIDEOS,
  };
}
