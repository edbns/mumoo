import { randomUUID } from 'node:crypto';
import { db } from './person.mjs';
import { askPrepare, startPrepare } from './prepare.mjs';
import { deleteObject, getObject, objectSize, signedDownload, signedUpload } from './storage.mjs';

/**
 * The approved library. Files sit in the private bucket under library/, and the admin sees them through short-lived links.
 * Everything the admin types is checked here, not in the page: the brain only understands its own attitude codes,
 * and the tag list is kept small on purpose (a short list lets the brain choose fast).
 */

/** The brain's attitude codes. A test keeps this the same as ATTITUDES in src/lyric-meaning.ts. */
export const ATTITUDES = [
  'joyful', 'playful', 'flirty', 'tender', 'romantic', 'hopeful', 'boastful', 'defiant', 'annoyed', 'angry',
  'menacing', 'bitter', 'heartbroken', 'lonely', 'nostalgic', 'reflective', 'spiritual', 'neutral',
];
export const MAX_ATTITUDES = 4;
export const MAX_TAGS_PER_ITEM = 5;
export const MAX_TAGS_IN_POOL = 40;
export const TAG = /^[a-z0-9][a-z0-9 -]{0,22}[a-z0-9]$|^[a-z0-9]$/;
export const STATUSES = ['pending', 'approved', 'hidden'];

/** A photo is always a JPEG (the admin page makes it one) and small enough for our renderer, which takes 3 MB at most. */
const TYPES = {
  'image/jpeg': ['photo', 3_000_000],
  'image/gif': ['gif', 25_000_000],
  'video/mp4': ['video', 150_000_000],
  'video/quicktime': ['video', 150_000_000],
  'video/webm': ['video', 150_000_000],
};
export const ACCEPTED_TYPES = Object.keys(TYPES);

