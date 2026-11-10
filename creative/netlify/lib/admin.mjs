import { db, personFrom } from './person.mjs';

/** The emails allowed into the admin, from ADMIN_EMAILS (comma separated). Empty means nobody. */
export const adminEmails = () => (process.env.ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);

/**
 * The signed-in admin, or a ready answer to send instead: `{ admin }` or `{ refusal: Response }`.
 * Signed out is 401. Anyone else gets the same 403, whoever they are. The email must be on the list AND
 * confirmed by Neon Auth (its code was entered), so nobody can get in by signing up with an admin's address.
 */
export async function adminFrom(request) {
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_JWKS_URL || !process.env.NEON_AUTH_BASE_URL || adminEmails().length === 0) {
    return { refusal: refuse(503, 'The admin is unavailable.') };
  }
  const person = await personFrom(request);
  if (!person) return { refusal: refuse(401, 'Sign in to continue.') };
  const email = person.email.trim().toLowerCase();
  if (!adminEmails().includes(email)) return { refusal: refuse(403, 'This account does not have access.') };
  const [row] = await db()`select "emailVerified" as verified from neon_auth."user" where id::text = ${person.id}`;
  if (!row?.verified) return { refusal: refuse(403, 'This account does not have access.') };
  return { admin: { id: person.id, email } };
}

export const refuse = (status, error) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
