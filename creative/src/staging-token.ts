/**
 * The staging access token lasts 15 minutes, but a person can keep the page open much longer (picking creatives for ads,
 * coming back after a break). So it is never trusted for long: `freshAccess` hands out the token if it is young, and
 * asks for a new one when it is not. The server's key stays where it is; only the short-lived token is renewed.
 */
const FRESH_MS = 8 * 60 * 1000;

let current: { token: string; mintedAt: number } | null = null;
let minting: Promise<string | null> | null = null;

async function mint(): Promise<string | null> {
  try {
    const response = await fetch('/api/brain-tester-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const value = response.ok ? await response.json() as { token?: unknown } : null;
    return typeof value?.token === 'string' ? value.token : null;
  } catch {
    return null;
  }
}

/** A token that is good for at least several more minutes (`renew` asks for a new one whatever the age, after the server refused one). */
export async function freshAccess(fallback = '', renew = false): Promise<string> {
  if (!renew && current && Date.now() - current.mintedAt < FRESH_MS) return current.token;
  minting ??= mint().finally(() => { minting = null; });
  const token = await minting;
  if (token) { current = { token, mintedAt: Date.now() }; return token; }
  return current?.token ?? fallback;
}

/** Keeps a token the page already has, so it is not asked for twice. */
export function rememberAccess(token: string) {
  current = { token, mintedAt: Date.now() };
}
