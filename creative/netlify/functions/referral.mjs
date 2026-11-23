import { inviteByEmail } from '../lib/invites.mjs';
import { personFrom, recordPerson } from '../lib/person.mjs';
import { claimReferral, codeFor, firstPackBonus, referralStats } from '../lib/referrals.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * GET /api/referral — the signed-in person's invite link and how it is going (friends joined, bought, rewards this month under the
 * cap, videos earned), and the videos their own friend's invite still adds to their first pack.
 * POST /api/referral with {code} — the person signed up with someone's link: they become that person's friend (`claimReferral`).
 * POST /api/referral with {invite} — emails the person's link to a friend's address (`inviteByEmail`).
 */
export default async function handler(request) {
  if (request.method !== 'GET' && request.method !== 'POST') return reply(405, { error: 'Use GET or POST.' });
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !process.env.NEON_AUTH_BASE_URL) return reply(503, { error: 'Accounts are unavailable.' });
  const person = await personFrom(request);
  if (!person) return reply(401, { error: 'Sign in to continue.' });
  if (!await recordPerson(person)) return reply(401, { error: 'Sign in to continue.' });

  const linkOf = code => `${new URL(request.url).origin}/?ref=${code}`;
  if (request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (typeof body?.invite === 'string') {
      const { status, error } = await inviteByEmail(person, body.invite, linkOf(await codeFor(person.id)));
      return reply(status, error ? { error } : { sent: true });
    }
    return reply(200, { result: await claimReferral(person.id, typeof body?.code === 'string' ? body.code.trim().toLowerCase() : '') });
  }
  const code = await codeFor(person.id);
  return reply(200, {
    code,
    link: linkOf(code),
    ...await referralStats(person.id),
    firstPackBonus: await firstPackBonus(person.id),
  });
}

export const config = { path: '/api/referral', rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ['ip'] } };
