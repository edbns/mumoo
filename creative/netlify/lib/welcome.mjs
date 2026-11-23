import { allowanceOf } from './credits.mjs';
import { welcome } from './letters.mjs';
import { sendMail } from './mail.mjs';
import { db } from './person.mjs';

/**
 * Welcomes a new account once, the first time it is seen, when its free video is still to come (an address that had its free
 * video on an earlier account is not welcomed again). A letter that does not go is not tried again.
 */
export async function welcomeOnce(userId, send = sendMail, siteUrl = process.env.URL) {
  const [row] = await db()`update app_users set welcomed_at = now() where id = ${userId} and welcomed_at is null returning email`;
  if (!row || !(await allowanceOf(userId)).freeVideo) return false;
  try {
    await send({ to: row.email, ...welcome(siteUrl), once: `welcome-${userId}` });
  } catch (cause) {
    console.error('welcome letter:', cause);
  }
  return true;
}
