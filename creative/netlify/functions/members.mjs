import { db } from '../lib/person.mjs';

/** GET /api/members — the newest member number (how many have joined, deleted accounts included), for /welcome. Nothing about anyone. */
export default async function handler(request) {
  if (request.method !== 'GET') return Response.json({ error: 'Use GET.' }, { status: 405 });
  if (!process.env.DATABASE_URL) return Response.json({ error: 'Unavailable.' }, { status: 503 });
  const [row] = await db()`select coalesce(max(member_no), 0) as latest from app_users`;
  return Response.json({ latest: Number(row.latest) }, { headers: { 'Cache-Control': 'public, max-age=60', 'Netlify-CDN-Cache-Control': 'public, max-age=60' } });
}

export const config = { path: '/api/members', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
