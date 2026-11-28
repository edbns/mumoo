import { thisSite } from './sites.mjs';

const KIND_TITLES = { render: 'Video failed', download: 'Download failed', sign_in: 'Sign-in problem' };
/** A problem that keeps happening sends again only at these counts within the hour, so a wave is a few messages, not hundreds. */
export const REPEAT_COUNTS = [10, 50, 100, 500];
const SEND_TIMEOUT_MS = 2500;

/** The same problem with a different video or upload id is still the same problem. */
export const sameProblemText = (message) => message.replace(/^(Video|Upload) [^:]+: /, '');

/** Whether the `count`th time a problem was seen this hour is worth a message. */
export const worthTelling = (count) => count === 1 || REPEAT_COUNTS.includes(count);

export function alertText({ kind, email, message, count, site }) {
  const where = site.name === 'live' ? 'mumoo' : `mumoo ${site.name}`;
  const lines = [`⚠ ${where} · ${KIND_TITLES[kind] ?? kind}`];
  if (count > 1) lines.push(`${count} times in the last hour`);
  lines.push(email ? `${email} · ${message}` : message, '', `${site.origin}/admin#errors`);
  return lines.join('\n');
}

/** Tells the owner on Telegram (@mumoo_status_bot). Only from our two sites; never throws or waits long. */
export async function tellOwner(problem, send = fetch) {
  const site = thisSite();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!site || !token || !chat) return false;
  try {
    const response = await send(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: alertText({ ...problem, site }), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) console.error('alert: telegram answered', response.status);
    return response.ok;
  } catch (cause) {
    console.error('alert:', cause instanceof Error ? cause.message : cause);
    return false;
  }
}
