import { db } from './person.mjs';
import { deleteObject, putObject, signedDownload } from './storage.mjs';

/** Each person's history of finished creatives: the MP4 sits in R2, a row in Postgres says whose it is. */
export const QUOTA_BYTES = 1_000_000_000;
const keyOf = (userId, id) => `renders/${userId}/${id}.mp4`;

/** Keeps a finished render in the person's history. Returns false when they are over their storage allowance. */
export async function saveRender(userId, jobId, mp4) {
  const sql = db();
  const [{ used }] = await sql`select coalesce(sum(bytes), 0)::float8 as used from renders where user_id = ${userId}`;
  if (used + mp4.byteLength > QUOTA_BYTES) return false;
  const id = crypto.randomUUID();
  const [added] = await sql`
    insert into renders (id, user_id, job_id, bytes) values (${id}, ${userId}, ${jobId}, ${mp4.byteLength})
    on conflict (user_id, job_id) do nothing returning id`;
  if (!added) return true; // this job is already in their history
  try {
    await putObject(keyOf(userId, id), mp4, 'video/mp4');
  } catch (cause) {
    await sql`delete from renders where id = ${id}`;
    throw cause;
  }
  return true;
}

/** Newest first, each with a download link that expires in 15 minutes. */
export async function listRenders(userId) {
  const rows = await db()`select id, bytes, created_at from renders where user_id = ${userId} order by created_at desc limit 100`;
  return Promise.all(rows.map(async (row) => ({
    id: row.id,
    bytes: row.bytes,
    createdAt: row.created_at,
    url: await signedDownload(keyOf(userId, row.id), 'mumoo-creative.mp4'),
  })));
}

export async function removeRender(userId, id) {
  const [row] = await db()`delete from renders where id = ${id} and user_id = ${userId} returning id`;
  if (!row) return false;
  await deleteObject(keyOf(userId, id));
  return true;
}
