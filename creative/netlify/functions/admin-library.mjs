import { adminFrom, reply, refuse } from '../lib/admin.mjs';
import { addTag, changeItem, itemArrived, listLibrary, listTagPool, removeItem, removeTag, reserveItem } from '../lib/library.mjs';
import { storageReady } from '../lib/storage.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The approved library, for the admin only (every request is checked on the server).
 *   GET                      the items and the tag list
 *   POST   JSON {type, bytes, rights, note?}   room for a file: {id, putUrl} to send it to
 *   PUT    ?id=…             the file has been sent: it joins the library as pending
 *   PATCH  ?id=… JSON        change status, attitudes, tags, genre, subGenre or note
 *   DELETE ?id=…             removes the item and its file
 *   POST   ?tag=name         adds a tag to the list;  DELETE ?tag=name removes it from the list and from every item
 */
export default async function handler(request) {
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return refuse(405, 'Use GET, POST, PUT, PATCH or DELETE.');
  const { admin, refusal } = await adminFrom(request);
  if (refusal) return refusal;
  if (!storageReady()) return refuse(503, 'File storage is unavailable.');
  const params = new URL(request.url).searchParams;
  try {
    if (request.method === 'GET') return reply(200, await listLibrary());

    const tag = params.get('tag');
    if (tag !== null) {
      if (request.method === 'POST') {
        const result = await addTag(tag);
        return result.refused ? refuse(400, result.refused) : reply(200, await listLibrary());
      }
      if (request.method === 'DELETE') return (await removeTag(tag.trim().toLowerCase())) ? reply(200, await listLibrary()) : refuse(404, 'Not found.');
      return refuse(405, 'Use POST or DELETE for a tag.');
    }

    if (request.method === 'POST') {
      if (Number(request.headers.get('content-length') || 0) > 4096) return refuse(413, 'Request too large.');
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object') return refuse(400, 'Say what the file is and how big.');
      const result = await reserveItem(admin, body);
      return result.refused ? refuse(400, result.refused) : reply(201, result);
    }

    const id = params.get('id') ?? '';
    if (!UUID.test(id)) return refuse(400, 'Invalid id.');
    if (request.method === 'PUT') {
      const item = await itemArrived(id);
      return item ? reply(200, { item }) : refuse(404, 'That file has not arrived, or is not the size it was said to be.');
    }
    if (request.method === 'PATCH') {
      if (Number(request.headers.get('content-length') || 0) > 8192) return refuse(413, 'Request too large.');
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return refuse(400, 'Say what to change.');
      const result = await changeItem(id, body);
      if (!result) return refuse(404, 'Not found.');
      return result.refused ? refuse(400, result.refused) : reply(200, { item: result, tags: await listTagPool() });
    }
    return (await removeItem(id)) ? reply(200, await listLibrary()) : refuse(404, 'Not found.');
  } catch (cause) {
    console.error('admin library:', cause);
    return refuse(500, 'That did not work. Try again in a moment.');
  }
}

export const config = { path: '/api/admin/library', rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip'] } };
