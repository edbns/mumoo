import { createHash, timingSafeEqual } from 'node:crypto';

const STAGING_ORIGIN = 'https://mumoo-staging.netlify.app';
const STAGING_SITE = '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5';
const BODY_LIMIT = 680_000;

function reply(status, error) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export default async function alignLyrics(request) {
  if (process.env.SITE_ID !== STAGING_SITE || new URL(request.url).origin !== STAGING_ORIGIN) {
    return reply(404, 'Lyric analysis is available only in staging.');
  }
  if (request.method !== 'POST') return reply(405, 'Use POST.');
  if (request.headers.get('origin') !== STAGING_ORIGIN) return reply(403, 'Open MUMOO Staging to sync lyrics.');
  const accessCode = process.env.MUMOO_STAGING_ACCESS_CODE;
  if (!accessCode) return reply(503, 'Staging lyric sync is temporarily unavailable.');
  const hash = value => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(hash(request.headers.get('x-mumoo-tester') ?? ''), hash(accessCode))) {
    return reply(401, 'Enter the staging tester code.');
  }
  const { MUMOO_MODAL_ENDPOINT, MUMOO_MODAL_PROXY_KEY, MUMOO_MODAL_PROXY_SECRET } = process.env;
  if (!MUMOO_MODAL_ENDPOINT || !MUMOO_MODAL_PROXY_KEY || !MUMOO_MODAL_PROXY_SECRET) {
    return reply(503, 'Staging lyric sync is temporarily unavailable.');
  }
  try {
    const endpoint = new URL(MUMOO_MODAL_ENDPOINT);
    if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.modal.run')) {
      return reply(503, 'Staging lyric sync is temporarily unavailable.');
    }
    if (Number(request.headers.get('content-length')) > BODY_LIMIT) return reply(413, 'Clip payload is too large.');
    const body = await request.arrayBuffer();
    if (body.byteLength > BODY_LIMIT) return reply(413, 'Clip payload is too large.');
    const response = await fetch(endpoint, {
      method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(52_000),
      headers: {
        'Content-Type': 'application/json',
        'Modal-Key': MUMOO_MODAL_PROXY_KEY,
        'Modal-Secret': MUMOO_MODAL_PROXY_SECRET,
      },
    });
    if (response.status === 429) return reply(429, 'Staging sync limit reached. Wait a minute and try again.');
    if (!response.ok) return reply(502, 'The alignment worker could not process this clip.');
    return Response.json(await response.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return reply(502, 'The alignment worker did not respond. Try again in a moment.');
  }
}

export const config = { rateLimit: { windowSize: 60, windowLimit: 4, aggregateBy: ['ip'] } };
