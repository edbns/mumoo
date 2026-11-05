import { validAccess, valid } from './brain-gateway.mjs';
import { randomUUID } from 'node:crypto';
const SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const ORIGIN = 'https://mumoo-staging.netlify.app';
const BRAIN = 'https://mumoo-brain-staging.netlify.app/api/media';
const response = (status, error) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
async function processRequest(request) {
  if (process.env.SITE_ID !== SITE || new URL(request.url).origin !== ORIGIN) return response(404, 'Not available.');
  if (request.method !== 'POST') return response(405, 'Use POST.');
  if (request.headers.get('origin') !== ORIGIN) return response(403, 'Open MUMOO Staging.');
  if (!validAccess(request.headers.get('x-mumoo-brain-access') || '', process.env.MUMOO_BRAIN_TESTER_KEY)) return response(401, 'Staging access is invalid or expired.');
  const secret = process.env.MUMOO_BRAIN_SERVICE_SECRET || ''; if (secret.length < 32) return response(503, 'Media service unavailable.');
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return response(415, 'Expected JSON.');
  try {
    if (Number(request.headers.get('content-length')) > 16384) return response(413, 'Request too large.');
    const bytes = await request.arrayBuffer(); if (bytes.byteLength > 16384) return response(413, 'Request too large.');
    const input = JSON.parse(new TextDecoder().decode(bytes));
    if (!input || typeof input !== 'object' || Array.isArray(input) || !['discover', 'discover-video', 'review', 'review-many', 'list', 'recommend', 'director', 'asset', 'research-discover', 'research-list', 'research-review', 'research-retain'].includes(input.operation)) return response(400, 'Invalid request.');
    const allowed = { discover: ['operation', 'query'], 'discover-video': ['operation', 'query'], review: ['operation', 'id', 'status'], 'review-many': ['operation', 'ids', 'status'], list: ['operation'], recommend: ['operation', 'profile'], director: ['operation', 'profile', 'onsetsMs'], asset: ['operation', 'id'], 'research-discover': ['operation', 'provider', 'query', 'unit', 'shard'], 'research-list': ['operation', 'offset'], 'research-review': ['operation', 'id', 'rightsStatus', 'adSafety'], 'research-retain': ['operation', 'id'] };
    if (Object.keys(input).some(key => !allowed[input.operation].includes(key))) return response(400, 'Invalid request.');
    if (['recommend', 'director'].includes(input.operation) && (!valid(input.profile) || !input.profile.music)) return response(400, 'Music analysis is required.');
    if (input.operation === 'director' && (!Array.isArray(input.onsetsMs) || input.onsetsMs.length > 1000 || input.onsetsMs.some((n, i) => !Number.isSafeInteger(n) || n < 0 || n >= 15000 || (i && n < input.onsetsMs[i - 1])))) return response(400, 'Invalid timing.');
    if (['discover', 'discover-video'].includes(input.operation) && (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 80)) return response(400, 'Invalid search.');
    if (input.operation === 'review' && (typeof input.id !== 'string' || !/^(?:met|commons)-\d+$/.test(input.id) || !['approved', 'rejected'].includes(input.status))) return response(400, 'Invalid review.');
    if (input.operation === 'asset' && (typeof input.id !== 'string' || !/^met-\d+$/.test(input.id))) return response(400, 'Invalid asset.');
    if (input.operation === 'review-many' && (!Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 25 || input.ids.some(id => typeof id !== 'string' || !/^(?:met|commons)-\d+$/.test(id)) || !['approved', 'rejected'].includes(input.status))) return response(400, 'Invalid review.');
    if (input.operation === 'research-discover' && (!['cleveland', 'smithsonian', 'commons'].includes(input.provider) || typeof input.query !== 'string' || !input.query.trim() || input.query.length > 80 || (input.provider === 'smithsonian' && (!['nasm', 'nmah', 'saam', 'chndm', 'eepa', 'nmnhbotany'].includes(input.unit) || !/^[a-f0-9]{2}$/.test(input.shard))))) return response(400, 'Invalid search.');
    if (input.operation === 'research-list' && input.offset !== undefined && (!Number.isSafeInteger(input.offset) || input.offset < 0 || input.offset > 10000)) return response(400, 'Invalid request.');
    if (['research-review', 'research-retain'].includes(input.operation) && (typeof input.id !== 'string' || !/^(?:cma-\d+|si-[a-f0-9]{24}|commons2-\d+)$/.test(input.id))) return response(400, 'Invalid asset.');
    if (input.operation === 'research-review' && (!['APPROVED', 'REJECTED'].includes(input.rightsStatus) || !['SAFE', 'REVIEW_REQUIRED', 'BLOCKED'].includes(input.adSafety))) return response(400, 'Invalid review.');
    const result = await fetch(BRAIN, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(55000), headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify(input) });
    if (!result.ok) return response(502, 'Media service unavailable.');
    const data = await result.json();
    if (input.operation === 'asset') {
      const url = new URL(data.previewUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'images.metmuseum.org' || url.port || url.username || url.password) return response(502, 'Media service unavailable.');
      const image = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      const type = image.headers.get('content-type') || '';
      const max = 5 * 1024 * 1024;
      if (!image.ok || !/^image\/(jpeg|png|webp)$/i.test(type) || Number(image.headers.get('content-length')) > max || !image.body) return response(502, 'Image unavailable.');
      const reader = image.body.getReader(); const chunks = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); return response(502, 'Image unavailable.'); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return response(503, 'Media service unavailable.'); }
}
export default async function handler(request) {
  const requestId = randomUUID(), started = Date.now();
  let result;
  try { result = await processRequest(request); } catch { result = response(500, 'Media service unavailable.'); }
  console.info(JSON.stringify({ event: 'media_gateway', requestId, time: new Date(started).toISOString(), status: result.status, durationMs: Date.now() - started,
    category: result.status === 200 ? 'success' : result.status === 401 || result.status === 403 ? 'access_denied' : result.status >= 500 ? 'service_unavailable' : 'request_rejected' }));
  result.headers.set('X-Mumoo-Request-Id', requestId); return result;
}
export const config = { path: '/api/media-catalog', rateLimit: { windowSize: 60, windowLimit: 10, aggregateBy: ['ip'] } };
