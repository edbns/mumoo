import { createHmac, timingSafeEqual } from 'node:crypto';

/** Staging access: a short-lived token minted by brain-tester-access, signed with MUMOO_BRAIN_TESTER_KEY. */
export function validAccess(token, key, now = Math.floor(Date.now() / 1000)) {
  if (typeof key !== 'string' || key.length < 32 || !/^\d{10}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expiry, signature] = token.split('.');
  if (Number(expiry) <= now || Number(expiry) > now + 86400) return false;
  const expected = createHmac('sha256', key).update(`mumoo-brain-staging:${expiry}`).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}
