import { sweep } from '../lib/inactivity.mjs';
import { sendMail } from '../lib/mail.mjs';
import { warnFullStorage } from '../lib/storage-warning.mjs';
import { storageReady } from '../lib/storage.mjs';

/**
 * Runs once a day: reminds people who have not visited, clears the files of those who have not for 90 days, and tells anyone
 * whose storage is almost full to download and delete.
 */
export default async function inactivity() {
  if (!process.env.DATABASE_URL || !storageReady()) return;
  const result = await sweep({ send: sendMail, siteUrl: process.env.URL });
  const warned = await warnFullStorage({ send: sendMail, siteUrl: process.env.URL });
  console.log(`inactivity: ${result.sent.length} reminded, ${result.deleted.length} cleared, ${warned.length} told their storage is almost full`);
}

export const config = { schedule: '@daily' };
