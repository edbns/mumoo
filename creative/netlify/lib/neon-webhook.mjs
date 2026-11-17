import { createPublicKey, verify } from 'node:crypto';

/** A request older than this is turned away, so a captured one cannot be sent again later. */
const FRESH_MS = 5 * 60_000;

let keys;
async function keyFor(kid) {
  const known = () => keys?.find(key => key.kid === kid);
  if (!known()) keys = (await (await fetch(process.env.NEON_AUTH_JWKS_URL, { signal: AbortSignal.timeout(5000) })).json()).keys ?? [];
  return known();
}

/**
 * The event Neon Auth sent, or null when the request is not really from Neon. Neon signs `timestamp.base64url(body)` with its
 * Ed25519 key (the same published keys that sign sign-in tokens) as a detached JWS in X-Neon-Signature.
 */
export async function neonEvent(rawBody, headers, now = Date.now()) {
  const signature = headers.get('x-neon-signature') ?? '';
  const kid = headers.get('x-neon-signature-kid') ?? '';
  const timestamp = headers.get('x-neon-timestamp') ?? '';
  const [header, detached, signed] = signature.split('.');
  if (!header || detached !== '' || !signed || !kid || !/^\d+$/.test(timestamp)) return null;
  if (Math.abs(now - Number(timestamp)) > FRESH_MS) return null;
  const jwk = await keyFor(kid);
  if (!jwk) return null;
  const payload = Buffer.from(`${timestamp}.${Buffer.from(rawBody, 'utf8').toString('base64url')}`, 'utf8').toString('base64url');
  try {
    if (!verify(null, Buffer.from(`${header}.${payload}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(signed, 'base64url'))) return null;
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}
