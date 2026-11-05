import { validAccess, valid } from './brain-gateway.mjs';
const SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const ORIGIN = 'https://mumoo-staging.netlify.app';
const BRAIN = 'https://mumoo-brain-staging.netlify.app/api/media';
const response = (status, error) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
export default async function handler(request) {
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
    if (!input || typeof input !== 'object' || Array.isArray(input) || !['discover', 'review', 'review-many', 'list', 'recommend'].includes(input.operation)) return response(400, 'Invalid request.');
    const allowed = { discover: ['operation', 'query'], review: ['operation', 'id', 'status'], 'review-many': ['operation', 'ids', 'status'], list: ['operation'], recommend: ['operation', 'profile'] };
    if (Object.keys(input).some(key => !allowed[input.operation].includes(key))) return response(400, 'Invalid request.');
    if (input.operation === 'recommend' && (!valid(input.profile) || !input.profile.music)) return response(400, 'Music analysis is required.');
    if (input.operation === 'discover' && (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 80)) return response(400, 'Invalid search.');
    if (input.operation === 'review' && (typeof input.id !== 'string' || !/^met-\d+$/.test(input.id) || !['approved', 'rejected'].includes(input.status))) return response(400, 'Invalid review.');
    if (input.operation === 'review-many' && (!Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 25 || input.ids.some(id => typeof id !== 'string' || !/^met-\d+$/.test(id)) || !['approved', 'rejected'].includes(input.status))) return response(400, 'Invalid review.');
    const result = await fetch(BRAIN, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(55000), headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify(input) });
    if (!result.ok) return response(502, 'Media service unavailable.');
    return Response.json(await result.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch { return response(503, 'Media service unavailable.'); }
}
export const config = { path: '/api/media-catalog', rateLimit: { windowSize: 60, windowLimit: 10, aggregateBy: ['ip'] } };
