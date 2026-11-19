import { personFrom, recordPerson } from '../lib/person.mjs';
import { ask, askForTeam, conversation, MAX_MESSAGE_CHARS, SupportRefusal } from '../lib/support.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * The help chat, for signed-in people only (`netlify/lib/support.mjs`).
 *   GET                          the conversation (and the helper's answer once our model has chosen it)
 *   POST {message}               a question; the helper answers with one of MUMOO's written replies
 *   POST {team: true}            pass the conversation to the team
 */
export default async function handler(request) {
  if (request.method !== 'GET' && request.method !== 'POST') return reply(405, { error: 'Use GET or POST.' });
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !process.env.NEON_AUTH_BASE_URL) return reply(503, { error: 'Help is unavailable right now.' });
  if (Number(request.headers.get('content-length') || 0) > MAX_MESSAGE_CHARS * 4 + 200) return reply(413, { error: 'That message is too long.' });
  const person = await personFrom(request);
  if (!person) return reply(401, { error: 'Sign in to chat with us.' });
  if (!await recordPerson(person)) return reply(401, { error: 'Sign in to chat with us.' });
  try {
    if (request.method === 'GET') return reply(200, await conversation(person.id));
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return reply(400, { error: 'Type a message first.' });
    if (body.team === true) return reply(200, await askForTeam(person));
    return reply(200, await ask(person, body.message));
  } catch (cause) {
    if (cause instanceof SupportRefusal) return reply(cause.status, { error: cause.message });
    console.error('support:', cause);
    return reply(500, { error: 'Help is having a moment. Try again in a bit.' });
  }
}

export const config = { path: '/api/support', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
