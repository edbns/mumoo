import { adminFrom, reply, refuse } from '../lib/admin.mjs';
import { closeThread, listThreads, SupportRefusal, teamReply, threadFor } from '../lib/support.mjs';

/**
 * The help chat inbox, for the admin only.
 *   GET                    every conversation, waiting ones first
 *   GET ?user=…            one conversation in full
 *   POST ?user=… {reply}   the team's reply: shown in the person's chat and emailed to them
 *   PATCH ?user=…          done: the helper answers this person again
 */
export default async function handler(request) {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return refuse(405, 'Use GET, POST or PATCH.');
  const { refusal } = await adminFrom(request);
  if (refusal) return refusal;
  const user = new URL(request.url).searchParams.get('user');
  if (user !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(user)) return refuse(400, 'Invalid conversation.');
  try {
    if (request.method === 'GET') {
      if (user === null) return reply(200, await listThreads());
      const found = await threadFor(user);
      return found ? reply(200, found) : refuse(404, 'No such conversation.');
    }
    if (user === null) return refuse(400, 'Say which conversation.');
    if (request.method === 'PATCH') return reply(200, await closeThread(user));
    const body = await request.json().catch(() => null);
    return reply(200, await teamReply(user, body?.reply));
  } catch (cause) {
    if (cause instanceof SupportRefusal) return refuse(cause.status, cause.message);
    console.error('admin support:', cause);
    return refuse(500, 'That did not work. Try again in a moment.');
  }
}

export const config = { path: '/api/admin/support', rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip'] } };
