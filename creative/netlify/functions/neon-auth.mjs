import { forwardAuth } from '../lib/auth-proxy.mjs';
import { humanProblem, sendsEmail } from '../lib/turnstile.mjs';

/** /api/neon-auth/*  Sign-in, through our own address so the session cookie is ours (see netlify/lib/auth-proxy.mjs). */
export default async function handler(request) {
  if (!process.env.NEON_AUTH_BASE_URL) return Response.json({ error: 'Accounts are unavailable.' }, { status: 503 });
  if (sendsEmail(request)) {
    const problem = await humanProblem(request, 'sign-in');
    if (problem) {
      console.warn('sign-in email refused by the human check:', problem);
      return Response.json({ code: 'HUMAN_CHECK', message: 'Couldn’t confirm you’re a person. Reload the page and try again.' }, { status: 403, headers: { 'cache-control': 'no-store' } });
    }
  }
  return forwardAuth(request, process.env.NEON_AUTH_BASE_URL);
}

export const config = { path: ['/api/neon-auth', '/api/neon-auth/*'] };
