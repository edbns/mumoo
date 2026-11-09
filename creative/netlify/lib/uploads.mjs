import { hasRoom } from './allowance.mjs';
import { db } from './person.mjs';
import { deleteObject, getObject, putObject, signedDownload } from './storage.mjs';

/** A person's own photos, kept privately in R2. The browser shrinks each one to a JPEG first, so these stay small. */
export const MAX_UPLOAD_BYTES = 3_000_000;
export const MAX_UPLOADS = 100;
const keyOf = (userId, id) => `uploads/${userId}/${id}.jpg`;
const isJpeg = (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

/** Stores one photo. Returns `{ id }`, or `{ refused }` with why: 'format', 'size', 'count' or 'full'. */
export async function saveUpload(userId, bytes) {
  if (!isJpeg(bytes)) return { refused: 'format' };
  if (bytes.length > MAX_UPLOAD_BYTES) return { refused: 'size' };
  const sql = db();
  const [{ n }] = await sql`select count(*)::int as n from uploads where user_id = ${userId}`;
  if (n >= MAX_UPLOADS) return { refused: 'count' };
  if (!(await hasRoom(userId, bytes.length))) return { refused: 'full' };
  const id = crypto.randomUUID();
  await sql`insert into uploads (id, user_id, bytes, rights_confirmed_at) values (${id}, ${userId}, ${bytes.length}, now())`;
  try {
    await putObject(keyOf(userId, id), bytes, 'image/jpeg');
  } catch (cause) {
    await sql`delete from uploads where id = ${id}`;
    throw cause;
  }
  return { id };
}

/** Newest first, each with a link that shows the photo for 15 minutes. */
export async function listUploads(userId) {
  const rows = await db()`select id, bytes, created_at from uploads where user_id = ${userId} order by created_at desc limit ${MAX_UPLOADS}`;
  return Promise.all(rows.map(async (row) => ({
    id: row.id,
    bytes: row.bytes,
    createdAt: row.created_at,
    url: await signedDownload(keyOf(userId, row.id)),
  })));
}

/** The stored JPEG, or null when this person has no such photo. */
export async function uploadBytes(userId, id) {
  const [row] = await db()`select id from uploads where id = ${id} and user_id = ${userId}`;
  return row ? getObject(keyOf(userId, id)) : null;
}

export async function removeUpload(userId, id) {
  const [row] = await db()`delete from uploads where id = ${id} and user_id = ${userId} returning id`;
  if (!row) return false;
  await deleteObject(keyOf(userId, id));
  return true;
}
