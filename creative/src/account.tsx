import { useCallback, useEffect, useRef, useState } from 'react';
import { createAuthClient } from '@neon/auth';
import { BetterAuthReactAdapter } from '@neon/auth/react/adapters';
import { SignInDialog } from './sign-in-dialog';
import { Button } from '@/components/ui/button';
import { UserDropdownMenu } from '@/components/ui/user-dropdown-menu';
import { PROFILE_CORNER } from '@/components/ui/profile-dot';
import { AccountPlaceholder, askSignIn, rememberSignedIn, takeSignInRequests, type SignInReason } from './account-hint';
import { ACCOUNT_MENU, type AccountPage } from './account-pages';
import { BUY_CREDITS, CREDITS_CHANGED, creditsBought, creditsChanged, type Allowance, type Shortfall } from './credit-events';
import { InviteFriends } from './invite-friends';
import { PurchaseCredits } from './purchase-credits';
import { claimPendingReferral } from './referral';
import { reportProblem } from './report-problem';

/**
 * Neon Auth (managed Better Auth), reached through our own address (/api/neon-auth, passed on to Neon as it is) so its session
 * cookie is our site's: browsers that block third-party cookies would drop it straight after the code is accepted. The local
 * preview keeps its stand-in.
 */
const AUTH_URL = import.meta.env.DEV ? import.meta.env.VITE_NEON_AUTH_URL : `${location.origin}/api/neon-auth`;
export const authClient = createAuthClient(AUTH_URL, { adapter: BetterAuthReactAdapter() });

type Outcome = Promise<{ error?: { message?: string } | null }>;
/** Email-code sign-in is on the client at runtime, but this SDK version's typings leave it out. */
const emailCode = authClient as unknown as {
  emailOtp: { sendVerificationOtp(input: { email: string; type: 'sign-in' }): Outcome };
  signIn: { emailOtp(input: { email: string; otp: string }): Outcome };
};

/** The signed JWT Neon Auth keeps on the session (this SDK version has no separate token call), or null when signed out. */
export async function sessionToken(): Promise<string | null> {
  const { data } = await authClient.getSession();
  const token = data?.session?.token;
  return token && token.split('.').length === 3 ? token : null;
}

/** One request to our own API as the signed-in person. Throws the server's own words when it refuses. */
export async function accountFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await sessionToken();
  if (!token) throw new Error('Sign in to keep going.');
  const response = await fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error || 'Not available right now. Give it a sec and try again.');
  }
  return response;
}

/**
 * What the person can still make, as our server reports it: their credits (one makes one video) and whether their free first video
 * is still to come. Asking also records the visit: the server verifies the token and notes that they were here.
 */
export async function loadAllowance(): Promise<Allowance> {
  const response = await accountFetch('/api/account');
  const { credits, freeVideo } = await response.json() as Allowance;
  return { credits, freeVideo };
}

const allowanceLabel = ({ credits, freeVideo }: Allowance) => (credits === 0 && freeVideo
  ? '1 free video'
  : `${credits.toLocaleString()} ${credits === 1 ? 'credit' : 'credits'}`);

/**
 * What the address asks the account corner to do, taken once and removed from it: `?buy=20` (a pack on the pricing page, signed
 * out) opens that pack's checkout once the person has signed in, `?checkout_id=…` (Polar bringing the person back after paying) shows the credits arriving.
 */
let purchaseRequest: { buy?: number; checkoutId?: string } | null | undefined;
function takePurchaseRequest() {
  if (purchaseRequest !== undefined) return purchaseRequest;
  purchaseRequest = null;
  const url = new URL(location.href);
  const buy = Number(url.searchParams.get('buy')) || undefined;
  const checkoutId = url.searchParams.get('checkout_id') || undefined;
  if (!buy && !checkoutId) return null;
  url.searchParams.delete('buy');
  url.searchParams.delete('checkout_id');
  history.replaceState(history.state, '', url.href);
  return (purchaseRequest = { buy, checkoutId });
}

