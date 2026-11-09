import { hasRoom } from './allowance.mjs';
import { db } from './person.mjs';
import { deleteObject, getObject, objectSize, putObject, signedDownload, signedUpload } from './storage.mjs';

/**
 * A person's own pictures, kept privately in R2. Each is kept for one row of the shelf (its `use`):
 *
 *   dust    one photo (the browser shrinks it to a JPEG) and a cut-out mask of its subject
 *   filter  up to `FILTER_LIMIT` pictures: a photo as it is, or a video or GIF prepared into a small clip with a poster
 *
 * Preparing happens on our own worker (see audio-intelligence/modal_prepare_media_staging.py). A picture is
 * `preparing` until the worker has written its files, then `ready`, or `failed` with the reason in words.
 */
export const MAX_PHOTO_BYTES = 3_000_000;
export const MAX_GIF_BYTES = 25_000_000;
export const MAX_VIDEO_BYTES = 150_000_000;
export const USES = ['dust', 'filter'];
/** How many pictures each row may keep. */
export const LIMITS = { dust: 1, filter: 6 };
export const MOTION_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'image/gif'];

const PREPARE = 'https://edbns-mumoo-staging--mumoo-prepare-media-staging';
const KEYS = {
  still: (userId, id) => `uploads/${userId}/${id}.jpg`,
  cutout: (userId, id) => `uploads/${userId}/${id}.cut.png`,
  motion: (userId, id) => `uploads/${userId}/${id}.mp4`,
  source: (userId, id) => `uploads/${userId}/${id}.src`,
};
const isJpeg = (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
const bridge = () => ({ Authorization: `Bearer ${process.env.MUMOO_MUSIC_BRIDGE_SECRET}` });

/** Why a picture was turned away: 'size', 'count' or 'full'. Null when there is room and it is fine. */
async function refusal(userId, use, bytes, limit) {
  if (bytes > limit) return 'size';
  const [{ n }] = await db()`select count(*)::int as n from uploads where user_id = ${userId} and use = ${use}`;
  if (n >= LIMITS[use]) return 'count';
  return (await hasRoom(userId, bytes)) ? null : 'full';
}

async function startPreparing(userId, id, kind) {
  const outputs = kind === 'photo' ? { cutout: KEYS.cutout } : { motion: KEYS.motion, poster: KEYS.still };
  const puts = Object.fromEntries(await Promise.all(Object.entries(outputs).map(async ([name, key]) => [name, await signedUpload(key(userId, id))])));
  const source = kind === 'photo' ? KEYS.still(userId, id) : KEYS.source(userId, id);
  const response = await fetch(`${PREPARE}-submit.us-east.modal.run`, {
    method: 'POST',
    headers: { ...bridge(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, source: await signedDownload(source, null, 1800), puts }),
    redirect: 'error',
    signal: AbortSignal.timeout(25_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.id !== 'string') throw new Error('Preparing could not start.');
  await db()`update uploads set job_id = ${result.id} where id = ${id}`;
}

/** Stores one photo. For Dust its subject is then cut out; for Filters it is ready at once. Returns `{ id }` or `{ refused }`. */
export async function saveUpload(userId, use, bytes) {
  if (!USES.includes(use) || !isJpeg(bytes)) return { refused: 'format' };
  const refused = await refusal(userId, use, bytes.length, MAX_PHOTO_BYTES);
  if (refused) return { refused };
  const id = crypto.randomUUID();
  const sql = db();
  const status = use === 'dust' ? 'preparing' : 'ready';
  await sql`insert into uploads (id, user_id, bytes, rights_confirmed_at, kind, use, status) values (${id}, ${userId}, ${bytes.length}, now(), 'photo', ${use}, ${status})`;
  try {
    await putObject(KEYS.still(userId, id), bytes, 'image/jpeg');
    if (use === 'dust') await startPreparing(userId, id, 'photo');
  } catch (cause) {
    await removeUpload(userId, id);
    throw cause;
  }
  return { id };
}

/** Reserves room for a video or GIF (Filters only) and returns a link to send it to straight from the browser. */
export async function reserveMotion(userId, type, bytes) {
  if (!MOTION_TYPES.includes(type)) return { refused: 'format' };
  const refused = await refusal(userId, 'filter', bytes, type === 'image/gif' ? MAX_GIF_BYTES : MAX_VIDEO_BYTES);
  if (refused) return { refused };
  const id = crypto.randomUUID();
  await db()`insert into uploads (id, user_id, bytes, rights_confirmed_at, kind, use, status) values (${id}, ${userId}, ${bytes}, now(), 'motion', 'filter', 'preparing')`;
  return { id, putUrl: await signedUpload(KEYS.source(userId, id)) };
}

/** The browser says the video or GIF has arrived: check it did, then start preparing. False when it has not. */
export async function motionArrived(userId, id) {
  const [row] = await db()`select bytes from uploads where id = ${id} and user_id = ${userId} and kind = 'motion' and status = 'preparing' and job_id is null`;
  if (!row) return false;
  const size = await objectSize(KEYS.source(userId, id));
  if (size === null) return false;
  if (size > MAX_VIDEO_BYTES) {
    await removeUpload(userId, id);
    return false;
  }
  await db()`update uploads set bytes = ${size} where id = ${id}`;
  await startPreparing(userId, id, 'motion');
  return true;
}

/** Asks the worker how a preparing picture is getting on, and records the answer. */
async function settle(userId, row) {
  const sql = db();
  const fail = (error) => sql`update uploads set status = 'failed', error = ${error} where id = ${row.id}`;
  const response = await fetch(`${PREPARE}-status.us-east.modal.run?id=${encodeURIComponent(row.job_id)}`, {
    headers: bridge(),
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response || response.status === 202 || (response.status >= 500 && response.status !== 502)) return;
  const result = response.ok ? await response.json().catch(() => null) : null;
  if (!result) return fail(response.status === 410 ? 'That took too long to prepare. Remove it and try again.' : 'We could not prepare that file. Try another.');
  if (!result.ok) return fail(result.error);
  // A photo keeps its JPEG next to the new mask; a video or GIF keeps only the prepared clip and poster.
  const total = Object.values(result.bytes).reduce((sum, size) => sum + size, row.kind === 'photo' ? row.bytes : 0);
  await sql`update uploads set status = 'ready', bytes = ${total}, shots = ${row.kind === 'motion' ? JSON.stringify(result.shots) : null}::jsonb, error = null where id = ${row.id}`;
  if (row.kind === 'motion') await deleteObject(KEYS.source(userId, row.id));
}

/** Newest first. Each ready picture comes with links that work for 15 minutes. */
export async function listUploads(userId) {
  const sql = db();
  // A video or GIF that never arrived (the page was closed) gives its room back after an hour.
  const abandoned = await sql`select id from uploads where user_id = ${userId} and kind = 'motion' and status = 'preparing' and job_id is null and created_at < now() - interval '1 hour'`;
  await Promise.all(abandoned.map(row => removeUpload(userId, row.id)));
  const rows = await sql`select id, kind, status, job_id, error, bytes, created_at from uploads where user_id = ${userId} and status = 'preparing' and job_id is not null`;
  await Promise.all(rows.map(row => settle(userId, row)));
  const fresh = await sql`select id, kind, use, status, error, bytes, shots, created_at from uploads where user_id = ${userId} order by created_at desc`;
  return Promise.all(fresh.map(async (row) => ({
    id: row.id,
    kind: row.kind,
    use: row.use,
    status: row.status,
    ...(row.error ? { error: row.error } : {}),
    bytes: row.bytes,
    createdAt: row.created_at,
    ...(row.status === 'ready' ? {
      url: await signedDownload(KEYS.still(userId, row.id)),
      ...(row.use === 'dust' ? { cutoutUrl: await signedDownload(KEYS.cutout(userId, row.id)) } : {}),
      ...(row.kind === 'motion' ? { motionUrl: await signedDownload(KEYS.motion(userId, row.id)), shots: row.shots } : {}),
    } : {}),
  })));
}

/**
 * What a render needs of a ready picture, with the row it is kept for: Dust takes the photo and its cut-out,
 * a Filter takes the photo or the clip. Null when it is not ready or not theirs.
 */
export async function uploadMedia(userId, id) {
  const [row] = await db()`select kind, use from uploads where id = ${id} and user_id = ${userId} and status = 'ready'`;
  if (!row) return null;
  if (row.kind === 'motion') return { use: row.use, motion: await getObject(KEYS.motion(userId, id)) };
  if (row.use === 'dust') {
    const [photo, cutout] = await Promise.all([getObject(KEYS.still(userId, id)), getObject(KEYS.cutout(userId, id))]);
    return { use: row.use, photo, cutout };
  }
  return { use: row.use, photo: await getObject(KEYS.still(userId, id)) };
}

/** Removes the picture and every file made from it. */
export async function removeUpload(userId, id) {
  const [row] = await db()`delete from uploads where id = ${id} and user_id = ${userId} returning id`;
  if (!row) return false;
  await Promise.all(Object.values(KEYS).map(key => deleteObject(key(userId, id))));
  return true;
}
