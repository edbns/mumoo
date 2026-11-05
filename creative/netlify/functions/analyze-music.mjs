import { validAccess } from './brain-gateway.mjs';
const STAGING_ORIGIN = 'https://mumoo-staging.netlify.app';
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const MODAL_ENDPOINT = 'https://edbns-mumoo-staging--mumoo-music-analysis-staging-analyze-clip.us-east.modal.run';
const WAV_SIZE = 480_044;
const headers = { 'Cache-Control': 'no-store' };

function error(status, message) {
  return Response.json({ error: message }, { status, headers });
}

export default async function analyzeMusic(request) {
  if (process.env.SITE_ID !== STAGING_SITE || new URL(request.url).origin !== STAGING_ORIGIN) {
    return error(404, 'Music analysis is only available on staging.');
  }
  if (request.method !== 'POST') return error(405, 'Use POST.');
  if (request.headers.get('origin') !== STAGING_ORIGIN) return error(403, 'Open MUMOO Staging to analyze a clip.');
  const access = request.headers.get('x-mumoo-analysis-access') ?? '';
  const stagingAccess = request.headers.get('x-mumoo-brain-access') ?? '';
  const bridgeSecret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  const legacy = /^\d{10}\.[a-f0-9]{64}$/.test(access);
  const bridged = validAccess(stagingAccess, process.env.MUMOO_BRAIN_TESTER_KEY);
  if (!legacy && !bridged) return error(401, 'Staging access is invalid or expired.');
  if (!legacy && bridgeSecret.length < 32) return error(503, 'Music analysis is not configured.');
  try {
    if (Number(request.headers.get('content-length')) > WAV_SIZE) return error(413, 'Send only the 15-second clip.');
    const body = await request.arrayBuffer();
    if (body.byteLength !== WAV_SIZE) return error(400, 'Expected exactly 15 seconds of PCM audio.');
    const response = await fetch(MODAL_ENDPOINT, {
      method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(54_000),
      headers: { 'Content-Type': 'audio/wav', ...(legacy ? { 'X-Mumoo-Analysis-Access': access } : { 'Authorization': `Bearer ${bridgeSecret}` }) },
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result) return Response.json(result, { headers });
    if ([400, 401, 413, 429].includes(response.status)) return error(response.status, result?.detail ?? 'Music analysis could not proceed.');
    return error(502, 'The music analysis worker could not process the clip.');
  } catch {
    return error(504, 'The music analysis worker did not respond in time.');
  }
}

export const config = { rateLimit: { windowSize: 60, windowLimit: 5, aggregateBy: ['ip'] } };
