import { randomUUID } from 'node:crypto';
import { validAccess } from '../lib/access.mjs';
import { storeFeedback, validFeedback } from '../lib/feedback.mjs';
import { personFrom, recordPerson } from '../lib/person.mjs';

const SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const ORIGIN = 'https://mumoo-staging.netlify.app';
const LIMIT = 4096;
const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

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
  if (!validFeedback(data)) return reply(400, { error: 'Invalid request.' });

  // Kept for the brain to learn from (a row in brain_feedback), against the person when they are signed in.
  const person = await personFrom(request);
  if (person) await recordPerson(person).catch(() => undefined);
  await storeFeedback(data, person?.id ?? null);

  // The same signal as a structured log, and optionally sent upstream.
  console.info(JSON.stringify({
    event: 'pack_feedback',
    time: new Date().toISOString(),
    feedback: data.event,
    clipSha256: data.clipSha256,
    language: data.language,
    lyricAttitude: data.lyricAttitude,
    lyricSadness: data.lyricSadness,
    lyricIntensity: data.lyricIntensity,
    lyricsOrigin: data.lyricsOrigin,
    primaryGenre: data.primaryGenre,
    vibe: data.vibe,
    lane: data.lane,
    row: data.row,
    style: data.slot?.style,
    font: data.slot?.font,
    fontSecondary: data.slot?.fontSecondary,
    slotId: data.slot?.id,
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
