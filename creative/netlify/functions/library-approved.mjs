import { listApproved } from '../lib/library.mjs';
import { storageReady } from '../lib/storage.mjs';

/**
 * What the creatives may draw from the approved library: only approved items that are ready, each with a link that
 * works for 15 minutes. Anyone using the app may ask (the templates need it), so nothing here says who cleared a file
 * or where it came from; the admin sees all of that through /api/admin/library.
 */
export default async function handler(request) {
  if (request.method !== 'GET') return Response.json({ error: 'Use GET.' }, { status: 405, headers: { Allow: 'GET' } });
  // Without storage there is simply nothing to offer: the templates carry on with our own photography.
  if (!storageReady() || !process.env.DATABASE_URL) return Response.json({ items: [] }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    return Response.json({ items: await listApproved() }, { headers: { 'Cache-Control': 'private, max-age=30' } });
  } catch (cause) {
    console.error('library:', cause);
    return Response.json({ items: [] }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const config = { path: '/api/library', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
