import { db } from './person.mjs';

/**
 * Credits: one makes one video. A person has the videos their paid orders bought (`credit_orders`) and were given (`credit_bonuses`: referrals), less the videos they made
 * (`credit_spends`); every email address's first video is free and costs none (`free_videos_used` keeps that past a deleted
 * account). A render takes its credit when it starts, and gives it
 * back if it fails.
 */

/** A reservation the worker never confirmed (the function stopped part way) is given back after this long. */
const STALE = '10 minutes';

/**
 * Remembers that the person's address had its free video (a code of it, never the address), before the account is deleted or
 * moves to another address: signing up again with it does not give another.
 */
export async function rememberFreeVideo(userId) {
  await db()`
    insert into free_videos_used (email_key)
    select free_video_key(email) from app_users
    where id = ${userId} and exists (select 1 from credit_spends where user_id = ${userId} and free
      and (render_id is not null or created_at > now() - ${STALE}::interval))
    on conflict do nothing`;
}

/** What the person can still make: their credits, and whether their free first video is still to come. */
export async function allowanceOf(userId) {
  const [row] = await db()`
    select coalesce((select sum(videos) from credit_orders where user_id = ${userId} and status = 'paid'), 0)
         + coalesce((select sum(videos) from credit_bonuses where user_id = ${userId} and revoked_at is null), 0)
         - coalesce((select sum(videos) from credit_spends where user_id = ${userId} and not free
             and (render_id is not null or created_at > now() - ${STALE}::interval)), 0) as credits,
         not exists (select 1 from credit_spends where user_id = ${userId} and free
             and (render_id is not null or created_at > now() - ${STALE}::interval))
         and not exists (select 1 from free_videos_used where email_key = (select free_video_key(email) from app_users where id = ${userId})) as free_video`;
  return { credits: Math.max(0, Number(row?.credits ?? 0)), freeVideo: Boolean(row?.free_video) };
}

/** Never below zero: a refund after the videos were made would otherwise show a debt. */
export const creditsOf = async userId => (await allowanceOf(userId)).credits;

/**
 * Takes one video's worth for a render about to start: the free first video if it is still to come, else one credit. Null when
 * there is neither. A lock per person keeps two renders started at once from spending the same credit.
 */
export async function reserveVideo(userId) {
  const sql = db();
  const [, , rows] = await sql.transaction([
    sql`select pg_advisory_xact_lock(hashtext(${`credits:${userId}`}))`,
    sql`delete from credit_spends where user_id = ${userId} and render_id is null and created_at < now() - ${STALE}::interval`,
    sql`
      with state as (
        select coalesce((select sum(videos) from credit_orders where user_id = ${userId} and status = 'paid'), 0)
         + coalesce((select sum(videos) from credit_bonuses where user_id = ${userId} and revoked_at is null), 0)
             - coalesce((select sum(videos) from credit_spends where user_id = ${userId} and not free), 0) as credits,
             exists (select 1 from credit_spends where user_id = ${userId} and free)
               or exists (select 1 from free_videos_used where email_key = (select free_video_key(email) from app_users where id = ${userId})) as free_used
      )
      insert into credit_spends (user_id, videos, free)
      select ${userId}, 1, not free_used from state where not free_used or credits >= 1
      returning id, free`,
  ]);
  return rows[0] ? { id: String(rows[0].id), free: rows[0].free } : null;
}

/** The worker accepted the job: the reservation is now that render's. */
export async function confirmVideo(userId, spendId, renderId) {
  await db()`update credit_spends set render_id = ${renderId} where id = ${spendId} and user_id = ${userId}`;
}

/** The render never started: its credit (or the free video) is given back. */
export async function releaseReservation(userId, spendId) {
  await db()`delete from credit_spends where id = ${spendId} and user_id = ${userId} and render_id is null`;
}

/** The render failed: its credit (or the free video) is given back, unless the video was made and kept after all. */
export async function releaseVideo(userId, renderId) {
  await db()`
    delete from credit_spends where render_id = ${renderId} and user_id = ${userId}
      and not exists (select 1 from renders where job_id = ${renderId} and user_id = ${userId})`;
}