/** Runs one request to Neon Auth. The client throws on a rejected request: a 4xx is the person's mistake, anything else is ours. Fails with the words to show. */
async function attempt(run: () => Outcome, mistake: string) {
  let result;
  try {
    result = await run();
  } catch (cause) {
    const status = (cause as { status?: number }).status;
    throw new Error(status && status < 500 ? mistake : 'Sign-in is down for a moment. Try again soon.');
  }
  if (result.error) throw new Error(mistake);
}

/** Sends the sign-in code to `email`. Fails with the words to show, and tells the admin's error log. */
export async function sendSignInCode(email: string) {
  try {
    await attempt(() => emailCode.emailOtp.sendVerificationOtp({ email, type: 'sign-in' }), 'Check that email and try again.');
  } catch (cause) {
    reportProblem('sign_in', `Couldn’t send the code: ${(cause as Error).message}`, { email, signedOut: true });
    throw cause;
  }
}

/** Signs in with the code that was sent to `email`. Fails with the words to show, and tells the admin's error log. */
export async function checkSignInCode(email: string, otp: string) {
  try {
    await attempt(() => emailCode.signIn.emailOtp({ email, otp }), 'Wrong code or it expired.');
  } catch (cause) {
    reportProblem('sign_in', `Code not accepted: ${(cause as Error).message}`, { email, signedOut: true });
    throw cause;
  }
}

/** Where Google sends the popup back to: the SDK, loading there, hands the session verifier to the page that opened it and closes. */
const GOOGLE_BACK = () => `${location.origin}/?neon_popup=1`;
/** How long the person may take on Google's pages. */
const GOOGLE_MINUTES = 5;

/**
 * Signs in with Google in a popup, so the page (and the song, clip and lyrics on it, which a reload would lose) stays as it is.
 * Google's pages open in the popup; back on our site the SDK posts the session verifier to this page, which hands it to Neon
 * for the session. Must be called straight from a click, or the browser blocks the popup. Fails with the words to show.
 */
export async function signInWithGoogle() {
  const popup = window.open('about:blank', 'mumoo-google', 'width=500,height=700,popup=yes');
  if (!popup) throw new Error('Your browser blocked the Google window. Allow popups or just use email.');
  try {
    const { data, error } = await authClient.signIn.social({ provider: 'google', callbackURL: GOOGLE_BACK(), errorCallbackURL: GOOGLE_BACK(), disableRedirect: true });
    if (error || !data?.url) throw new Error('Google sign-in is down right now. Try again in a bit.');
    popup.location.href = data.url;
  } catch (cause) {
    popup.close();
    reportProblem('sign_in', `Google sign-in didn’t start: ${(cause as Error).message}`, { signedOut: true });
    throw cause;
  }
  const verifier = await new Promise<string | null>((resolve, reject) => {
    const done = (finish: () => void) => { window.removeEventListener('message', onMessage); clearInterval(watch); clearTimeout(limit); finish(); };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== popup || event.data?.type !== 'neon-auth:oauth-complete') return;
      done(() => resolve(typeof event.data.verifier === 'string' ? event.data.verifier : null));
    };
    const watch = setInterval(() => { if (popup.closed) done(() => reject(new Error('You closed the Google window before signing in.'))); }, 500);
    const limit = setTimeout(() => done(() => { popup.close(); reject(new Error('Google took too long. Try again.')); }), GOOGLE_MINUTES * 60_000);
    window.addEventListener('message', onMessage);
  });
  if (!verifier) throw new Error('Google didn’t sign you in. Try again or use email.');
  // The SDK reads the verifier from the address bar on its next session check, trades it for the session, and removes it.
  const url = new URL(location.href);
  url.searchParams.set('neon_auth_session_verifier', verifier);
  history.replaceState(history.state, '', url.href);
  const signedIn = await authClient.getSession().then(({ data }) => Boolean(data?.user), () => false);
  if (!signedIn) {
    url.searchParams.delete('neon_auth_session_verifier');
    history.replaceState(history.state, '', url.href);
    reportProblem('sign_in', 'Google sign-in returned no session', { signedOut: true });
    throw new Error('Google sign-in didn’t finish. Try again or use email.');
  }
}

