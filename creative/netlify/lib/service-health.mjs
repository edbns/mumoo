import { db } from './person.mjs';

/**
 * How the parts of mumoo are doing, for the public status page (`functions/status.mjs`, watched by UptimeFlare). The workers on
 * Modal are judged by how the real calls to them went, never by calling them: a call to check one would wake a paid machine.
 */
export const SERVICES = ['analysis', 'genre', 'lyrics', 'meaning', 'checkout', 'payments'];
/** The calls a part is judged on, over the last hour. */
export const WINDOW_MINUTES = 60;
/** With this many calls or more in the hour, half of them failing is an outage; with fewer, only the last ones count. */
export const ENOUGH_CALLS = 4;
/** This many failures in a row, with nothing working since, is an outage however few calls there were. */
export const FAILS_IN_ROW = 3;
/** A video waiting or being made longer than this, with no video finished meanwhile, means the renderer is stuck. */
export const STUCK_MINUTES = 30;

/** Keeps how one call went. It never fails the call it describes: a status row is not worth a person's request. */
export async function noteService(service, ok, startedAt) {
  try {
    const ms = Math.max(0, Math.round(Date.now() - startedAt));
    await db()`insert into service_events (service, ok, ms) values (${service}, ${ok}, ${ms})`;
    if (Math.random() < 0.02) await db()`delete from service_events where at < now() - interval '7 days'`;
  } catch (cause) {
    console.error('service event:', cause.message);
  }
}

/** Keeps it after the reply when the platform allows it, so the person never waits on the note. */
export function note(context, service, ok, startedAt) {
  const noted = noteService(service, ok, startedAt);
  if (typeof context?.waitUntil === 'function') context.waitUntil(noted);
  else return noted;
}

/**
 * Up or down from the part's calls in the hour, newest first (`{ ok }` each). No calls is up: a quiet hour is not an outage.
 */
export function judgeCalls(calls) {
  const failed = calls.filter(call => !call.ok).length;
  if (calls.length >= ENOUGH_CALLS && failed * 2 >= calls.length) {
    return { up: false, note: `${failed} of the last ${calls.length} requests failed.` };
  }
  const run = calls.findIndex(call => call.ok);
  const inRow = run === -1 ? calls.length : run;
  if (inRow >= FAILS_IN_ROW) return { up: false, note: `The last ${inRow} requests failed.` };
  return { up: true, note: calls.length ? `${calls.length - failed} of ${calls.length} requests worked in the last hour.` : 'No requests in the last hour.' };
}

/** Up or down from the render queue: `stuck` videos waiting too long, and the videos finished in the hour. */
export function judgeRenders({ stuck, done, failed, doneLately }) {
  if (stuck > 0 && doneLately === 0) return { up: false, note: `${stuck} video${stuck === 1 ? '' : 's'} waiting over ${STUCK_MINUTES} minutes.` };
  const finished = done + failed;
  if (finished >= ENOUGH_CALLS && failed * 2 >= finished) return { up: false, note: `${failed} of the last ${finished} videos failed.` };
  return { up: true, note: finished ? `${done} of ${finished} videos made in the last hour.` : 'No videos in the last hour.' };
}

export async function recentCalls(services) {
  return db()`
    select ok from service_events
    where service = any(${services}) and at > now() - make_interval(mins => ${WINDOW_MINUTES})
    order by at desc limit 200`;
}

export async function renderCounts() {
  const [row] = await db()`
    select
      count(*) filter (where status in ('queued', 'starting', 'running')
        and coalesce(started_at, created_at) < now() - make_interval(mins => ${STUCK_MINUTES}))::int as stuck,
      count(*) filter (where status = 'done' and finished_at > now() - make_interval(mins => ${WINDOW_MINUTES}))::int as done,
      count(*) filter (where status = 'failed' and finished_at > now() - make_interval(mins => ${WINDOW_MINUTES}))::int as failed,
      count(*) filter (where status = 'done' and finished_at > now() - make_interval(mins => ${STUCK_MINUTES}))::int as "doneLately"
    from render_queue
    where created_at > now() - interval '1 day'`;
  return row;
}
