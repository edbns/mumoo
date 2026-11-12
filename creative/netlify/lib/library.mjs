import { randomUUID } from 'node:crypto';
import { db } from './person.mjs';
import { askPrepare, startPrepare } from './prepare.mjs';
import { deleteObject, getObject, objectSize, signedDownload, signedUpload } from './storage.mjs';

/**
 * The approved library. Files sit in the private bucket under library/, and the admin sees them through short-lived links.
 * Everything the admin types is checked here, not in the page. An item's tags say what is in it (car, girls, club); the
 * mood belongs to the song, so an item needs none (older items may still carry `attitudes`; the brain does not read them).
 */

/** The brain's attitude codes. A test keeps this the same as ATTITUDES in src/lyric-meaning.ts. */
export const ATTITUDES = [
  'happy', 'fun', 'flirty', 'love', 'confident', 'angry', 'sad', 'thoughtful', 'spiritual', 'neutral',
];
export const MAX_ATTITUDES = 4;
export const MAX_TAGS_PER_ITEM = 15;
export const MAX_TAGS_IN_POOL = 200;
/** The size of the tag list. A test can lower it for its own process (`MUMOO_MAX_TAGS_IN_POOL`) to meet the limit without filling the real list. */
const tagLimit = () => Number(process.env.MUMOO_MAX_TAGS_IN_POOL) || MAX_TAGS_IN_POOL;
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
const cutoutKey = (id) => `library/${id}.cut.png`;
/** The creatives are this size; a picture smaller than it is enlarged, and looks soft. */
export const CREATIVE_WIDTH = 1080;
export const CREATIVE_HEIGHT = 1920;

/** [width, height] of a JPEG, read from its header; null when it cannot be read. */
export function jpegSize(bytes) {
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) { at += 1; continue; }
    const marker = bytes[at + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { at += marker === 0xff ? 1 : 2; continue; }
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    // A start-of-frame marker (not the table markers that share the range) holds the size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = (bytes[at + 5] << 8) | bytes[at + 6];
      const width = (bytes[at + 7] << 8) | bytes[at + 8];
      return width && height ? [width, height] : null;
    }
    at += 2 + length;
  }
  return null;
}

/**
 * Words for the admin when a picture is too small for sharp creatives (it fills the 1080x1920 frame, so it is enlarged by the larger of the two
 * ratios), or null when it is big enough or its size is not known. A small enlargement is not worth a warning.
 */
export function resolutionWarning(width, height) {
  if (!width || !height) return null;
  const enlarged = Math.max(CREATIVE_WIDTH / width, CREATIVE_HEIGHT / height);
  if (enlarged <= 1.05) return null;
  const portrait = height > width;
  return `Low resolution: ${width}×${height}. Creatives are ${CREATIVE_WIDTH}×${CREATIVE_HEIGHT}, so this is enlarged ${enlarged.toFixed(1)}× and will look soft. For sharp creatives use at least ${CREATIVE_WIDTH}×${CREATIVE_HEIGHT}${portrait ? '' : ', and portrait (vertical) rather than landscape'}.`;
}

