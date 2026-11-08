import { validAccess } from '../lib/access.mjs';

/**
 * Start a lyrics job (transcribe + time words, any language). Tiny request: a 15 s mono 16 kHz WAV
 * (~480 KB) plus a small JSON with optional lyric tokens and language. Returns a job id at once.
 */
const STAGING_ORIGIN = 'https://mumoo-staging.netlify.app';
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const MODAL_SUBMIT =
  'https://edbns-mumoo-staging--mumoo-lyrics-v2-staging-submit.us-east.modal.run';
const BODY_LIMIT = 700_000;
const META_LIMIT = 60_000;
const headers = { 'Cache-Control': 'no-store' };

function error(status, message) {
  return Response.json({ error: message }, { status, headers });
}

export default async function transcribeLyrics(request) {
  if (process.env.SITE_ID !== STAGING_SITE || new URL(request.url).origin !== STAGING_ORIGIN) {
    return error(404, 'Lyrics are only available on staging.');
  }
  if (request.method !== 'POST') return error(405, 'Use POST.');
  if (request.headers.get('origin') !== STAGING_ORIGIN) return error(403, 'Open MUMOO Staging to find lyrics.');
  if (!validAccess(request.headers.get('x-mumoo-brain-access') ?? '', process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return error(401, 'Staging access is invalid or expired.');
  }
  const bridgeSecret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  if (bridgeSecret.length < 32) return error(503, 'Lyrics are not configured.');

  try {
    if (Number(request.headers.get('content-length') || 0) > BODY_LIMIT) return error(413, 'The clip is too large.');
    const incoming = await request.formData();
    const audio = incoming.get('audio');
    const meta = incoming.get('meta');
    if (!(audio instanceof Blob) || typeof meta !== 'string' || meta.length > META_LIMIT) {
      return error(400, 'Expected audio and meta form fields.');
    }
    if (audio.size < 1000 || audio.size > BODY_LIMIT) return error(400, 'The audio clip has the wrong size.');

    const outbound = new FormData();
    outbound.append('audio', audio, 'clip.wav');
    outbound.append('meta', meta);
    const response = await fetch(MODAL_SUBMIT, {
      method: 'POST', body: outbound, redirect: 'error', signal: AbortSignal.timeout(25_000),
      headers: { Authorization: `Bearer ${bridgeSecret}` },
    });
    const result = await response.json().catch(() => null);
    if (response.ok && typeof result?.id === 'string') return Response.json({ id: result.id }, { status: 202, headers });
    const detail = result?.detail ?? result?.error;
    if ([400, 401, 413, 429].includes(response.status)) {
      return error(response.status, typeof detail === 'string' ? detail : 'Lyrics could not start.');
    }
    return error(502, 'The lyrics worker could not accept this clip.');
  } catch {
    return error(504, 'The lyrics worker did not respond in time.');
  }
}
