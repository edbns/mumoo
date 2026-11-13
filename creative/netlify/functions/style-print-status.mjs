import { validAccess } from '../lib/access.mjs';
import { storePrint, validLabel, validPrint } from '../lib/style-prints.mjs';

/**
 * Genre learning, step two: ask for a sound print job (from style-print). 202 while it runs; once ready, the print is
 * kept with the style given to the clip. Only the answer goes back to the browser, never the print.
 * Body: { version: 1, id, label: { sourceSha256, offsetMs, style, genre, subGenre, source } }.
 */
const STAGING_ORIGIN = 'https://mumoo-staging.netlify.app';
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const MODAL_STATUS = 'https://edbns-mumoo-staging--mumoo-sound-print-staging-status.us-east.modal.run';
const CALL_ID = /^fc-[A-Za-z0-9]{8,48}$/;
const LIMIT = 4096;
const headers = { 'Cache-Control': 'no-store' };
const error = (status, message) => Response.json({ error: message }, { status, headers });

export default async function stylePrintStatus(request) {
  if (process.env.SITE_ID !== STAGING_SITE || new URL(request.url).origin !== STAGING_ORIGIN) {
    return error(404, 'Genre learning is only available on staging.');
  }
  if (request.method !== 'POST') return error(405, 'Use POST.');
  if (request.headers.get('origin') !== STAGING_ORIGIN) return error(403, 'Open MUMOO Staging.');
  if (!validAccess(request.headers.get('x-mumoo-brain-access') ?? '', process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return error(401, 'Staging access is invalid or expired.');
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return error(415, 'Expected JSON.');
  if (Number(request.headers.get('content-length') || 0) > LIMIT) return error(413, 'Request too large.');
  const data = await request.json().catch(() => null);
  // Only a creator's own pick comes from the browser for now; suggestions confirmed or corrected come later.
  if (data?.version !== 1 || !CALL_ID.test(data.id ?? '') || !validLabel(data.label) || data.label.source !== 'creator') {
    return error(400, 'Invalid request.');
  }
  const bridgeSecret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  if (bridgeSecret.length < 32) return error(503, 'Genre learning is not configured.');

  let response;
  try {
    response = await fetch(`${MODAL_STATUS}?id=${encodeURIComponent(data.id)}`, {
      redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${bridgeSecret}` },
    });
  } catch {
    return error(504, 'The sound print worker did not respond in time.');
  }
  if (response.status === 202) return Response.json({ status: 'running' }, { status: 202, headers });
  if (response.status === 410) return error(410, 'This print expired.');
  if (!response.ok) return error(502, 'The sound print job failed.');
  const result = await response.json().catch(() => null);
  if (result?.version === 1 && result.status === 'unavailable') return Response.json({ status: 'skipped' }, { headers });
  if (!validPrint(result)) return error(502, 'The sound print worker returned an invalid result.');
  await storePrint(data.label, result);
  return Response.json({ status: 'stored' }, { headers });
}

export const config = { rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip'] } };
