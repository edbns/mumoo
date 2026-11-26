import { createHmac, randomUUID } from 'node:crypto';
import { siteOf } from '../lib/sites.mjs';
const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
async function processRequest(request) {
  const site = siteOf(request);
  if (!site) return reply(404, { error: 'Not available.' });
  if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (request.headers.get('origin') !== site.origin) return reply(403, { error: 'Open mumoo.' });
  // Open access: no tester password. Tokens are still HMAC-signed, each site with its own key, and only minted for its own address.
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