const keyOf = (id) => `library/${id}`;
const motionKey = (id) => `library/${id}.mp4`;
const posterKey = (id) => `library/${id}.poster.jpg`;
const isJpeg = (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
/** A worker job that started and has not yet written its id down is given this long before another request may start it again. */
const STARTING_MS = 2 * 60 * 1000;
/** A file whose upload never finished is of no use after this long. */
const STALE_MS = 60 * 60 * 1000;

const asItem = async (row) => ({
  id: row.id,
  kind: row.kind,
  contentType: row.content_type,
  bytes: row.bytes,
  status: row.status,
  attitudes: row.attitudes,
  tags: row.tags,
  genre: row.genre,
  subGenre: row.sub_genre,
  note: row.source_note,
  clearedBy: row.cleared_by,
  clearedAt: row.cleared_at,
  createdAt: row.created_at,
  /** Ready: the templates can draw it. A video or GIF is first prepared by our worker; `problem` says why one cannot be used. */
  ready: row.ready,
  problem: row.problem,
  url: await signedDownload(keyOf(row.id), null),
});

/**
 * Gets one arrived item ready for the templates. A photo is checked to be a JPEG. A video or GIF is handed to our
 * worker, which makes a small clip with a poster; this is asked again on each look until it answers.
 * Never throws: a worker that is down only leaves the item not ready yet.
 */
async function prepareItem(row) {
  const sql = db();
  try {
    if (row.kind === 'photo') {
      const bytes = await getObject(keyOf(row.id));
      if (isJpeg(bytes)) await sql`update library_items set ready = true, problem = null where id = ${row.id}`;
      else await sql`update library_items set problem = 'This photo is not a JPEG. Delete it and send it again.' where id = ${row.id}`;
      return;
    }
    if (row.prepare_job && row.prepare_job !== 'starting') {
      const answer = await askPrepare(row.prepare_job);
      if (answer.failed) await sql`update library_items set problem = ${answer.failed}, prepare_job = null where id = ${row.id}`;
      else if (answer.done) {
        const shots = Array.isArray(answer.done.shots) ? JSON.stringify(answer.done.shots) : null;
        await sql`update library_items set ready = true, problem = null, prepare_job = null, shots = ${shots}::jsonb where id = ${row.id}`;
      }
      return;
    }
    const [claimed] = await sql`
      update library_items set prepare_job = 'starting', prepare_at = now()
      where id = ${row.id} and not ready and (prepare_job is null or (prepare_job = 'starting' and prepare_at < now() - ${`${STARTING_MS} milliseconds`}::interval))
      returning id`;
    if (!claimed) return;
    try {
      const job = await startPrepare(await signedDownload(keyOf(row.id), null, 1800), {
        motion: await signedUpload(motionKey(row.id)),
        poster: await signedUpload(posterKey(row.id)),
      });
      await sql`update library_items set prepare_job = ${job} where id = ${row.id}`;
    } catch (cause) {
      await sql`update library_items set prepare_job = null where id = ${row.id}`;
      throw cause;
    }
  } catch (cause) {
    console.error('library prepare:', cause);
  }
}

/** Looks at every arrived item that is not ready and has no stated problem, so the library moves on whenever anyone looks at it. */
async function prepareWaiting() {
  const rows = await db()`select * from library_items where arrived and not ready and problem is null limit 20`;
  await Promise.all(rows.map(prepareItem));
}

/** Every item that has arrived (newest first) and the tag pool with how many items use each tag. */
export async function listLibrary() {
  const sql = db();
  const stale = await sql`delete from library_items where arrived = false and created_at < now() - ${`${STALE_MS} milliseconds`}::interval returning id`;
  await Promise.all(stale.map(row => deleteObject(keyOf(row.id)).catch(() => undefined)));
  await prepareWaiting();
  const rows = await sql`select * from library_items where arrived order by created_at desc limit 500`;
  return { items: await Promise.all(rows.map(asItem)), tags: await listTagPool() };
}

/** The tag list, each with how many items use it. */
export async function listTagPool() {
  const rows = await db()`
    select t.name, (select count(*)::int from library_items i where t.name = any (i.tags)) as items
    from library_tags t order by t.name`;
  return rows.map(row => ({ name: row.name, items: row.items }));
}

/** Makes room for a file: the row and the link to send it to. Refused with a reason in words when it is not allowed. */
export async function reserveItem(admin, { type, bytes, rights, note }) {
  const accepted = TYPES[type];
  if (!accepted) return { refused: 'Use a photo (it is sent as a JPEG), a GIF, or an MP4, MOV or WebM video.' };
  if (!Number.isInteger(bytes) || bytes < 1) return { refused: 'Say how big the file is.' };
  if (bytes > accepted[1]) return { refused: `That file is too large (the limit is ${Math.round(accepted[1] / 1_000_000)} MB).` };
  if (rights !== true) return { refused: 'Confirm that you cleared the rights to this file.' };
  const id = randomUUID();
  await db()`
    insert into library_items (id, kind, content_type, bytes, source_note, cleared_by)
    values (${id}, ${accepted[0]}, ${type}, ${bytes}, ${cleanNote(note)}, ${admin.email})`;
  return { id, putUrl: await signedUpload(keyOf(id)) };
}

/** The file has been sent: check it is really there and as big as promised, and add it to the library. */
export async function itemArrived(id) {
  const [row] = await db()`select bytes from library_items where id = ${id} and arrived = false`;
  if (!row) return null;
  const size = await objectSize(keyOf(id));
  if (size !== row.bytes) return null;
  const [arrived] = await db()`update library_items set arrived = true where id = ${id} returning *`;
  await prepareItem(arrived);
  const [item] = await db()`select * from library_items where id = ${id}`;
  return asItem(item);
}

const cleanNote = (value) => (typeof value === 'string' ? value.trim().slice(0, 500) : '');
const cleanName = (value) => (typeof value === 'string' ? value.trim().slice(0, 80) : '');

/** `tags` as a clean list (lowercase, unique, each checked), or a reason in words. */
function readTags(value) {
  if (!Array.isArray(value)) return { refused: 'Tags must be a list.' };
  const tags = [...new Set(value.map(tag => (typeof tag === 'string' ? tag.trim().toLowerCase().replace(/\s+/g, ' ') : '')))];
  if (tags.some(tag => !TAG.test(tag))) return { refused: 'A tag is one to three short words or a few letters, with no symbols.' };
  if (tags.length > MAX_TAGS_PER_ITEM) return { refused: `At most ${MAX_TAGS_PER_ITEM} tags for one item. Fewer is better.` };
  return { tags };
}

/**
 * Changes an item: any of status, attitudes, tags, genre, subGenre, note. Returns the item, null when it is not
 * there, or { refused } with a reason in words. An item can only be approved once it has an attitude.
 */
export async function changeItem(id, change) {
  const sql = db();
  const [row] = await sql`select * from library_items where id = ${id} and arrived`;
  if (!row) return null;
  const next = { status: row.status, attitudes: row.attitudes, tags: row.tags, genre: row.genre, subGenre: row.sub_genre, note: row.source_note };
  if ('status' in change) {
    if (!STATUSES.includes(change.status) || change.status === 'pending') return { refused: 'Choose approved or hidden.' };
    next.status = change.status;
  }
  if ('attitudes' in change) {
    const list = Array.isArray(change.attitudes) ? [...new Set(change.attitudes)] : null;
    if (!list || list.some(code => !ATTITUDES.includes(code))) return { refused: 'Choose attitudes from the list.' };
    if (list.length > MAX_ATTITUDES) return { refused: `At most ${MAX_ATTITUDES} attitudes for one item. Fewer is better.` };
    next.attitudes = list;
  }
  if ('tags' in change) {
    const read = readTags(change.tags);
    if (read.refused) return read;
    next.tags = read.tags;
  }
  if ('genre' in change || 'subGenre' in change) {
    next.genre = cleanName(change.genre ?? next.genre) || null;
    next.subGenre = next.genre ? (cleanName('subGenre' in change ? change.subGenre : next.subGenre) || null) : null;
  }
  if ('note' in change) next.note = cleanNote(change.note);
  if (next.status === 'approved' && next.attitudes.length === 0) return { refused: 'Give it at least one attitude before approving it.' };

  const [{ pool, known }] = await sql`select count(*)::int as pool, (count(*) filter (where name = any (${next.tags})))::int as known from library_tags`;
  const fresh = next.tags.length - known;
  if (fresh > 0 && pool + fresh > MAX_TAGS_IN_POOL) return { refused: `The tag list is full (${MAX_TAGS_IN_POOL}). Remove a tag you do not use, or reuse one.` };
  for (const tag of next.tags) await sql`insert into library_tags (name) values (${tag}) on conflict do nothing`;
  const [item] = await sql`
    update library_items set status = ${next.status}, attitudes = ${next.attitudes}, tags = ${next.tags},
      genre = ${next.genre}, sub_genre = ${next.subGenre}, source_note = ${next.note}
    where id = ${id} returning *`;
  return asItem(item);
}

export async function removeItem(id) {
  const [row] = await db()`delete from library_items where id = ${id} returning id`;
  if (!row) return false;
  await Promise.all([keyOf(id), motionKey(id), posterKey(id)].map(key => deleteObject(key).catch(() => undefined)));
  return true;
}

/**
 * What the templates may draw, for anyone: only approved items that are ready, with the little the brain needs to choose
 * (never who cleared them or where they came from). A photo comes with its link; a video or GIF with its poster, its clip and its shots.
 * Links work for 15 minutes.
 */
export async function listApproved() {
  await prepareWaiting();
  const rows = await db()`select * from library_items where arrived and ready and status = 'approved' order by created_at desc limit 500`;
  return Promise.all(rows.map(async (row) => ({
    id: row.id,
    kind: row.kind,
    attitudes: row.attitudes,
    tags: row.tags,
    genre: row.genre,
    subGenre: row.sub_genre,
    url: await signedDownload(row.kind === 'photo' ? keyOf(row.id) : posterKey(row.id), null),
    ...(row.kind === 'photo' ? {} : { motionUrl: await signedDownload(motionKey(row.id), null), ...(row.shots ? { shots: row.shots } : {}) }),
  })));
}

/** What a render needs of an approved item, read from storage: `{ photo }` or `{ motion }`. Null when it is not approved and ready. */
export async function libraryMedia(id) {
  const [row] = await db()`select kind from library_items where id = ${id} and arrived and ready and status = 'approved'`;
  if (!row) return null;
  return row.kind === 'photo' ? { photo: await getObject(keyOf(id)) } : { motion: await getObject(motionKey(id)) };
}

/** Removes a tag from the list and from every item that has it. */
export async function removeTag(name) {
  const sql = db();
  await sql`update library_items set tags = array_remove(tags, ${name}) where ${name} = any (tags)`;
  const [row] = await sql`delete from library_tags where name = ${name} returning name`;
  return Boolean(row);
}

/** A new, unused tag on its own (typed in the tag box before it is given to an item). */
export async function addTag(value) {
  const read = readTags([value]);
  if (read.refused) return read;
  const sql = db();
  const [{ count }] = await sql`select count(*)::int as count from library_tags`;
  const [known] = await sql`select 1 as known from library_tags where name = ${read.tags[0]}`;
  if (!known && count >= MAX_TAGS_IN_POOL) return { refused: `The tag list is full (${MAX_TAGS_IN_POOL}). Remove a tag you do not use first.` };
  await sql`insert into library_tags (name) values (${read.tags[0]}) on conflict do nothing`;
  return { tag: read.tags[0] };
}
