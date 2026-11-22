import { randomUUID } from 'node:crypto';
import { releaseReservation, releaseVideo, reserveVideo } from './credits.mjs';
import { db } from './person.mjs';
import { outboundFor } from './render-outbound.mjs';
import { saveRender } from './renders.mjs';
import { deleteObject, getObject, objectSize, putObject, signedDownload } from './storage.mjs';

/**
 * The render queue. Every chosen video is queued with its credit already taken; the queue starts a few of each person's at a time
 * and fewer than the worker can hold, so one person's hundred videos never hold up anyone's single one. It also keeps each finished
 * video in the person's Media and gives back the credit of one that failed, whether or not their page is still open: it is moved
 * on by the page asking how its videos are doing, and once a minute by `render-queue` (scheduled).
 */

/** How many of one person's videos are made at once; the rest wait their turn. */
export const PER_PERSON = 4;
/** How many are made at once in all, kept under the worker's 30 jobs. */
export const RUNNING_MAX = 24;
/** Beyond `RUNNING_MAX`, room kept for people with nothing being made yet, so a single video starts at once. */
export const SPARE = 6;
/** A start that never reached the worker (the function stopped part way) is tried again after this long. */
const STARTING_STALE = '3 minutes';
/** A video the worker has not finished after this long has failed: the worker gives up on a job after 15 minutes. */
const RUNNING_STALE = '20 minutes';
/** One look at a video being made at a time: another look waits this long. */
const LOOK_EVERY = '4 seconds';
/** Starts that the worker did not accept, tried in all, before the video counts as failed. */
const ATTEMPTS = 3;
/** Finished and failed rows are kept this long (so a page that comes back later still learns how they went). */
const KEEP_ROWS = '7 days';
/** A video kept for the browser to fetch (the person's Media was full) is kept this long. */
const KEEP_DOWNLOAD = '1 day';

const MODAL_SUBMIT = 'https://edbns-mumoo-staging--mumoo-creatives-encode-staging-submit.us-east.modal.run';
const MODAL_STATUS = 'https://edbns-mumoo-staging--mumoo-creatives-encode-staging-status.us-east.modal.run';

const audioKey = (userId, orderId) => `render-queue/${userId}/${orderId}.wav`;
const downloadKey = (userId, id) => `render-queue/${userId}/${id}.mp4`;
const ORDER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const QUEUE_ID = /^rq-[0-9a-f-]{36}$/;

/** The cloud render worker on Modal: takes a creative's form, and answers how a job is doing. */
export const modalWorker = {
  async submit(form) {
    const response = await fetch(MODAL_SUBMIT, {
      method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${process.env.MUMOO_MUSIC_BRIDGE_SECRET}` },
    });
    const result = await response.json().catch(() => null);
    if (response.ok && typeof result?.id === 'string') return { id: result.id };
    const detail = result?.detail ?? result?.error;
    // The creative itself was refused: trying again would not help.
    if ([400, 413].includes(response.status)) return { error: typeof detail === 'string' ? detail : 'Cloud render could not start.' };
    return { retry: true, error: 'The cloud render worker could not accept this creative.' };
  },
  async status(callId) {
    const response = await fetch(`${MODAL_STATUS}?id=${encodeURIComponent(callId)}`, {
      redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${process.env.MUMOO_MUSIC_BRIDGE_SECRET}` },
    });
    if (response.status === 202) return { state: 'running' };
    if (response.ok) {
      const mp4 = new Uint8Array(await response.arrayBuffer());
      return mp4.byteLength < 1000 ? { state: 'failed', error: 'Cloud render returned an empty file.' } : { state: 'done', mp4 };
    }
    if (response.status >= 500) return { state: 'unknown' };
    const result = await response.json().catch(() => null);
    const detail = result?.detail ?? result?.error;
    return { state: 'failed', error: typeof detail === 'string' ? detail : 'Cloud render failed. Try again.' };
  },
};

/**
 * Queues videos of `userId` (`metas`, in order), each taking its credit (the free first video, else one bought), until the credits
 * run out: `{ ids, order, free, noCredits }` (`free`: one of them was the free video; `noCredits`: not all were queued), or
 * `{ refused }` when the order is not theirs. The first batch of an order sends the song's audio, kept once for the whole order;
 * later batches name the order.
 */
