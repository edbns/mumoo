import { confirmEmailChange, requestEmailChange } from '../lib/email-change.mjs';
import { personFrom } from '../lib/person.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * POST /api/account/email — change the signed-in person's email.
 * {newEmail} sends a code to the new address; {newEmail, code} confirms it and changes the email.
 */
export default async function handler(request) {
  if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !process.env.NEON_AUTH_BASE_URL) return reply(503, { error: 'Accounts are unavailable.' });
  const person = await personFrom(request);
  if (!person) return reply(401, { error: 'Sign in to continue.' });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return reply(400, { error: 'Check the email address and try again.' });
  try {
    const outcome = body.code === undefined
      ? await requestEmailChange(person, body.newEmail)
      : await confirmEmailChange(person, body.newEmail, body.code);
    return outcome.error ? reply(outcome.status, { error: outcome.error }) : reply(200, { email: outcome.email ?? null });
  } catch (cause) {
    console.error('account email:', cause);
    return reply(500, { error: 'That did not work. Try again in a moment.' });
  }
}

export const config = { path: '/api/account/email', rateLimit: { windowSize: 60, windowLimit: 10, aggregateBy: ['ip'] } };
