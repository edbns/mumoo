/**
 * Cloudflare Turnstile: the proof that a person, not a script, asked for something that costs us or a stranger (a sign-in email to
 * any address). The browser gets a one-use token from Cloudflare (src/human-check.ts) and sends it in HUMAN_HEADER; we ask
 * Cloudflare whether it is good before doing the thing.
 */

export const HUMAN_HEADER = 'x-human-check';
const VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Requests to Neon Auth that send an email to the address in them. */
const SENDS_EMAIL = ['/email-otp/send-verification-otp', '/sign-in/magic-link', '/send-verification-email', '/forget-password/email-otp', '/request-password-reset'];

export const sendsEmail = (request) => request.method === 'POST' && SENDS_EMAIL.some(path => new URL(request.url).pathname.endsWith(path));

/**
 * Why the request may not go ahead, or null when it may. Without TURNSTILE_SECRET_KEY (the local preview) nothing is checked. When
 * Cloudflare cannot be asked, the request goes ahead: a person must never be locked out of signing in by an outage of the check.
 */
export async function humanProblem(request, action, fetcher = fetch) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return null;
  const token = request.headers.get(HUMAN_HEADER);
  if (!token || token.length > 2048) return 'missing';
  const body = new URLSearchParams({ secret, response: token });
  const ip = request.headers.get('x-nf-client-connection-ip');
  if (ip) body.set('remoteip', ip);
  let answer;
  try {
    const response = await fetcher(VERIFY, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`siteverify ${response.status}`);
    answer = await response.json();
  } catch (cause) {
    console.error('turnstile unavailable, let through:', cause);
    return null;
  }
  if (!answer.success) return (answer['error-codes'] ?? []).join(',') || 'refused';
  if (answer.action && answer.action !== action) return 'wrong-action';
  return null;
}
