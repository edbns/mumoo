import { forwardAuth } from '../lib/auth-proxy.mjs';

/** /api/neon-auth/*  Sign-in, through our own address so the session cookie is ours (see netlify/lib/auth-proxy.mjs). */
export default async function handler(request) {
  if (!process.env.NEON_AUTH_BASE_URL) return Response.json({ error: 'Accounts are unavailable.' }, { status: 503 });
  return forwardAuth(request, process.env.NEON_AUTH_BASE_URL);
}

export const config = { path: ['/api/neon-auth', '/api/neon-auth/*'] };
