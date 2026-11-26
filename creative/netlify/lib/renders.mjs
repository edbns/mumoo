import { hasRoom } from './allowance.mjs';
import { db } from './person.mjs';
import { deleteObject, putObject, signedDownload } from './storage.mjs';

/** Each person's history of finished creatives: the MP4 sits in R2, a row in Postgres says whose it is. */
const keyOf = (userId, id) => `renders/${userId}/${id}.mp4`;

/** Keeps a finished render in the person's history. Returns false when they are over their storage allowance. */
export async function saveRender(userId, jobId, mp4) {
  const sql = db();
  if (!(await hasRoom(userId, mp4.byteLength))) return false;
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

/** How long the links of a person's creatives work: their Media page asks for new ones before then. */
export const RENDER_LINK_SECONDS = 3600;

/** Newest first, each with a link to play it (`url`, shown in place) and one that saves it (`download`). */
export async function listRenders(userId) {
  const rows = await db()`select id, bytes, created_at from renders where user_id = ${userId} order by created_at desc limit 100`;
  return Promise.all(rows.map(async (row) => ({
    id: row.id,
    bytes: row.bytes,
    createdAt: row.created_at,
    url: await signedDownload(keyOf(userId, row.id), null, RENDER_LINK_SECONDS),
    download: await signedDownload(keyOf(userId, row.id), 'mumoo-video.mp4', RENDER_LINK_SECONDS),
  })));
}

export async function removeRender(userId, id) {
  const [row] = await db()`delete from renders where id = ${id} and user_id = ${userId} returning id`;
  if (!row) return false;
  await deleteObject(keyOf(userId, id));
  return true;
}
