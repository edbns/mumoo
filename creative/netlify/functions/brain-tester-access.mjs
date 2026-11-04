import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
const SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const ORIGIN = 'https://mumoo-staging.netlify.app';
const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
async function processRequest(request) {
  if (process.env.SITE_ID !== SITE || new URL(request.url).origin !== ORIGIN) return reply(404, { error: 'Not available.' });
  if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (request.headers.get('origin') !== ORIGIN) return reply(403, { error: 'Open MUMOO Staging.' });
  const password = process.env.MUMOO_BRAIN_TESTER_PASSWORD || '';
  const key = process.env.MUMOO_BRAIN_TESTER_KEY || '';
  if (password.length < 32 || key.length < 32) return reply(503, { error: 'Tester access is unavailable.' });
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return reply(415, { error: 'Invalid request.' });
  if (Number(request.headers.get('content-length')) > 1024) return reply(413, { error: 'Request too large.' });
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > 1024) return reply(413, { error: 'Request too large.' });
  let body; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply(400, { error: 'Invalid request.' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.password !== 'string' || body.password.length > 256) return reply(400, { error: 'Invalid request.' });
  const digest = value => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(body.password), digest(password))) return reply(401, { error: 'Tester access denied.' });
  const expires = Math.floor(Date.now() / 1000) + 900;
  const signature = createHmac('sha256', key).update(`mumoo-brain-staging:${expires}`).digest('hex');
  return reply(200, { token: `${expires}.${signature}`, expires });
}
export default async function handler(request) {
  const requestId = randomUUID(); const started = Date.now(); let result;
  try { result = await processRequest(request); } catch { result = reply(500, { error: 'Tester access unavailable.' }); }
  console.info(JSON.stringify({ event: 'brain_access', requestId, time: new Date(started).toISOString(), status: result.status, durationMs: Date.now() - started }));
  result.headers.set('X-Mumoo-Request-Id', requestId); return result;
}
export const config = { path: '/api/brain-tester-access', rateLimit: { windowSize: 60, windowLimit: 4, aggregateBy: ['ip'] } };
