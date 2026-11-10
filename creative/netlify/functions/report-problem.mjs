import { personFrom } from '../lib/person.mjs';
import { PROBLEM_KINDS, recordProblem } from '../lib/problems.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * POST /api/report-problem  JSON {kind: render|download|sign_in, message, email?}
 * The app tells us when a render, a download or a sign-in failed, so the admin can see it. Nobody needs to be signed in
 * (a failed sign-in has no person yet): when someone is, they are named from their token; an email typed into a failed
 * sign-in is kept as typed and unchecked. Small, rate limited, and it answers the same whatever happens to the note.
 */
export default async function handler(request) {
  if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (!process.env.DATABASE_URL) return reply(503, { error: 'Unavailable.' });
  if (Number(request.headers.get('content-length') || 0) > 2048) return reply(413, { error: 'Request too large.' });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !PROBLEM_KINDS.includes(body.kind) || typeof body.message !== 'string') return reply(400, { error: 'Say what failed.' });
  const person = process.env.NEON_AUTH_JWKS_URL && process.env.NEON_AUTH_BASE_URL ? await personFrom(request) : null;
  await recordProblem({ kind: body.kind, userId: person?.id ?? null, email: person?.email ?? body.email, message: body.message });
  return reply(202, { ok: true });
}

export const config = { path: '/api/report-problem', rateLimit: { windowSize: 60, windowLimit: 20, aggregateBy: ['ip'] } };
