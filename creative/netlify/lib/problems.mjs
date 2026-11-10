import { db } from './person.mjs';

/** What can go wrong, as the app names it. */
export const PROBLEM_KINDS = ['render', 'download', 'sign_in'];
const KEEP_SEEN_DAYS = 60;

/** Writes one problem down. Never throws: a failed note must not make the original failure worse. */
export async function recordProblem({ kind, userId = null, email = null, message }) {
  if (!PROBLEM_KINDS.includes(kind)) return false;
  const text = typeof message === 'string' ? message.trim().slice(0, 300) : '';
  if (!text) return false;
  const address = typeof email === 'string' && email.trim() ? email.trim().slice(0, 200) : null;
  try {
    await db()`insert into problems (kind, user_id, email, message) values (${kind}, ${userId}, ${address}, ${text})`;
    return true;
  } catch (cause) {
    console.error('problems:', cause);
    return false;
  }
}

/** Unseen first, then the rest, newest first; problems seen more than two months ago are cleared away. */
export async function listProblems() {
  const sql = db();
  await sql`delete from problems where seen_at is not null and seen_at < now() - ${`${KEEP_SEEN_DAYS} days`}::interval`;
  const rows = await sql`select id, kind, user_id, email, message, created_at, seen_at from problems order by (seen_at is not null), created_at desc limit 300`;
  const [{ unseen }] = await sql`select count(*)::int as unseen from problems where seen_at is null`;
  return {
    unseen,
    problems: rows.map(row => ({ id: Number(row.id), kind: row.kind, userId: row.user_id, email: row.email, message: row.message, createdAt: row.created_at, seen: row.seen_at !== null })),
  };
}

/** Marks one problem (or, with no id, every unseen one) as seen. */
export async function markSeen(id) {
  const sql = db();
  if (id === undefined) await sql`update problems set seen_at = now() where seen_at is null`;
  else await sql`update problems set seen_at = now() where id = ${id} and seen_at is null`;
}
