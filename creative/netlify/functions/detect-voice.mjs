import { validAccess } from '../lib/access.mjs';

/**
 * Start a singer-voice job: who sings (female, male or both) in the selected 15 seconds. The request is only the
 * 15 s mono 16 kHz WAV (~480 KB), the same clip the lyrics worker takes. Returns a job id at once.
 */
const STAGING_ORIGIN = 'https://mumoo-staging.netlify.app';
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const MODAL_SUBMIT =
  'https://edbns-mumoo-staging--mumoo-voice-staging-submit.us-east.modal.run';
const BODY_LIMIT = 700_000;
const headers = { 'Cache-Control': 'no-store' };

function error(status, message) {
  return Response.json({ error: message }, { status, headers });
}

export default async function detectVoice(request) {
  if (process.env.SITE_ID !== STAGING_SITE || new URL(request.url).origin !== STAGING_ORIGIN) {
    return error(404, 'Voice detection is only available on staging.');
  }
  if (request.method !== 'POST') return error(405, 'Use POST.');
  if (request.headers.get('origin') !== STAGING_ORIGIN) return error(403, 'Open MUMOO Staging to read the voice.');
  if (!validAccess(request.headers.get('x-mumoo-brain-access') ?? '', process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return error(401, 'Staging access is invalid or expired.');
  }
  const bridgeSecret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  if (bridgeSecret.length < 32) return error(503, 'Voice detection is not configured.');

  try {
    if (Number(request.headers.get('content-length') || 0) > BODY_LIMIT) return error(413, 'The clip is too large.');
    const incoming = await request.formData();
    const audio = incoming.get('audio');
    if (!(audio instanceof Blob)) return error(400, 'Expected an audio form field.');
    if (audio.size < 1000 || audio.size > BODY_LIMIT) return error(400, 'The audio clip has the wrong size.');

    const outbound = new FormData();
    outbound.append('audio', audio, 'clip.wav');
    const response = await fetch(MODAL_SUBMIT, {
      method: 'POST', body: outbound, redirect: 'error', signal: AbortSignal.timeout(25_000),
      headers: { Authorization: `Bearer ${bridgeSecret}` },
    });
    const result = await response.json().catch(() => null);
    if (response.ok && typeof result?.id === 'string') return Response.json({ id: result.id }, { status: 202, headers });
    const detail = result?.detail ?? result?.error;
    if ([400, 401, 413, 429].includes(response.status)) {
      return error(response.status, typeof detail === 'string' ? detail : 'Voice detection could not start.');
    }
    return error(502, 'The voice worker could not accept this clip.');
  } catch {
    return error(504, 'The voice worker did not respond in time.');
  }
}
