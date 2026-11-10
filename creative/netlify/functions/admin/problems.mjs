import { adminFrom, reply, refuse } from '../../lib/admin.mjs';
import { listProblems, markSeen } from '../../lib/problems.mjs';

/**
 * What went wrong, for the admin only.
 *   GET                 the problems (unseen first) and how many are unseen
 *   PATCH ?id=…         marks one as seen;  PATCH ?all=1 marks every unseen one
 */
export default async function handler(request) {
  if (!['GET', 'PATCH'].includes(request.method)) return refuse(405, 'Use GET or PATCH.');
  const { refusal } = await adminFrom(request);
  if (refusal) return refusal;
  const params = new URL(request.url).searchParams;
  try {
    if (request.method === 'PATCH') {
      if (params.get('all') === '1') await markSeen();
      else {
        const id = Number(params.get('id'));
        if (!Number.isSafeInteger(id) || id < 1) return refuse(400, 'Invalid id.');
        await markSeen(id);
      }
    }
    return reply(200, await listProblems());
  } catch (cause) {
    console.error('admin problems:', cause);
    return refuse(500, 'That did not work. Try again in a moment.');
  }
}

export const config = { path: '/api/admin/problems', rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip'] } };
