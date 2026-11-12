import { validAccess } from '../lib/access.mjs';

/** Poll a lyric-meaning job: 202 while running, 200 + a few codes when done. */
const STAGING_ORIGIN = 'https://mumoo-staging.netlify.app';
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const MODAL_STATUS = 'https://edbns-mumoo-staging--mumoo-lyric-meaning-staging-status.us-east.modal.run';
const headers = { 'Cache-Control': 'no-store' };
const CALL_ID = /^fc-[A-Za-z0-9]{8,48}$/;

function error(status, message) {
  return Response.json({ error: message }, { status, headers });
}

export default async function readLyricMeaningStatus(request) {
  const url = new URL(request.url);
  if (process.env.SITE_ID !== STAGING_SITE || url.origin !== STAGING_ORIGIN) {
    return error(404, 'Lyric meaning is only available on staging.');
  }
  if (request.method !== 'GET') return error(405, 'Use GET.');
  if (!validAccess(request.headers.get('x-mumoo-brain-access') ?? '', process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return error(401, 'Staging access is invalid or expired.');
  }
  const bridgeSecret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  if (bridgeSecret.length < 32) return error(503, 'Lyric meaning is not configured.');
  const id = url.searchParams.get('id') ?? '';
  if (!CALL_ID.test(id)) return error(400, 'Invalid job id.');

  try {
    const response = await fetch(`${MODAL_STATUS}?id=${encodeURIComponent(id)}`, {
      redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${bridgeSecret}` },
    });
    if (response.status === 202) return Response.json({ status: 'running' }, { status: 202, headers });
    if (response.ok) {
      const result = await response.json().catch(() => null);
      if (result?.version !== 1) return error(502, 'The lyric reading worker returned an invalid result.');
      // Only the codes leave this function; the one-line gist the model wrote to think with stays behind.
      const { version, clarity, attitude, sadness, intensity } = result;
      const codes = (list, most) => (Array.isArray(list) ? list.filter(code => typeof code === 'string' && /^[a-z]{2,16}$/.test(code)).slice(0, most) : []);
      return Response.json({ version, clarity, attitude, sadness, intensity, moods: codes(result.moods, 2), themes: codes(result.themes, 3) }, { headers });
    }
    const result = await response.json().catch(() => null);
    const detail = result?.detail ?? result?.error;
    if ([400, 401, 410].includes(response.status)) {
      return error(response.status, typeof detail === 'string' ? detail : 'The lyric reading could not proceed.');
    }
    return error(502, 'The lyric reading failed.');
  } catch {
    return error(504, 'The lyric reading worker did not respond in time.');
  }
}
