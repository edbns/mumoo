import { validAccess } from './brain-gateway.mjs';

/**
 * Submit a cloud render job. Tiny request (≈960 KB WAV + JSON); returns a job id at once.
 * The Modal worker fetches the finished plate itself — the browser never uploads images.
 */
const STAGING_ORIGIN = 'https://mumoo-staging.netlify.app';
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const MODAL_SUBMIT =
  'https://edbns-mumoo-staging--mumoo-creatives-encode-staging-submit.us-east.modal.run';
const BODY_LIMIT = 2_000_000;
const headers = { 'Cache-Control': 'no-store' };

function error(status, message) {
  return Response.json({ error: message }, { status, headers });
}

export default async function encodeCreative(request) {
  if (process.env.SITE_ID !== STAGING_SITE || new URL(request.url).origin !== STAGING_ORIGIN) {
    return error(404, 'Cloud render is only available on staging.');
  }
  if (request.method !== 'POST') return error(405, 'Use POST.');
  if (request.headers.get('origin') !== STAGING_ORIGIN) {
    return error(403, 'Open MUMOO Staging to render a creative.');
  }
  const stagingAccess = request.headers.get('x-mumoo-brain-access') ?? '';
  const bridgeSecret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  if (!validAccess(stagingAccess, process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return error(401, 'Staging access is invalid or expired.');
  }
  if (bridgeSecret.length < 32) return error(503, 'Cloud render is not configured.');

  try {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > BODY_LIMIT) return error(413, 'Render request is too large.');

    const incoming = await request.formData();
    const audio = incoming.get('audio');
    const meta = incoming.get('meta');
    if (!(audio instanceof Blob) || typeof meta !== 'string' || meta.length > 400_000) {
      return error(400, 'Expected audio and meta form fields.');
    }
    if (audio.size < 1000) return error(400, 'Audio file is too small.');

    const outbound = new FormData();
    outbound.append('audio', audio, 'clip.wav');
    outbound.append('meta', meta);

    const response = await fetch(MODAL_SUBMIT, {
      method: 'POST',
      body: outbound,
      redirect: 'error',
      signal: AbortSignal.timeout(25_000),
      headers: { Authorization: `Bearer ${bridgeSecret}` },
    });
    const result = await response.json().catch(() => null);
    if (response.ok && typeof result?.id === 'string') {
      return Response.json({ id: result.id }, { status: 202, headers });
    }
    const detail = result?.detail ?? result?.error;
    if ([400, 401, 413, 429].includes(response.status)) {
      return error(response.status, typeof detail === 'string' ? detail : 'Cloud render could not start.');
    }
    return error(502, 'The cloud render worker could not accept this creative.');
  } catch {
    return error(504, 'The cloud render worker did not respond in time.');
  }
}

export const config = { rateLimit: { windowSize: 60, windowLimit: 12, aggregateBy: ['ip'] } };
