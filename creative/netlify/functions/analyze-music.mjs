import { validAccess } from '../lib/access.mjs';
import { note } from '../lib/service-health.mjs';
import { clipMs, maxBytes } from '../lib/clip-wav.mjs';
import { siteOf, modal } from '../lib/sites.mjs';
const MODAL_ENDPOINT = () => modal('mumoo-music-analysis-staging-analyze-clip');
const RATE = 16_000;
const headers = { 'Cache-Control': 'no-store' };

function error(status, message) {
  return Response.json({ error: message }, { status, headers });
}

export default async function analyzeMusic(request, context) {
  const site = siteOf(request);
  if (!site) {
    return error(404, 'Not available here.');
  }
  if (request.method !== 'POST') return error(405, 'Use POST.');
  if (request.headers.get('origin') !== site.origin) return error(403, 'Open mumoo to analyze a clip.');
  const access = request.headers.get('x-mumoo-analysis-access') ?? '';
  const stagingAccess = request.headers.get('x-mumoo-brain-access') ?? '';
  const bridgeSecret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  const legacy = /^\d{10}\.[a-f0-9]{64}$/.test(access);
  const bridged = validAccess(stagingAccess, process.env.MUMOO_BRAIN_TESTER_KEY);
  if (!legacy && !bridged) return error(401, 'Access is invalid or expired.');
  if (!legacy && bridgeSecret.length < 32) return error(503, 'Music analysis is not configured.');
  let startedAt = 0;
  try {
    if (Number(request.headers.get('content-length')) > maxBytes(RATE)) return error(413, 'Send only the selected clip.');
    const body = await request.arrayBuffer();
    if (clipMs(body, RATE) === null) return error(400, 'Expected 10 to 15 seconds of PCM audio.');
    startedAt = Date.now();
    const response = await fetch(MODAL_ENDPOINT(), {
      method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(54_000),
      headers: { 'Content-Type': 'audio/wav', ...(request.headers.get('x-mumoo-music-features') === 'temporal-v1' ? { 'X-Mumoo-Music-Features': 'temporal-v1' } : {}), ...(legacy ? { 'X-Mumoo-Analysis-Access': access } : { 'Authorization': `Bearer ${bridgeSecret}` }) },
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result) { await note(context, 'analysis', true, startedAt); return Response.json(result, { headers }); }
    if ([400, 401, 413, 429].includes(response.status)) return error(response.status, result?.detail ?? 'Music analysis could not proceed.');
    await note(context, 'analysis', false, startedAt);
    return error(502, 'The music analysis worker could not process the clip.');
  } catch {
    if (startedAt) await note(context, 'analysis', false, startedAt);
    return error(504, 'The music analysis worker did not respond in time.');
  }
}
