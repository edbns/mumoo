import { hasRoom } from './allowance.mjs';
import { db } from './person.mjs';
import { deleteObject, getObject, objectSize, putObject, signedDownload, signedUpload } from './storage.mjs';

/**
 * A person's own pictures, kept privately in R2: up to `MAX_SHELF_PICTURES` for the whole shelf (`use` = 'any'). A photo (the
 * browser shrinks it to a JPEG) has a cut-out mask of its subject made once, whichever templates use it; a video or GIF is
 * prepared once into a small clip with a poster. Every template that can draw a picture does; the rest are left off the shelf.
 * Uploading is the person's confirmation that they own the rights, so `rights_confirmed_at` is stamped when the picture arrives.
 *
 * Preparing happens on our own worker (see audio-intelligence/modal_prepare_media_staging.py). A picture is
 * `preparing` until the worker has written its files, then `ready`. One the worker could not prepare is removed
 * at once and reported (with the reason in words) in the answer to the request that found out.
 */
export const MAX_PHOTO_BYTES = 3_000_000;
export const MAX_GIF_BYTES = 25_000_000;
export const MAX_VIDEO_BYTES = 150_000_000;
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

/** The shelf keeps up to this many of the person's own pictures; the creatives deal from all of them. */
export const MAX_SHELF_PICTURES = 10;

/** Why a picture was turned away: 'size', 'many' (the shelf has its ten) or 'full'. Null when there is room and it is fine. */
async function refusal(userId, bytes, limit) {
  if (bytes > limit) return 'size';
  const [{ count }] = await db()`select count(*)::int as count from uploads where user_id = ${userId} and status <> 'failed'`;
  if (count >= MAX_SHELF_PICTURES) return 'many';
  return (await hasRoom(userId, bytes)) ? null : 'full';
}

/**
 * Makes way for a new picture: a failure is of no use any more. Several pictures are added in a row, so a video still on its way
 * is only given up after an hour.
 */
