import { createHmac, randomUUID } from 'node:crypto';
const SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const ORIGIN = 'https://mumoo-staging.netlify.app';
const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
async function processRequest(request) {
  if (process.env.SITE_ID !== SITE || new URL(request.url).origin !== ORIGIN) return reply(404, { error: 'Not available.' });
  if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (request.headers.get('origin') !== ORIGIN) return reply(403, { error: 'Open MUMOO Staging.' });
  // Staging open access: no tester password. Tokens are still HMAC-signed and
  // only minted for the staging origin. Production never hosts this function.
  const key = process.env.MUMOO_BRAIN_TESTER_KEY || '';
  if (key.length < 32) {
    console.info(JSON.stringify({ event: 'brain_access_config', signingKeyPresent: Boolean(key), signingKeyMeetsMinimum: key.length >= 32 }));
    return reply(503, { error: 'Tester access is unavailable.' });
  }
  if (Number(request.headers.get('content-length')) > 1024) return reply(413, { error: 'Request too large.' });
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > 1024) return reply(413, { error: 'Request too large.' });
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
export const config = { path: '/api/brain-tester-access', rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ['ip'] } };
