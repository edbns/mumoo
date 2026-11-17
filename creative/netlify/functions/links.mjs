import { personFrom, recordPerson } from '../lib/person.mjs';
import { deleteLink, linksOf, publishLink, updateLink } from '../lib/smart-links.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * The signed-in person's smart links (`smart-links.mjs`).
 * GET lists them; POST {slug, link} publishes a new one; PUT {slug, link} changes one of theirs; DELETE ?slug= deletes it.
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
      return (await deleteLink(person.id, slug)) ? reply(200, { deleted: slug }) : reply(404, { error: 'That link is not yours, or it was already deleted.' });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body.slug !== 'string') return reply(400, { error: 'Choose your link’s name.' });
    const outcome = request.method === 'POST'
      ? await publishLink(person.id, body.slug, body.link)
      : await updateLink(person.id, body.slug, body.link);
    return outcome.error ? reply(outcome.status, { error: outcome.error }) : reply(200, { link: outcome.link });
  } catch (cause) {
    console.error('links:', cause);
    return reply(500, { error: 'That did not work. Try again in a moment.' });
  }
}

export const config = { path: '/api/links', rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ['ip'] } };
