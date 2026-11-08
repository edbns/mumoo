import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const ORIGIN = 'https://mumoo-staging.netlify.app';
const LIMIT = 4096;
const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

function validAccess(token, key, now = Math.floor(Date.now() / 1000)) {
  if (typeof key !== 'string' || key.length < 32 || !/^\d{10}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expiry, signature] = token.split('.');
  if (Number(expiry) <= now || Number(expiry) > now + 86400) return false;
  const expected = createHmac('sha256', key).update(`mumoo-brain-staging:${expiry}`).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function validBody(v) {
  if (!v || typeof v !== 'object' || v.version !== 1) return false;
  if (!['play', 'select', 'download'].includes(v.event)) return false;
  if (typeof v.clipSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.clipSha256)) return false;
  if (!['lyric', 'visual'].includes(v.videoType)) return false;
  if (typeof v.primaryGenre !== 'string' || !v.primaryGenre.trim() || v.primaryGenre.length > 80) return false;
  if (v.vibe !== null && typeof v.vibe !== 'string') return false;
  if (typeof v.lane !== 'string' || v.lane.length > 24) return false;
  const s = v.slot;
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || s.id.length > 120) return false;
  if (typeof s.style !== 'string' || s.style.length > 40) return false;
  if (typeof s.font !== 'string' || typeof s.fontSecondary !== 'string') return false;
  return true;
}

async function processRequest(request) {
  if (process.env.SITE_ID !== SITE || new URL(request.url).origin !== ORIGIN) return reply(404, { error: 'Not available.' });
  if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (request.headers.get('origin') !== ORIGIN) return reply(403, { error: 'Open MUMOO Staging.' });
  if (!validAccess(request.headers.get('x-mumoo-brain-access') || '', process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return reply(401, { error: 'Tester access is invalid or expired.' });
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return reply(415, { error: 'Expected JSON.' });
  if (Number(request.headers.get('content-length')) > LIMIT) return reply(413, { error: 'Request too large.' });
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > LIMIT) return reply(413, { error: 'Request too large.' });
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply(400, { error: 'Invalid request.' }); }
  if (!validBody(data)) return reply(400, { error: 'Invalid request.' });

  // Learning signal for the brain: structured log now; optional upstream later.
  console.info(JSON.stringify({
    event: 'pack_feedback',
    time: new Date().toISOString(),
    feedback: data.event,
    clipSha256: data.clipSha256,
    videoType: data.videoType,
    primaryGenre: data.primaryGenre,
    vibe: data.vibe,
    lane: data.lane,
    style: data.slot.style,
    font: data.slot.font,
    fontSecondary: data.slot.fontSecondary,
    slotId: data.slot.id,
    selectedIds: Array.isArray(data.selectedIds) ? data.selectedIds.slice(0, 32) : undefined,
    generation: data.generation,
  }));

  const brainUrl = process.env.MUMOO_PACK_FEEDBACK_URL || '';
  const secret = process.env.MUMOO_BRAIN_SERVICE_SECRET || '';
  if (brainUrl.startsWith('https://') && secret.length >= 32) {
    try {
      await fetch(brainUrl, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(4000),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify(data),
      });
    } catch {
      // Local log already captured; upstream is best-effort.
    }
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export default async function handler(request) {
  const requestId = randomUUID();
  const started = Date.now();
  let result;
  try { result = await processRequest(request); }
  catch { result = reply(500, { error: 'Feedback unavailable.' }); }
  console.info(JSON.stringify({ event: 'pack_feedback_gateway', requestId, time: new Date(started).toISOString(), status: result.status, durationMs: Date.now() - started }));
  result.headers.set('X-Mumoo-Request-Id', requestId);
  return result;
}

export const config = { path: '/api/pack-feedback', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