/**
 * Changing the email with a code sent to the new address: the account, and so everything kept in it, stays the same.
 * Neon's sign-in does not allow it, so our own server sends the code and makes the change (`/api/account/email`).
 */
export async function requestEmailChange(newEmail: string) {
  await accountFetch('/api/account/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newEmail }) });
}

/**
 * Deletes the account completely (files, history, pictures and the sign-in itself), then forgets it on this device too: signs out
 * and clears what MUMOO keeps in the browser (the cart, a download in progress). `email` is the person's own, typed to confirm.
 */
export async function deleteAccount(email: string) {
  await accountFetch('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  await authClient.signOut().catch(() => undefined);
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('mumoo-')) localStorage.removeItem(key);
  } catch { /* storage unavailable: nothing kept */ }
}

/** What this browser keeps for the signed-in person (their chosen videos, a download in progress, their free video): another person may sign in here next. */
const PERSONAL_KEYS = ['mumoo-cart', 'mumoo-pending-download', 'mumoo-free-video'];
/** The home page a person who signs out lands on. */
const SIGNED_OUT_PAGE = '/welcome';

/** Signs out, forgets the person's work on this device, and goes to the home page: the page they were on was theirs. */
export async function signOut() {
  await authClient.signOut().catch(() => undefined);
  for (const key of PERSONAL_KEYS) {
    try { sessionStorage.removeItem(key); localStorage.removeItem(key); } catch { /* storage unavailable: nothing kept */ }
  }
  location.assign(SIGNED_OUT_PAGE);
}

