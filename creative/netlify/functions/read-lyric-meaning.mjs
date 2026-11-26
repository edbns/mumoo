import { validAccess } from '../lib/access.mjs';
import { note } from '../lib/service-health.mjs';
import { siteOf, modal } from '../lib/sites.mjs';

/**
 * Start a lyric-meaning job. The lyrics go only to our own model on Modal, which keeps them in memory for the
 * length of the request. Returns a job id at once; the status function hands back a few codes, never the words.
 */
const MODAL_SUBMIT = () => modal('mumoo-lyric-meaning-staging-submit');
const BODY_LIMIT = 40_000;
const headers = { 'Cache-Control': 'no-store' };

function error(status, message) {
  return Response.json({ error: message }, { status, headers });
}

export default async function readLyricMeaning(request, context) {
  const site = siteOf(request);
  if (!site) {
    return error(404, 'Not available here.');
  }
  if (request.method !== 'POST') return error(405, 'Use POST.');
  if (request.headers.get('origin') !== site.origin) return error(403, 'Open mumoo to read lyrics.');
  if (!validAccess(request.headers.get('x-mumoo-brain-access') ?? '', process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return error(401, 'Access is invalid or expired.');
  }
  const bridgeSecret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  if (bridgeSecret.length < 32) return error(503, 'Lyric meaning is not configured.');

  let startedAt = 0;
  try {
    if (Number(request.headers.get('content-length') || 0) > BODY_LIMIT) return error(413, 'The lyrics are too long.');
    const body = await request.text();
    if (!body || body.length > BODY_LIMIT) return error(400, 'Expected the lyric lines.');
    startedAt = Date.now();
    const response = await fetch(MODAL_SUBMIT(), {
      method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(25_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bridgeSecret}` },
    });
    const result = await response.json().catch(() => null);
    if (response.ok && typeof result?.id === 'string') { await note(context, 'meaning', true, startedAt); return Response.json({ id: result.id }, { status: 202, headers }); }
    const detail = result?.detail ?? result?.error;
    if ([400, 401, 413].includes(response.status)) {
      return error(response.status, typeof detail === 'string' ? detail : 'Lyric reading couldn’t start.');
    }
    await note(context, 'meaning', false, startedAt);
    return error(502, 'The lyric reading worker could not accept these lyrics.');
  } catch {
    if (startedAt) await note(context, 'meaning', false, startedAt);
    return error(504, 'The lyric reading worker did not respond in time.');
  }
}
