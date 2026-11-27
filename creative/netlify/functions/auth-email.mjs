import { signInCode } from '../lib/letters.mjs';
import { mailReady, sendMail } from '../lib/mail.mjs';
import { neonEvent } from '../lib/neon-webhook.mjs';

const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * POST /api/auth/email — Neon Auth's `send.otp` webhook: Neon hands us the sign-in code instead of mailing it itself, so the email
 * comes from mumoo with the code in the subject. The sign-in waits for this answer (Neon tries three times within 15 seconds),
 * and a retry carries the same event id, so a retry sends nothing twice. Amazon's mail server can take a few seconds to take
 * the letter: past `ANSWER_MS` Neon is told it is on its way, so the popup moves on to the code, and the sending finishes after.
 */
const ANSWER_MS = 1500;

export default async function handler(request, context) {
  if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (!process.env.NEON_AUTH_JWKS_URL || !mailReady()) return reply(503, { error: 'Email is unavailable.' });
  const event = await neonEvent(await request.text(), request.headers);
  if (!event) return reply(401, { error: 'Not signed by Neon.' });
  if (event.event_type !== 'send.otp') return reply(200, { ignored: true });
  const { otp_code: code, otp_type: type, expires_at: expires } = event.event_data ?? {};
  const to = event.user?.email;
  if (typeof code !== 'string' || typeof to !== 'string') return reply(400, { error: 'No code or address.' });
  const minutes = Math.max(1, Math.round((Date.parse(expires) - Date.now()) / 60_000) || 5);
  const sending = sendMail({ to, ...signInCode(code, minutes, type), once: typeof event.event_id === 'string' ? `neon-${event.event_id}` : undefined });
  try {
    if (context?.waitUntil) {
      let timer;
      const sent = sending.then(() => false);
      sent.catch(() => undefined);
      const slow = await Promise.race([sent, new Promise(resolve => { timer = setTimeout(resolve, ANSWER_MS, true); })]);
      clearTimeout(timer);
      if (slow) {
        context.waitUntil(sending.catch(cause => console.error('sign-in code, after answering:', cause)));
        return reply(200, { sending: true });
      }
    } else await sending;
    return reply(200, { sent: true });
  } catch (cause) {
    console.error('sign-in code:', cause);
    return reply(502, { error: 'Couldn’t send the code.' });
  }
}

export const config = { path: '/api/auth/email' };