export async function enqueue(userId, { order, audio, metas }) {
  const sql = db();
  let orderId = order;
  if (orderId === undefined) {
    orderId = randomUUID();
    await putObject(audioKey(userId, orderId), audio, 'audio/wav');
  } else if (!ORDER.test(orderId) || await objectSize(audioKey(userId, orderId)) === null) {
    return { refused: 'That order has ended. Choose the videos again.' };
  }
  const ids = [];
  let free = false;
  for (const meta of metas) {
    const spend = await reserveVideo(userId);
    if (!spend) break;
    const id = `rq-${randomUUID()}`;
    try {
      // The credit is the queued video's from now on, however long it waits.
      await sql.transaction([
        sql`insert into render_queue (id, user_id, order_id, meta) values (${id}, ${userId}, ${orderId}, ${JSON.stringify(meta)}::jsonb)`,
        sql`update credit_spends set render_id = ${id} where id = ${spend.id} and user_id = ${userId}`,
      ]);
    } catch (cause) {
      await releaseReservation(userId, spend.id).catch(() => undefined);
      if (ids.length) break;
      if (order === undefined) await deleteObject(audioKey(userId, orderId)).catch(() => undefined);
      throw cause;
    }
    ids.push(id);
    free ||= spend.free;
  }
  if (!ids.length && order === undefined) await deleteObject(audioKey(userId, orderId)).catch(() => undefined);
  return { ids, order: orderId, free, noCredits: ids.length < metas.length };
}

/**
 * Which waiting videos start now, in turns: everyone's first waiting video before anyone's second, oldest first within a turn, at
 * most `perPerson` of a person's being made, and at most `runningMax` in all, beyond which only a person with nothing being made
 * may start one, up to `spare` more. `waiting` is oldest first; `busy` is how many each person has being made.
 */
export function pickNext(waiting, busy, { perPerson = PER_PERSON, runningMax = RUNNING_MAX, spare = SPARE, limit = Infinity } = {}) {
  let total = [...busy.values()].reduce((sum, count) => sum + count, 0);
  const place = new Map();
  const turns = waiting.map(row => {
    const at = (place.get(row.userId) ?? busy.get(row.userId) ?? 0) + 1;
    place.set(row.userId, at);
    return { id: row.id, at, idle: !busy.get(row.userId) };
  }).filter(turn => turn.at <= perPerson).sort((a, b) => a.at - b.at);
  const picked = [];
  for (const turn of turns) {
    if (picked.length >= limit) break;
    if (total < runningMax || (turn.idle && turn.at === 1 && total < runningMax + spare)) {
      picked.push(turn.id);
      total += 1;
    }
  }
  return picked;
}

/** The order's audio is no longer needed once none of its videos is waiting or being made. */
async function tidyOrder(userId, orderId) {
  const [left] = await db()`select count(*)::int as n from render_queue where order_id = ${orderId} and status in ('queued', 'starting', 'running')`;
  if (!left.n) await deleteObject(audioKey(userId, orderId)).catch(() => undefined);
}

async function fail(row, error) {
  await db()`update render_queue set status = 'failed', error = ${error}, finished_at = now() where id = ${row.id} and status in ('starting', 'running')`;
  await releaseVideo(row.user_id, row.id).catch(cause => console.error('render queue give back:', cause));
  await tidyOrder(row.user_id, row.order_id);
}

async function start(row, worker) {
  const sql = db();
  try {
    const audio = await getObject(audioKey(row.user_id, row.order_id));
    const built = await outboundFor(row.user_id, row.meta, new Blob([audio], { type: 'audio/wav' }));
    if (built.error) return await fail(row, built.error);
    const sent = await worker.submit(built.form);
    if (sent.id) {
      await sql`update render_queue set status = 'running', call_id = ${sent.id}, checked_at = now() where id = ${row.id}`;
      return;
    }
    if (!sent.retry) return await fail(row, sent.error);
  } catch (cause) {
    console.error('render queue start:', cause);
  }
  if (row.attempts + 1 >= ATTEMPTS) return fail(row, 'The cloud render worker could not accept this creative.');
  await sql`update render_queue set status = 'queued', started_at = null, attempts = attempts + 1 where id = ${row.id} and status = 'starting'`;
}

