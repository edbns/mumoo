import { QUOTA_BYTES, usedBytes } from '../../lib/allowance.mjs';
import { deleteAccount } from '../../lib/delete-account.mjs';
import { personFrom, recordPerson } from '../../lib/person.mjs';
import { allowanceOf } from '../../lib/credits.mjs';
import { welcomeOnce } from '../../lib/invites.mjs';
import { sendMail } from '../../lib/mail.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * GET /api/account — who is signed in, how much of their storage is used and their credits (one makes one video). Also records that they were here (powers history and reminders).
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
      return reply(500, { error: 'Couldn’t fully delete your account. Try again in a moment.' });
    }
  }
  const row = await recordPerson(person);
  if (!row) return reply(401, { error: 'Sign in to continue.' });
  await welcomeOnce(person.id, sendMail, new URL(request.url).origin);
  return reply(200, {
    id: row.id, email: row.email, createdAt: row.created_at, lastSeenAt: row.last_seen_at,
    // Neon returns bigint as a string.
    memberNo: row.member_no === null || row.member_no === undefined ? null : Number(row.member_no),
    storage: { used: await usedBytes(person.id), quota: QUOTA_BYTES },
    // Credits (one makes one video), and whether the free first video is still to come.
    ...await allowanceOf(person.id),
  });
}

export const config = { path: '/api/account', rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip'] } };