/** Confirms the new address. */
export async function confirmEmailChange(newEmail: string, code: string) {
  await accountFetch('/api/account/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newEmail, code }) });
}

/**
 * The person's place in the corner. Signed out it is the Sign in button (top right, beside the cart); signed in it is
 * their profile icon at the bottom left, which opens the account menu.
 */
export function AccountBar({ page, onNavigate }: { page: AccountPage; onNavigate: (page: AccountPage) => void }) {
  const session = authClient.useSession();
  const signedIn = session.data?.user;
  /** The person shown. A check in the background (the client repeats it when the window is focused) can report nobody for a moment: until it settles, the icon stays. */
  const [last, setLast] = useState(signedIn);
  useEffect(() => { if (signedIn) setLast(signedIn); }, [signedIn]);
  const user = signedIn ?? (session.isPending ? last : undefined);
  const [open, setOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [allowance, setAllowance] = useState<Allowance>();
  const [shortfall, setShortfall] = useState<Shortfall>();
  const [purchase, setPurchase] = useState(takePurchaseRequest);
  /** The address the code was sent to, which the code is checked against. */
  const address = useRef('');
  /** Whether it is known yet if anyone is signed in. Later checks (the client repeats them when the window is focused) must not hide the button again. */
  const [known, setKnown] = useState(false);
  useEffect(() => { if (!session.isPending) setKnown(true); }, [session.isPending]);
  useEffect(() => { if (known) rememberSignedIn(Boolean(user)); }, [known, Boolean(user)]);
  // Signing in or out changes whether the free video is still to come, for whatever on the page offers it.
  const lastUser = useRef(user?.id);
  useEffect(() => {
    if (lastUser.current === user?.id) return;
    lastUser.current = user?.id;
    creditsChanged();
  }, [user?.id]);

  // Best effort: without it the menu simply has no amount beside Credit.
  // Signed up with a friend's link: the server makes them that friend (it decides whether the account is new enough).
  useEffect(() => { if (user) void claimPendingReferral(accountFetch); }, [user?.id]);
  useEffect(() => {
    if (!user) { setAllowance(undefined); return; }
    const reload = () => { loadAllowance().then(setAllowance, () => undefined); };
    reload();
    window.addEventListener(CREDITS_CHANGED, reload);
    return () => window.removeEventListener(CREDITS_CHANGED, reload);
  }, [user?.id]);
  useEffect(() => {
    const open = (event: Event) => { setPurchase(null); setShortfall((event as CustomEvent<Shortfall>).detail); setBuying(true); };
    window.addEventListener(BUY_CREDITS, open);
    return () => window.removeEventListener(BUY_CREDITS, open);
  }, []);

  /** A request from the page (pressing Download signed out): its reason is shown, and it is told whether the person signed in. */
  const [reason, setReason] = useState<SignInReason | null>(null);
  const asked = useRef<((signedIn: boolean) => void) | null>(null);
  const signedInHere = useRef(false);
  useEffect(() => takeSignInRequests(({ done, ...why }) => {
    asked.current?.(false);
    asked.current = done;
    signedInHere.current = false;
    setReason(why);
    setOpen(true);
  }), []);
  const openSignIn = () => { setReason(null); signedInHere.current = false; setOpen(true); };

  // Buying needs an account, as the credits are kept in it: signed out, the person is asked to sign in first (once).
  const askedToBuy = useRef<typeof purchase>(null);
  useEffect(() => {
    if (!purchase || !known) return;
    if (user) { setBuying(true); return; }
    if (purchase.checkoutId) { setPurchase(null); return; }
    if (askedToBuy.current === purchase) return;
    askedToBuy.current = purchase;
    void askSignIn({ title: 'Sign in to buy credits', lead: 'Your credits stay in your account.' })
      .then(signedIn => { if (!signedIn) setPurchase(null); });
  }, [purchase, known, Boolean(user)]);

  const closeSignIn = useCallback(() => {
    setOpen(false);
    asked.current?.(signedInHere.current);
    asked.current = null;
  }, []);

  async function sendCode(email: string) {
    await sendSignInCode(email);
    address.current = email;
  }

  async function checkCode(otp: string) {
    await checkSignInCode(address.current, otp);
    signedInHere.current = true;
    return true;
  }

  const groups = ACCOUNT_MENU.map(entries => entries.map(({ line, label, icon }) => line === 'credit'
    ? { label, icon, aside: allowance && allowanceLabel(allowance), onSelect: () => { setPurchase(null); setShortfall(undefined); setBuying(true); } }
    : line === 'invite' ? { label, icon, onSelect: () => setInviting(true) }
    : { label, icon, current: line === page || (line === 'links' && page === 'my-links'), onSelect: () => onNavigate(line) }));

  return <>
    {!known && !user && <AccountPlaceholder onSignIn={openSignIn} />}
    {known && !user && <Button variant="secondary" onClick={openSignIn}>Sign in</Button>}
    {user && <div className={PROFILE_CORNER}>
      <UserDropdownMenu email={user.email} groups={groups} onSignOut={() => void signOut()} />
    </div>}
    <PurchaseCredits open={buying} onClose={() => { setBuying(false); setPurchase(null); setShortfall(undefined); }}
      initial={purchase?.buy} autoBuy={Boolean(purchase?.buy)} checkoutId={purchase?.checkoutId} shortfall={shortfall}
      onCredits={credits => setAllowance(current => ({ freeVideo: current?.freeVideo ?? false, credits }))}
      onBoughtForDownload={() => { setBuying(false); setShortfall(undefined); creditsBought(); }} />
    {user && <InviteFriends key={user.id} open={inviting} onClose={() => setInviting(false)} userId={user.id} />}
    {/* One popup for both states, so the welcome after signing in is not cut short when the button changes. */}
    <SignInDialog open={open} onClose={closeSignIn} onSendCode={sendCode} onCheckCode={checkCode} reason={reason}
      onGoogle={async () => { await signInWithGoogle(); signedInHere.current = true; await session.refetch(); }} />
  </>;
}
