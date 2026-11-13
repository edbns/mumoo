import { validAccess } from '../lib/access.mjs';
import { countUnknown } from '../lib/style-prints.mjs';

/**
 * Genre learning, step one: start the sound print of the selected 15 seconds (mono 48 kHz WAV, ~1.4 MB) and return
 * its job id at once; style-print-status keeps it with the style once it is ready.
 * A JSON body { version: 1, unknown: true } instead counts one "I don't know", with nothing about the song.
 */
const STAGING_ORIGIN = 'https://mumoo-staging.netlify.app';
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const MODAL_SUBMIT = 'https://edbns-mumoo-staging--mumoo-sound-print-staging-submit.us-east.modal.run';
const WAV_SIZE = 44 + 15 * 48_000 * 2;
const headers = { 'Cache-Control': 'no-store' };
const error = (status, message) => Response.json({ error: message }, { status, headers });

export default async function stylePrint(request) {
  if (process.env.SITE_ID !== STAGING_SITE || new URL(request.url).origin !== STAGING_ORIGIN) {
    return error(404, 'Genre learning is only available on staging.');
  }
  if (request.method !== 'POST') return error(405, 'Use POST.');
  if (request.headers.get('origin') !== STAGING_ORIGIN) return error(403, 'Open MUMOO Staging.');
  if (!validAccess(request.headers.get('x-mumoo-brain-access') ?? '', process.env.MUMOO_BRAIN_TESTER_KEY)) {
    return error(401, 'Staging access is invalid or expired.');
  }
  const type = request.headers.get('content-type') || '';
  if (Number(request.headers.get('content-length') || 0) > WAV_SIZE) return error(413, 'The clip is too large.');

  if (/^application\/json(?:\s*;|$)/i.test(type)) {
    const data = await request.json().catch(() => null);
    if (data?.version !== 1 || data.unknown !== true) return error(400, 'Invalid request.');
    await countUnknown();
    return new Response(null, { status: 204, headers });
  }

  if (!/^audio\/wav(?:\s*;|$)/i.test(type)) return error(415, 'Expected a WAV clip.');
  const bridgeSecret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  if (bridgeSecret.length < 32) return error(503, 'Genre learning is not configured.');
  const audio = await request.arrayBuffer();
  if (audio.byteLength !== WAV_SIZE) return error(400, 'Expected exactly 15 seconds of mono 48 kHz WAV.');
  try {
    const response = await fetch(MODAL_SUBMIT, {
      method: 'POST', body: audio, redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${bridgeSecret}`, 'Content-Type': 'audio/wav' },
    });
    const result = await response.json().catch(() => null);
    if (response.ok && typeof result?.id === 'string') return Response.json({ id: result.id }, { status: 202, headers });
    if ([400, 413].includes(response.status)) return error(response.status, 'The sound print worker could not take this clip.');
    return error(502, 'The sound print worker could not take this clip.');
  } catch {
    return error(504, 'The sound print worker did not respond in time.');
  }
}

export const config = { rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ['ip'] } };
