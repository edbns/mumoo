import { validAccess } from '../lib/access.mjs';
import { acceptableFile, arrived, HANDOFF_KINDS, handoffFromToken, newHandoff, phoneUploadUrl, removeHandoff, validHandoffId } from '../lib/handoff.mjs';
import { storageReady } from '../lib/storage.mjs';

const STAGING_ORIGIN = 'https://mumoo-staging.netlify.app';
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (status, data) => Response.json(data, { status, headers });

/**
 * Send the song, or the creatives' own picture, from a phone (see lib/handoff.mjs).
 *   POST ?kind=song|picture      computer: start one → {id, phoneUrl, expiresAt}
 *   POST ?step=phone  {token, type, bytes}  phone: → {putUrl} to send the file to
 *   GET  ?id=…                   computer: 202 while waiting, then {bytes, url}
 *   DELETE ?id=…                 computer: it has the song (or gave up), remove it
 * The computer's calls carry staging access; the phone's only its signed link.
 */
export default async function phoneHandoff(request) {
  if (process.env.SITE_ID !== STAGING_SITE || new URL(request.url).origin !== STAGING_ORIGIN) return reply(404, { error: 'Only available on staging.' });
  if (request.headers.get('origin') !== STAGING_ORIGIN && request.method !== 'GET') return reply(403, { error: 'Open MUMOO Staging to send from your phone.' });
  const key = process.env.MUMOO_BRAIN_TESTER_KEY;
  if (!storageReady() || typeof key !== 'string' || key.length < 32) return reply(503, { error: 'Sending from a phone is unavailable.' });
  const params = new URL(request.url).searchParams;

  if (request.method === 'POST' && params.get('step') === 'phone') {
    const { token, type, bytes } = await request.json().catch(() => ({}));
    const handoff = handoffFromToken(token, key);
    if (!handoff) return reply(410, { error: 'This link has expired. Make a new QR code on your computer.' });
    if (!acceptableFile(handoff.kind, type ?? '', bytes)) {
      return reply(415, { error: handoff.kind === 'song' ? 'Choose a song or a video under 200 MB.' : 'Choose a JPEG, PNG or WebP photo, an MP4, MOV or WebM video, or a GIF.' });
    }
    return reply(200, { putUrl: await phoneUploadUrl(handoff.id, handoff.expiry) });
  }

  if (!validAccess(request.headers.get('x-mumoo-brain-access') ?? '', key)) return reply(401, { error: 'Staging access is invalid or expired.' });
  try {
    if (request.method === 'POST') {
      const kind = params.get('kind') ?? 'song';
      if (!HANDOFF_KINDS.includes(kind)) return reply(400, { error: 'Say what the phone sends.' });
      const { id, expiry, token } = newHandoff(key, kind);
      return reply(201, { id, phoneUrl: `${STAGING_ORIGIN}/phone#${token}`, expiresAt: expiry * 1000 });
    }
    const id = params.get('id') ?? '';
    if (!validHandoffId(id)) return reply(400, { error: 'Invalid id.' });
    if (request.method === 'GET') {
      const file = await arrived(id);
      return file ? reply(200, file) : reply(202, { waiting: true });
    }
    if (request.method === 'DELETE') {
      await removeHandoff(id);
      return reply(200, { removed: true });
    }
  } catch (cause) {
    console.error('phone handoff:', cause);
    return reply(502, { error: 'Storage did not answer. Try again.' });
  }
  return reply(405, { error: 'Use GET, POST or DELETE.' });
}

export const config = { path: '/api/phone-handoff', rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip'] } };
