import { QUOTA_BYTES, usedBytes } from '../../lib/allowance.mjs';
import { deleteAccount } from '../../lib/delete-account.mjs';
import { personFrom, recordPerson } from '../../lib/person.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * GET /api/account — who is signed in, how much of their storage is used and their credit in tokens. Also records that they were here (powers history and reminders).
 * DELETE /api/account with {email} — deletes the account completely (`deleteAccount`); the person types their email to confirm.
 */
export default async function handler(request) {
  if (request.method !== 'GET' && request.method !== 'DELETE') return reply(405, { error: 'Use GET or DELETE.' });
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !process.env.NEON_AUTH_BASE_URL) return reply(503, { error: 'Accounts are unavailable.' });
  const person = await personFrom(request);
  if (!person) return reply(401, { error: 'Sign in to continue.' });
  if (request.method === 'DELETE') {
    const body = await request.json().catch(() => null);
    if (typeof body?.email !== 'string' || body.email.trim().toLowerCase() !== person.email.toLowerCase()) {
      return reply(400, { error: 'Type your email exactly as it is shown to confirm.' });
    }
    try {
      await deleteAccount(person);
      return reply(200, { deleted: true });
    } catch (cause) {
      console.error('delete account:', cause);
      return reply(500, { error: 'Your account could not be deleted completely. Try again in a moment.' });
    }
  }
  const row = await recordPerson(person);
  if (!row) return reply(401, { error: 'Sign in to continue.' });
  return reply(200, {
    id: row.id, email: row.email, createdAt: row.created_at, lastSeenAt: row.last_seen_at,
    storage: { used: await usedBytes(person.id), quota: QUOTA_BYTES },
    // Payments are not connected yet, so nobody has credit; this is where the balance will come from.
    credit: { tokens: 0 },
  });
}

export const config = { path: '/api/account', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