const isJpeg = (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
/** A worker job that started and has not yet written its id down is given this long before another request may start it again. */
const STARTING_MS = 2 * 60 * 1000;
const CUTOUT_TRIES = 3;
const LOOK_TRIES = 3;
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
  width: row.width,
  height: row.height,
  /** Words when the picture is too small for sharp creatives; the item can still be approved. */
  warning: resolutionWarning(row.width, row.height),
  /** Tags our vision model suggests (the admin decides); those the item already has are left out. */
  seen: (row.seen ?? []).filter(tag => !row.tags.includes(tag)),
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
      if (!row.ready) {
        const bytes = await getObject(keyOf(row.id));
        if (isJpeg(bytes)) {
          const [width, height] = jpegSize(bytes) ?? [null, null];
          await sql`update library_items set ready = true, problem = null, width = ${width}, height = ${height} where id = ${row.id}`;
        }
        else await sql`update library_items set problem = 'This photo is not a JPEG. Delete it and send it again.' where id = ${row.id}`;
        return;
      }
      // The cut-out comes first; a job still out before the first look is the cut-out's.
      if (!row.cutout && row.look_tries === 0 && (row.cutout_tries < CUTOUT_TRIES || row.prepare_job)) await cutOut(row);
      else await lookAt(row);
      return;
    }
    if (row.ready) {
      await lookAt(row);
      return;
    }
    if (row.prepare_job && row.prepare_job !== 'starting') {
      const answer = await askPrepare(row.prepare_job);
      if (answer.failed) await sql`update library_items set problem = ${answer.failed}, prepare_job = null where id = ${row.id}`;
      else if (answer.done) {
        const shots = Array.isArray(answer.done.shots) ? JSON.stringify(answer.done.shots) : null;
        const width = Number.isInteger(answer.done.width) ? answer.done.width : null;
        const height = Number.isInteger(answer.done.height) ? answer.done.height : null;
        await sql`update library_items set ready = true, problem = null, prepare_job = null, shots = ${shots}::jsonb, width = ${width}, height = ${height} where id = ${row.id}`;
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

/**
 * A ready photo also gets its subject cut out (Riso and Dust draw from it). The photo is usable before that, in Our photography; a photo
 * the worker cannot cut is tried three times and then left alone. Never throws.
 */
async function cutOut(row) {
  const sql = db();
  try {
    if (row.prepare_job && row.prepare_job !== 'starting') {
      const answer = await askPrepare(row.prepare_job);
      if (answer.failed) await sql`update library_items set prepare_job = null where id = ${row.id}`;
      else if (answer.done) await sql`update library_items set cutout = true, prepare_job = null where id = ${row.id}`;
      return;
    }
    const [claimed] = await sql`
      update library_items set prepare_job = 'starting', prepare_at = now(), cutout_tries = cutout_tries + 1
      where id = ${row.id} and not cutout and cutout_tries < ${CUTOUT_TRIES}
        and (prepare_job is null or (prepare_job = 'starting' and prepare_at < now() - ${`${STARTING_MS} milliseconds`}::interval))
      returning id`;
    if (!claimed) return;
    try {
      const job = await startPrepare(await signedDownload(keyOf(row.id), null, 1800), { cutout: await signedUpload(cutoutKey(row.id)) }, 'photo');
      await sql`update library_items set prepare_job = ${job} where id = ${row.id}`;
    } catch (cause) {
      await sql`update library_items set prepare_job = null where id = ${row.id}`;
      throw cause;
    }
  } catch (cause) {
    console.error('library cut-out:', cause);
  }
}

/**
 * A ready item (a photo after its cut-out) is looked at once by our vision model: how strongly it shows each look the brain asks for,
 * and tags to suggest. A clip is looked at in its prepared copy. An item it cannot read is tried three times and then left to its tags. Never throws.
 */
async function lookAt(row) {
  const sql = db();
  try {
    if (row.prepare_job && row.prepare_job !== 'starting') {
      const answer = await askPrepare(row.prepare_job);
      if (answer.failed) await sql`update library_items set prepare_job = null where id = ${row.id}`;
      else if (answer.done) {
        const looks = answer.done.looks && typeof answer.done.looks === 'object' ? answer.done.looks : {};
        const seen = Array.isArray(answer.done.seen) ? answer.done.seen.filter(tag => typeof tag === 'string' && TAG.test(tag)) : [];
        await sql`update library_items set looks = ${JSON.stringify(looks)}::jsonb, seen = ${seen}, prepare_job = null where id = ${row.id}`;
      }
      return;
    }
    const [claimed] = await sql`
      update library_items set prepare_job = 'starting', prepare_at = now(), look_tries = look_tries + 1
      where id = ${row.id} and ready and looks is null and look_tries < ${LOOK_TRIES}
        and (prepare_job is null or (prepare_job = 'starting' and prepare_at < now() - ${`${STARTING_MS} milliseconds`}::interval))
      returning id`;
    if (!claimed) return;
    try {
      const job = await startPrepare(await signedDownload(row.kind === 'photo' ? keyOf(row.id) : motionKey(row.id), null, 1800), {}, 'describe');
      await sql`update library_items set prepare_job = ${job} where id = ${row.id}`;
    } catch (cause) {
      // The worker never had it: that try does not count against the item.
      await sql`update library_items set prepare_job = null, look_tries = look_tries - 1 where id = ${row.id}`;
      throw cause;
    }
  } catch (cause) {
    console.error('library look:', cause);
  }
}

/** Looks at every arrived item that is not ready, still needs its cut-out or has not been looked at, and has no stated problem, so the library moves on whenever anyone looks at it. */
async function prepareWaiting() {
  const rows = await db()`select * from library_items where arrived and problem is null and (not ready or (kind = 'photo' and not cutout and cutout_tries < ${CUTOUT_TRIES}) or (looks is null and look_tries < ${LOOK_TRIES})) order by ready, created_at desc limit 20`;
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
  if (tags.length > MAX_TAGS_PER_ITEM) return { refused: `At most ${MAX_TAGS_PER_ITEM} tags for one item.` };
  return { tags };
}

/**
 * Changes an item: any of status, attitudes, tags, genre, subGenre, note. Returns the item, null when it is not
 * there, or { refused } with a reason in words.
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
    if (!list || list.some(code => !ATTITUDES.includes(code))) return { refused: 'Choose moods from the list.' };
    if (list.length > MAX_ATTITUDES) return { refused: `At most ${MAX_ATTITUDES} moods for one item. Fewer is better.` };
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
  const [{ pool, known }] = await sql`select count(*)::int as pool, (count(*) filter (where name = any (${next.tags})))::int as known from library_tags`;
  const fresh = next.tags.length - known;
  if (fresh > 0 && pool + fresh > tagLimit()) return { refused: `The tag list is full (${tagLimit()}). Remove a tag you do not use, or reuse one.` };
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
  await Promise.all([keyOf(id), motionKey(id), posterKey(id), cutoutKey(id)].map(key => deleteObject(key).catch(() => undefined)));
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
  const learned = await learnedCounts();
  return Promise.all(rows.map(async (row) => ({
    id: row.id,
    kind: row.kind,
    attitudes: row.attitudes,
    tags: row.tags,
    genre: row.genre,
    subGenre: row.sub_genre,
    ...(row.looks && Object.keys(row.looks).length ? { looks: row.looks } : {}),
    ...(learned.has(row.id) ? { learned: learned.get(row.id) } : {}),
    url: await signedDownload(row.kind === 'photo' ? keyOf(row.id) : posterKey(row.id), null),
    ...(row.kind === 'photo' ? (row.cutout ? { cutoutUrl: await signedDownload(cutoutKey(row.id), null) } : {}) : { motionUrl: await signedDownload(motionKey(row.id), null), ...(row.shots ? { shots: row.shots } : {}) }),
  })));
}

/** How far back what people did still counts: tastes move, and the library changes. */
const LEARNED_DAYS = 90;

/**
 * For each library picture, how often a card drawn from it was played (`shown`) and how often one was kept: put in the cart or delivered
 * (`won`). A reel counts for every picture in it. Cards drawn on the person's own picture say nothing about ours. Counts only, never who.
 * Learning must never stop the library from loading: without the table, or on any error, nothing is learned.
 */
export async function learnedCounts() {
  try {
    const rows = await db()`
      select id, count(*) filter (where event = 'play')::int as shown, count(*) filter (where event in ('select', 'delivered'))::int as won
      from (
        select event, unnest(coalesce(reel_ids, array[library_id])) as id from brain_feedback
        where created_at > now() - make_interval(days => ${LEARNED_DAYS}) and event in ('play', 'select', 'delivered')
          and (library_id is not null or reel_ids is not null) and own_picture is not true
      ) used
      group by id`;
    return new Map(rows.map(row => [row.id, { shown: row.shown, won: row.won }]));
  } catch (cause) {
    console.error('learned counts:', cause);
    return new Map();
  }
}

/**
 * The pictures of a Director's reel: for each id, in order, what the cloud renderer needs to draw it, as a link it can fetch (half an hour: a render
 * queues and runs in chunks) and, for a clip, its shots. `withCutouts` (Depth): photos only, each with its cut-out. Null for an id that is not an approved, ready item, so a reel is never drawn with a hole.
 */
export async function libraryReel(ids, withCutouts = false) {
  const rows = await db()`select id, kind, shots, cutout from library_items where id = any(${ids}::uuid[]) and arrived and ready and status = 'approved'`;
  const found = new Map(rows.map((row) => [row.id, row]));
  return Promise.all(ids.map(async (id) => {
    const row = found.get(id);
    if (!row) return null;
    if (row.kind === 'photo') {
      // Depth puts the person in front, so each photo comes with its cut-out; one without it cannot be in that reel.
      if (withCutouts && !row.cutout) return null;
      return { kind: 'photo', url: await signedDownload(keyOf(id), null, 1800), ...(withCutouts ? { cutoutUrl: await signedDownload(cutoutKey(id), null, 1800) } : {}) };
    }
    if (withCutouts) return null;
    return { kind: 'clip', url: await signedDownload(motionKey(id), null, 1800), ...(row.shots ? { shots: row.shots } : {}) };
  }));
}

/** What a render needs of an approved item, read from storage: `{ photo }` (with `cutout` once it has one) or `{ motion }`. Null when it is not approved and ready. */
export async function libraryMedia(id) {
  const [row] = await db()`select kind, cutout from library_items where id = ${id} and arrived and ready and status = 'approved'`;
  if (!row) return null;
  if (row.kind !== 'photo') return { motion: await getObject(motionKey(id)) };
  return { photo: await getObject(keyOf(id)), ...(row.cutout ? { cutout: await getObject(cutoutKey(id)) } : {}) };
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
  if (!known && count >= tagLimit()) return { refused: `The tag list is full (${tagLimit()}). Remove a tag you do not use first.` };
  await sql`insert into library_tags (name) values (${read.tags[0]}) on conflict do nothing`;
  return { tag: read.tags[0] };
}
