import { sweep } from '../lib/inactivity.mjs';
import { sendMail } from '../lib/mail.mjs';
import { storageReady } from '../lib/storage.mjs';

/** Runs once a day: reminds people who have not visited, and clears the files of those who have not for 90 days. */
export default async function inactivity() {
  if (!process.env.DATABASE_URL || !storageReady()) return;
  const result = await sweep({ send: sendMail, siteUrl: process.env.URL });
  console.log(`inactivity: ${result.sent.length} reminded, ${result.deleted.length} cleared`);
}

export const config = { schedule: '@daily' };
