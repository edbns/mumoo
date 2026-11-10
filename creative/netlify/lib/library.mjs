import { randomUUID } from 'node:crypto';
import { db } from './person.mjs';
import { deleteObject, objectSize, signedDownload, signedUpload } from './storage.mjs';

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

const TYPES = {
  'image/jpeg': ['photo', 15_000_000],
  'image/png': ['photo', 15_000_000],
  'image/webp': ['photo', 15_000_000],
  'image/gif': ['gif', 25_000_000],
  'video/mp4': ['video', 150_000_000],
  'video/quicktime': ['video', 150_000_000],
  'video/webm': ['video', 150_000_000],
};
export const ACCEPTED_TYPES = Object.keys(TYPES);

const keyOf = (id) => `library/${id}`;
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
  url: await signedDownload(keyOf(row.id), null),
});

/** Every item that has arrived (newest first) and the tag pool with how many items use each tag. */
export async function listLibrary() {
  const sql = db();
  const stale = await sql`delete from library_items where arrived = false and created_at < now() - ${`${STALE_MS} milliseconds`}::interval returning id`;
  await Promise.all(stale.map(row => deleteObject(keyOf(row.id)).catch(() => undefined)));
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
  if (!accepted) return { refused: 'Use a JPEG, PNG or WebP photo, a GIF, or an MP4, MOV or WebM video.' };
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
  const [item] = await db()`update library_items set arrived = true where id = ${id} returning *`;
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
  await deleteObject(keyOf(id)).catch(() => undefined);
  return true;
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
