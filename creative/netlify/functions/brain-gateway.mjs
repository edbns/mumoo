import { createHmac, timingSafeEqual } from 'node:crypto';

const SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const ORIGIN = 'https://mumoo-staging.netlify.app';
const BRAIN = 'https://mumoo-brain-staging.netlify.app/api/recommend';
const LIMIT = 8192;
const response = (status, error) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
const object = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => keys.includes(k));
const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const label = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 120;
function valid(v) {
  if (!object(v, ['version', 'videoType', 'primaryGenre', 'influence', 'music']) || v.version !== 1 || !['lyric', 'visual'].includes(v.videoType) || !label(v.primaryGenre) || (v.influence !== undefined && !label(v.influence))) return false;
  if (v.music === undefined) return true;
  const m = v.music;
  return object(m, ['beatsMs', 'tempoStatus', 'gridBpm', 'rmsMean', 'onsetCount', 'centroidHz', 'dynamics']) && Array.isArray(m.beatsMs) && m.beatsMs.length <= 500 && m.beatsMs.every((n, i) => Number.isSafeInteger(n) && n >= 0 && n <= 15000 && (!i || n >= m.beatsMs[i - 1])) && ['estimated', 'ambiguous', 'unavailable'].includes(m.tempoStatus) && (m.gridBpm === null || finite(m.gridBpm, 1, 400)) && (m.tempoStatus !== 'unavailable' || m.gridBpm === null) && finite(m.rmsMean, 0, 1) && Number.isInteger(m.onsetCount) && finite(m.onsetCount, 0, 1000) && finite(m.centroidHz, 0, 96000) && ['low', 'moderate', 'high', 'unavailable'].includes(m.dynamics);
}
export function validAccess(token, key, now = Math.floor(Date.now() / 1000)) {
  if (typeof key !== 'string' || key.length < 32 || !/^\d{10}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expiry, signature] = token.split('.');
  if (Number(expiry) <= now || Number(expiry) > now + 86400) return false;
  const expected = createHmac('sha256', key).update(`mumoo-brain-staging:${expiry}`).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}
export default async function handler(request) {
  if (process.env.SITE_ID !== SITE || new URL(request.url).origin !== ORIGIN) return response(404, 'Not available.');
  if (request.method !== 'POST') return response(405, 'Use POST.');
  if (request.headers.get('origin') !== ORIGIN) return response(403, 'Open MUMOO Staging.');
  if (!validAccess(request.headers.get('x-mumoo-brain-access') || '', process.env.MUMOO_BRAIN_TESTER_KEY)) return response(401, 'Tester access is invalid or expired.');
  const secret = process.env.MUMOO_BRAIN_SERVICE_SECRET || '';
  if (secret.length < 32) return response(503, 'Recommendations unavailable.');
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return response(415, 'Expected JSON.');
  if (Number(request.headers.get('content-length')) > LIMIT) return response(413, 'Request too large.');
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > LIMIT) return response(413, 'Request too large.');
    let data; try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { return response(400, 'Invalid request.'); }
    if (!valid(data)) return response(400, 'Invalid request.');
    const upstream = await fetch(BRAIN, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify(data) });
    if (!upstream.ok) return response(502, 'Recommendations unavailable.');
    const result = await upstream.json();
    const safeEntry = (e, ranked) => object(e, ['id', 'version', 'name', 'description', 'renderer', 'preview', 'export', ...(ranked ? ['explanation'] : [])]) && label(e.id) && label(e.name) && label(e.description) && Number.isInteger(e.version) && object(e.renderer, ['kind', 'template']) && e.renderer.kind === 'existing_canvas' && ['scribble', 'elastic', 'glitch'].includes(e.renderer.template) && e.preview === true && e.export === true && (!ranked || label(e.explanation));
    if (!object(result, ['version', 'catalogVersion', 'algorithmVersion', 'eligibleCount', 'recommendations', 'catalog']) || result.version !== 1 || !Number.isInteger(result.catalogVersion) || !Number.isInteger(result.algorithmVersion) || !Array.isArray(result.recommendations) || !Array.isArray(result.catalog) || result.recommendations.length > 8 || result.catalog.length > 100 || result.eligibleCount !== result.catalog.length || !result.recommendations.every(e => safeEntry(e, true)) || !result.catalog.every(e => safeEntry(e, false))) return response(502, 'Recommendations unavailable.');
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return response(502, 'Recommendations unavailable.'); }
}
export const config = { path: '/api/brain-recommendations', rateLimit: { windowSize: 60, windowLimit: 10, aggregateBy: ['ip'] } };
