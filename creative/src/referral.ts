/**
 * Give 10, get 10, in the browser. A visitor arriving with someone's link (`?ref=<code>`) has the code kept here (it is taken
 * out of the address), and once they are signed in it is sent to our server, which makes them that person's friend if their
 * account is new (`/api/referral`). Kept for a month, so signing up a few days later still counts.
 */
const KEY = 'mumoo-referral';
const KEEP_MS = 30 * 86400_000;
const CODE = /^[a-z0-9]{6,16}$/;

export type ReferralInfo = {
  code: string; link: string; joined: number; bought: number; thisMonth: number; earned: number; cap: number; videos: number;
  /** Videos the person's own friend's invite still adds to their first pack (0 once they paid, or without one). */
  firstPackBonus: number;
};

/** Takes `?ref=` out of the address and keeps it. Call once when a page loads. */
export function keepReferral() {
  const url = new URL(location.href);
  const code = url.searchParams.get('ref')?.trim().toLowerCase();
  if (code === undefined) return;
  url.searchParams.delete('ref');
  history.replaceState(history.state, '', url.href);
  if (!CODE.test(code)) return;
  try { localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* storage unavailable: the invite is lost */ }
}

/** The kept code, while it is fresh. */
export function pendingReferral(): string | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { code?: string; at?: number } | null;
    if (kept?.code && CODE.test(kept.code) && Date.now() - (kept.at ?? 0) < KEEP_MS) return kept.code;
    localStorage.removeItem(KEY);
  } catch { /* nothing kept */ }
  return null;
}

type Fetch = (path: string, init?: RequestInit) => Promise<Response>;

/** Signed in: hands the kept code to the server once. Whatever it answers (joined, too old, their own), the code is done with. */
export async function claimPendingReferral(accountFetch: Fetch) {
  const code = pendingReferral();
  if (!code) return;
  try {
    await accountFetch('/api/referral', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    localStorage.removeItem(KEY);
  } catch {
    // Not reached (offline, or the server busy): kept, and tried again on the next visit.
  }
}

export async function loadReferral(accountFetch: Fetch): Promise<ReferralInfo> {
  return (await accountFetch('/api/referral')).json() as Promise<ReferralInfo>;
}

/** The person's link never changes, so the last answer is kept per account and shown at once while a fresh one loads. */
const savedKey = (userId: string) => `mumoo-invite:${userId}`;
export function savedReferral(userId: string): ReferralInfo | null {
  try { return JSON.parse(localStorage.getItem(savedKey(userId)) ?? 'null') as ReferralInfo | null; } catch { return null; }
}
export function saveReferral(userId: string, info: ReferralInfo) {
  try { localStorage.setItem(savedKey(userId), JSON.stringify(info)); } catch { /* storage unavailable: loaded each time */ }
}