async function clearStale(userId) {
  const stale = await db()`select id from uploads where user_id = ${userId} and (status = 'failed' or (status = 'preparing' and job_id is null and created_at < now() - interval '1 hour'))`;
  await Promise.all(stale.map(row => removeUpload(userId, row.id)));
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

/** Stores one photo; its subject is then cut out on the worker. Returns `{ id }` or `{ refused }`. */
export async function saveUpload(userId, bytes) {
  if (!isJpeg(bytes)) return { refused: 'format' };
  const refused = await refusal(userId, bytes.length, MAX_PHOTO_BYTES);
  if (refused) return { refused };
  await clearStale(userId);
  const id = crypto.randomUUID();
  await db()`insert into uploads (id, user_id, bytes, rights_confirmed_at, kind, use, status) values (${id}, ${userId}, ${bytes.length}, now(), 'photo', 'any', 'preparing')`;
  try {
    await putObject(KEYS.still(userId, id), bytes, 'image/jpeg');
    await startPreparing(userId, id, 'photo');
  } catch (cause) {
    await removeUpload(userId, id);
    throw cause;
  }
  return { id };
}

/** Reserves room for a video or GIF and returns a link to send it to straight from the browser. */
export async function reserveMotion(userId, type, bytes) {
  if (!MOTION_TYPES.includes(type)) return { refused: 'format' };
  const refused = await refusal(userId, bytes, type === 'image/gif' ? MAX_GIF_BYTES : MAX_VIDEO_BYTES);
  if (refused) return { refused };
  await clearStale(userId);
  const id = crypto.randomUUID();
  await db()`insert into uploads (id, user_id, bytes, rights_confirmed_at, kind, use, status) values (${id}, ${userId}, ${bytes}, now(), 'motion', 'any', 'preparing')`;
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

/**
 * Asks the worker how a preparing picture is getting on. Not preparable: it is
 * removed, and the entry that says why is returned (once: the person is told with this answer).
 */
async function settle(userId, row) {
  const sql = db();
  const failed = async (error) => {
    await removeUpload(userId, row.id);
    return { id: row.id, kind: row.kind, status: 'failed', error, bytes: 0, createdAt: row.created_at };
  };
  const response = await fetch(`${PREPARE}-status.us-east.modal.run?id=${encodeURIComponent(row.job_id)}`, {
    headers: bridge(),
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response || response.status === 202 || (response.status >= 500 && response.status !== 502)) return null;
  const result = response.ok ? await response.json().catch(() => null) : null;
  if (!result) return failed(response.status === 410 ? 'That took too long to prepare. Try again.' : 'We could not prepare that file. Try another.');
  if (!result.ok) return failed(result.error);
  // A photo keeps its JPEG next to the new mask; a video or GIF keeps only the prepared clip and poster.
  const total = Object.values(result.bytes).reduce((sum, size) => sum + size, row.kind === 'photo' ? row.bytes : 0);
  await sql`update uploads set status = 'ready', bytes = ${total}, shots = ${row.kind === 'motion' ? JSON.stringify(result.shots) : null}::jsonb, error = null where id = ${row.id}`;
  if (row.kind === 'motion') await deleteObject(KEYS.source(userId, row.id));
  return null;
}

/** Newest first. Each ready picture comes with links that work for 15 minutes. */
export async function entries(userId) {
  const rows = await db()`select id, kind, status, bytes, shots, created_at from uploads where user_id = ${userId} and status <> 'failed' order by created_at desc`;
  return Promise.all(rows.map(async (row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    bytes: row.bytes,
    createdAt: row.created_at,
    ...(row.status === 'ready' ? {
      url: await signedDownload(KEYS.still(userId, row.id)),
      ...(row.kind === 'photo' ? { cutoutUrl: await signedDownload(KEYS.cutout(userId, row.id)) } : {}),
      ...(row.kind === 'motion' ? { motionUrl: await signedDownload(KEYS.motion(userId, row.id)), shots: row.shots } : {}),
    } : {}),
  })));
}

/** `entries`, once every picture still being prepared has been asked about. */
export async function listUploads(userId) {
  const sql = db();
  // A video or GIF that never arrived (the page was closed) gives its room back after an hour.
  const abandoned = await sql`select id from uploads where user_id = ${userId} and kind = 'motion' and status = 'preparing' and job_id is null and created_at < now() - interval '1 hour'`;
  await Promise.all(abandoned.map(row => removeUpload(userId, row.id)));
  const rows = await sql`select id, kind, bytes, job_id, created_at from uploads where user_id = ${userId} and status = 'preparing' and job_id is not null`;
  const failures = (await Promise.all(rows.map(row => settle(userId, row)))).filter(Boolean);
  return [...failures, ...(await entries(userId))];
}

/** A ready picture's files: a photo with its cut-out, or a clip (`render-media.mjs` sends a card what it needs). Null when it is not ready or not theirs. */
export async function uploadMedia(userId, id) {
  const [row] = await db()`select kind from uploads where id = ${id} and user_id = ${userId} and status = 'ready'`;
  if (!row) return null;
  if (row.kind === 'motion') return { motion: await getObject(KEYS.motion(userId, id)) };
  const [photo, cutout] = await Promise.all([getObject(KEYS.still(userId, id)), getObject(KEYS.cutout(userId, id))]);
  return { photo, cutout };
}

/**
 * A reel of the person's own shelf pictures, in the shape `libraryReel` gives: links the worker fetches itself for half an hour.
 * Null in place of a picture that is not theirs or not ready.
 */
export async function uploadReel(userId, ids) {
  const rows = await db()`select id, kind, shots from uploads where user_id = ${userId} and id = any(${ids}::uuid[]) and status = 'ready'`;
  const found = new Map(rows.map((row) => [row.id, row]));
  return Promise.all(ids.map(async (id) => {
    const row = found.get(id);
    if (!row) return null;
    if (row.kind === 'photo') return { kind: 'photo', url: await signedDownload(KEYS.still(userId, id), null, 1800) };
    return { kind: 'clip', url: await signedDownload(KEYS.motion(userId, id), null, 1800), ...(row.shots ? { shots: row.shots } : {}) };
  }));
}

/** Removes all of a person's pictures except those in `keep` (the ones their cart still draws from), and every file made from them. Returns how many went. */
export async function removeAllExcept(userId, keep) {
  const rows = await db()`select id from uploads where user_id = ${userId} and id::text <> all (${keep})`;
  const gone = await Promise.all(rows.map(row => removeUpload(userId, row.id)));
  return gone.filter(Boolean).length;
}

/** Removes the picture and every file made from it. */
export async function removeUpload(userId, id) {
  const [row] = await db()`delete from uploads where id = ${id} and user_id = ${userId} returning id`;
  if (!row) return false;
  await Promise.all(Object.values(KEYS).map(key => deleteObject(key(userId, id))));
  return true;
}
