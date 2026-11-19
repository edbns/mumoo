import { purgeCache } from '@netlify/functions';
import { personFrom, recordPerson } from '../lib/person.mjs';
import { cleanTracking, deleteLink, linksOf, publishLink, saveTracking, updateLink } from '../lib/smart-links.mjs';
import { cacheTag } from '../lib/fan-page.mjs';
import { seal } from '../lib/secret-box.mjs';

/** Fans see the change at once: the cached page (or a cached "not found" from before it was published) is dropped. */
async function forgetFanPage(slug) {
  try {
    await purgeCache({ tags: [cacheTag(slug)] });
  } catch (cause) {
    if (process.env.NETLIFY) console.error('fan page purge:', cause);
  }
}

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * The signed-in person's smart links (`smart-links.mjs`).
 * GET lists them; POST {slug, link, tracking?} publishes a new one; PUT {slug, link, tracking?} changes one of theirs; DELETE ?slug=
 * deletes it. `tracking` is the link's ad accounts (`cleanTracking`; tokens are encrypted and never sent back).
 */
export default async function handler(request) {
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) return reply(405, { error: 'Use GET, POST, PUT or DELETE.' });
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !process.env.NEON_AUTH_BASE_URL) return reply(503, { error: 'Smart links are unavailable.' });
  const person = await personFrom(request);
  if (!person) return reply(401, { error: 'Sign in to publish your link.' });
  try {
    if (!(await recordPerson(person))) return reply(401, { error: 'Sign in to publish your link.' });
    if (request.method === 'GET') return reply(200, { links: await linksOf(person.id) });
    if (request.method === 'DELETE') {
      const slug = new URL(request.url).searchParams.get('slug') ?? '';
      if (!(await deleteLink(person.id, slug))) return reply(404, { error: 'That link isn’t yours or was already deleted.' });
      await forgetFanPage(slug);
      return reply(200, { deleted: slug });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body.slug !== 'string') return reply(400, { error: 'Choose your link’s name.' });
    const tracking = body.tracking === undefined ? null : await cleanTracking(body.tracking, seal);
    if (tracking?.error) return reply(tracking.status, { error: tracking.error });
    const outcome = request.method === 'POST'
      ? await publishLink(person.id, body.slug, body.link)
      : await updateLink(person.id, body.slug, body.link);
    if (outcome.error) return reply(outcome.status, { error: outcome.error });
    await forgetFanPage(body.slug);
    return reply(200, { link: tracking ? { ...outcome.link, tracking: await saveTracking(person.id, body.slug, tracking) } : outcome.link });
  } catch (cause) {
    console.error('links:', cause);
    return reply(500, { error: 'That didn’t work. Try again in a moment.' });
  }
}

export const config = { path: '/api/links', rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ['ip'] } };
