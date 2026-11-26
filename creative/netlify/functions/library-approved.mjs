import { learnedShelf, listApproved } from '../lib/library.mjs';
import { storageReady } from '../lib/storage.mjs';
import { libraryCacheHeaders } from '../lib/public-cache.mjs';

/**
 * What the creatives may draw from the approved library: only approved items that are ready, each with a link that
 * works for an hour. The answer is the same for everyone, so the CDN keeps it a few minutes (`public-cache.mjs`). Anyone using the app may ask (the templates need it), so nothing here says who cleared a file
 * or where it came from; the admin sees all of that through /api/admin/library. `cards`, `rows` and `lanes` are what people lately
 * kept and downloaded of each template and its kinds of card, overall and per lane (counts only, `learnedShelf`), so the shelf can
 * lead with what they want.
 */
export default async function handler(request) {
  if (request.method !== 'GET') return Response.json({ error: 'Use GET.' }, { status: 405, headers: { Allow: 'GET' } });
  // Without storage there is simply nothing to offer: the templates carry on with our own photography.
  if (!storageReady() || !process.env.DATABASE_URL) return Response.json({ items: [], cards: {}, rows: {}, lanes: {} }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const [items, shelf] = await Promise.all([listApproved(), learnedShelf()]);
    return Response.json({ items, ...shelf }, { headers: libraryCacheHeaders() });
  } catch (cause) {
    console.error('library:', cause);
    return Response.json({ items: [], cards: {}, rows: {}, lanes: {} }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const config = { path: '/api/library', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
