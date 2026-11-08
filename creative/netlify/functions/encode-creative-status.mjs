import { validAccess } from '../lib/access.mjs';

/** Poll a cloud render job: 202 while running, 200 + MP4 when done. */
const STAGING_ORIGIN = 'https://mumoo-staging.netlify.app';
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const MODAL_STATUS =
  'https://edbns-mumoo-staging--mumoo-creatives-encode-staging-status.us-east.modal.run';
const headers = { 'Cache-Control': 'no-store' };
const CALL_ID = /^fc-[A-Za-z0-9]{8,48}$/;

function error(status, message) {
  return Response.json({ error: message }, { status, headers });
}

export default async function encodeCreativeStatus(request) {
  const url = new URL(request.url);
  if (process.env.SITE_ID !== STAGING_SITE || url.origin !== STAGING_ORIGIN) {
    return error(404, 'Cloud render is only available on staging.');
  }
  if (request.method !== 'GET') return error(405, 'Use GET.');
  const stagingAccess = request.headers.get('x-mumoo-brain-access') ?? '';
  const bridgeSecret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  if (!validAccess(stagingAccess, process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return error(401, 'Staging access is invalid or expired.');
  }
  if (bridgeSecret.length < 32) return error(503, 'Cloud render is not configured.');
  const id = url.searchParams.get('id') ?? '';
  if (!CALL_ID.test(id)) return error(400, 'Invalid job id.');

  try {
    const response = await fetch(`${MODAL_STATUS}?id=${encodeURIComponent(id)}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${bridgeSecret}` },
    });
    if (response.status === 202) return Response.json({ status: 'running' }, { status: 202, headers });
    if (response.ok) {
      const mp4 = await response.arrayBuffer();
      if (mp4.byteLength < 1000) return error(502, 'Cloud render returned an empty file.');
      return new Response(mp4, {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'video/mp4',
          'Content-Disposition': 'attachment; filename="mumoo-creative.mp4"',
        },
      });
    }
    const result = await response.json().catch(() => null);
    const detail = result?.detail ?? result?.error;
    if ([400, 401, 410].includes(response.status)) {
      return error(response.status, typeof detail === 'string' ? detail : 'Cloud render could not proceed.');
    }
    return error(502, 'The cloud render failed. Try again.');
  } catch {
    return error(504, 'The cloud render worker did not respond in time.');
  }
}

export const config = { rateLimit: { windowSize: 60, windowLimit: 240, aggregateBy: ['ip'] } };
