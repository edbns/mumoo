import { adminFrom, reply, refuse } from '../../lib/admin.mjs';
import { db } from '../../lib/person.mjs';

/**
 * GET /api/admin/overview: who is signed in and the few numbers for the first page. This is also how the page learns whether
 * the person may be there. Money and referral figures join it once payments exist.
 */
export default async function handler(request) {
  if (request.method !== 'GET') return refuse(405, 'Use GET.');
  const { admin, refusal } = await adminFrom(request);
  if (refusal) return refusal;
  try {
    const [counts] = await db()`
      select
        (select count(*)::int from library_items where arrived and status = 'approved') as approved,
        (select count(*)::int from library_items where arrived and status = 'pending') as pending,
        (select count(*)::int from library_items where arrived and status = 'hidden') as hidden,
        (select count(*)::int from problems where seen_at is null) as unseen_problems,
        (select count(*)::int from app_users) as people`;
    return reply(200, {
      email: admin.email,
      library: { approved: counts.approved, pending: counts.pending, hidden: counts.hidden },
      problems: { unseen: counts.unseen_problems },
      people: counts.people,
    });
  } catch (cause) {
    console.error('admin overview:', cause);
    return refuse(500, 'That did not work. Try again in a moment.');
  }
}

export const config = { path: '/api/admin/overview', rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip'] } };
