/**
 * The artists' ad-platform tokens, encrypted at rest with AES-256-GCM. The key is `PIXEL_TOKEN_KEY`: 32 random bytes in base64
 * (`openssl rand -base64 32`), set in Netlify. Without it tokens can't be saved, and the ones saved can't be used.
 */

const PREFIX = 'v1';

const toBase64 = (bytes) => Buffer.from(bytes).toString('base64');
const fromBase64 = (text) => new Uint8Array(Buffer.from(text, 'base64'));

async function key() {
  const raw = process.env.PIXEL_TOKEN_KEY ? fromBase64(process.env.PIXEL_TOKEN_KEY) : null;
  if (!raw || raw.length !== 32) return null;
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export const canSeal = () => Boolean(process.env.PIXEL_TOKEN_KEY) && fromBase64(process.env.PIXEL_TOKEN_KEY).length === 32;

/** "v1.<iv>.<ciphertext>", or null without a key. */
export async function seal(text) {
  const secret = await key();
  if (!secret) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, secret, new TextEncoder().encode(text));
  return `${PREFIX}.${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
}

/** The text, or null without a key or when it was not sealed with it. */
export async function open(sealed) {
  const [prefix, iv, data] = String(sealed ?? '').split('.');
  const secret = await key();
  if (!secret || prefix !== PREFIX || !iv || !data) return null;
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, secret, fromBase64(data)));
  } catch {
    return null;
  }
}
