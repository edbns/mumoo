import { db } from './person.mjs';
import { deleteObject, listKeys, storageReady } from './storage.mjs';

/**
 * Deletes a person's account completely: every file of theirs in storage (their creatives and pictures, and anything an unfinished
 * upload left behind), their rows (account, history, pictures, a pending email change), the error reports that name them, and
 * their sign-in at Neon (with its sessions and the Google login linked to it). What they did with the creatives stays only as
 * codes nobody can trace back (`brain_feedback` forgets whose it was), so the brain keeps learning.
 * Files go first and the sign-in last: if anything fails part way, the person can still sign in and try again.
 */
export async function deleteAccount(person) {
  const sql = db();
  if (storageReady()) {
    for (const prefix of [`uploads/${person.id}/`, `renders/${person.id}/`]) {
      for (const key of await listKeys(prefix)) await deleteObject(key);
    }
  }
  await sql`delete from app_users where id = ${person.id}`;
  await sql`delete from problems where user_id = ${person.id} or lower(email) = ${person.email.toLowerCase()}`;
  await sql`delete from neon_auth."user" where id::text = ${person.id}`;
}