/** Starts the videos whose turn it is (at most `limit` now). `users` keeps a test to its own people. */
export async function startWaiting({ worker = modalWorker, limit = 4, users = null } = {}) {
  const sql = db();
  await sql`update render_queue set status = 'queued', started_at = null
    where status = 'starting' and call_id is null and started_at < now() - ${STARTING_STALE}::interval
      and (${users}::text[] is null or user_id = any(${users}))`;
  // Only each person's next few can start, so however many one person has waiting, everyone's next ones are looked at.
  const waiting = await sql`select id, user_id from (
      select id, user_id, created_at, row_number() over (partition by user_id order by created_at) as place
      from render_queue where status = 'queued' and (${users}::text[] is null or user_id = any(${users}))) next
    where place <= ${PER_PERSON} order by created_at`;
  if (!waiting.length) return 0;
  const counts = await sql`select user_id, count(*)::int as n from render_queue where status in ('starting', 'running')
      and (${users}::text[] is null or user_id = any(${users})) group by user_id`;
  const ids = pickNext(waiting.map(row => ({ id: row.id, userId: row.user_id })), new Map(counts.map(row => [row.user_id, row.n])), { limit });
  if (!ids.length) return 0;
  const claimed = await sql`update render_queue set status = 'starting', started_at = now()
    where id = any(${ids}) and status = 'queued' returning id, user_id, order_id, meta, attempts`;
  await Promise.all(claimed.map(row => start(row, worker)));
  return claimed.length;
}

/** Looks at the videos being made (at most `limit` now): a finished one is kept in the person's Media, a failed one gives its credit back. */
export async function settleRunning({ worker = modalWorker, keep = saveRender, limit = 6, users = null } = {}) {
  const sql = db();
  const rows = await sql`update render_queue set checked_at = now() where id in (
      select id from render_queue where status = 'running' and (checked_at is null or checked_at < now() - ${LOOK_EVERY}::interval)
        and (${users}::text[] is null or user_id = any(${users}))
      order by checked_at nulls first limit ${limit} for update skip locked)
    returning id, user_id, order_id, call_id, started_at < now() - ${RUNNING_STALE}::interval as stale`;
  await Promise.all(rows.map(async row => {
    const answer = await worker.status(row.call_id).catch(() => ({ state: 'unknown' }));
    if (answer.state === 'done') {
      let download = null;
      if (!await keep(row.user_id, row.id, answer.mp4)) {
        download = downloadKey(row.user_id, row.id);
        await putObject(download, answer.mp4, 'video/mp4');
      }
      await sql`update render_queue set status = 'done', download = ${download}, finished_at = now() where id = ${row.id}`;
      await tidyOrder(row.user_id, row.order_id);
    } else if (answer.state === 'failed') await fail(row, answer.error);
    else if (row.stale) await fail(row, 'Your creative took too long. Try again in a bit.');
  }).map(work => work.catch(cause => console.error('render queue look:', cause))));
  return rows.length;
}

/** One turn of the queue: what finished is kept, then what may start starts. */
export async function pump(options = {}) {
  const [looked, started] = await Promise.all([settleRunning(options), startWaiting(options)]);
  return looked + started;
}

/**
 * How `userId`'s videos `ids` are doing: for each, 'queued', 'running', 'done' (with a link to fetch it when it could not be kept in
 * their Media) or 'failed' (with why). An id that is not theirs is 'missing'.
 */
export async function statesOf(userId, ids) {
  const rows = await db()`select id, status, error, download from render_queue where user_id = ${userId} and id = any(${ids})`;
  const found = new Map(rows.map(row => [row.id, row]));
  return Object.fromEntries(await Promise.all(ids.map(async id => {
    const row = found.get(id);
    if (!row) return [id, { status: 'missing' }];
    if (row.status === 'failed') return [id, { status: 'failed', error: row.error }];
    if (row.status === 'done') return [id, row.download ? { status: 'done', download: await signedDownload(row.download, 'mumoo-creative.mp4') } : { status: 'done' }];
    return [id, { status: row.status === 'queued' ? 'queued' : 'running' }];
  })));
}

/** Clears what is no longer needed: old finished rows, and videos kept for a browser that had a day to fetch them. */
export async function sweep() {
  const sql = db();
  const old = await sql`with old as (
      select id, download from render_queue where download is not null and finished_at < now() - ${KEEP_DOWNLOAD}::interval for update)
    update render_queue q set download = null from old where q.id = old.id returning old.download as key`;
  await Promise.all(old.map(row => deleteObject(row.key).catch(() => undefined)));
  await sql`delete from render_queue where status in ('done', 'failed') and finished_at < now() - ${KEEP_ROWS}::interval`;
}
