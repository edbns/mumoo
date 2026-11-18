import { useCallback, useEffect, useRef, useState } from 'react';
import { createAuthClient } from '@neon/auth';
import { BetterAuthReactAdapter } from '@neon/auth/react/adapters';
import { SignInDialog } from './sign-in-dialog';
import { Button } from '@/components/ui/button';
import { UserDropdownMenu } from '@/components/ui/user-dropdown-menu';
import { PROFILE_CORNER } from '@/components/ui/profile-dot';
import { AccountPlaceholder, rememberSignedIn } from './account-hint';
import { ACCOUNT_MENU, type AccountPage } from './account-pages';
import { PurchaseCredits } from './purchase-credits';
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
  if (!token) throw new Error('Sign in to continue.');
  const response = await fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error || 'This is unavailable right now. Try again in a moment.');
  }
  return response;
}

/** The person's credit in tokens, as our server reports it. Asking also records the visit: the server verifies the token and notes that they were here. */
async function loadCredit() {
  const response = await accountFetch('/api/account');
  const { credit } = await response.json() as { credit: { tokens: number } };
  return `${credit.tokens.toLocaleString()} ${credit.tokens === 1 ? 'token' : 'tokens'}`;
}

/** Runs one request to Neon Auth. The client throws on a rejected request: a 4xx is the person's mistake, anything else is ours. Fails with the words to show. */
async function attempt(run: () => Outcome, mistake: string) {
  let result;
  try {
    result = await run();
  } catch (cause) {
    const status = (cause as { status?: number }).status;
    throw new Error(status && status < 500 ? mistake : 'Sign in is unavailable right now. Try again in a moment.');
  }
  if (result.error) throw new Error(mistake);
}

/** Sends the sign-in code to `email`. Fails with the words to show, and tells the admin's error log. */
export async function sendSignInCode(email: string) {
  try {
    await attempt(() => emailCode.emailOtp.sendVerificationOtp({ email, type: 'sign-in' }), 'Check the email address and try again.');
  } catch (cause) {
    reportProblem('sign_in', `Could not send the code: ${(cause as Error).message}`, { email, signedOut: true });
    throw cause;
  }
}

/** Signs in with the code that was sent to `email`. Fails with the words to show, and tells the admin's error log. */
export async function checkSignInCode(email: string, otp: string) {
  try {
    await attempt(() => emailCode.signIn.emailOtp({ email, otp }), 'That code is wrong or has expired.');
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
  if (!popup) throw new Error('Your browser blocked the Google window. Allow popups for this site, or sign in with your email.');
  try {
    const { data, error } = await authClient.signIn.social({ provider: 'google', callbackURL: GOOGLE_BACK(), errorCallbackURL: GOOGLE_BACK(), disableRedirect: true });
    if (error || !data?.url) throw new Error('Google sign-in is unavailable right now. Try again in a moment.');
    popup.location.href = data.url;
  } catch (cause) {
    popup.close();
    reportProblem('sign_in', `Google sign-in did not start: ${(cause as Error).message}`, { signedOut: true });
    throw cause;
  }
  const verifier = await new Promise<string | null>((resolve, reject) => {
    const done = (finish: () => void) => { window.removeEventListener('message', onMessage); clearInterval(watch); clearTimeout(limit); finish(); };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== popup || event.data?.type !== 'neon-auth:oauth-complete') return;
      done(() => resolve(typeof event.data.verifier === 'string' ? event.data.verifier : null));
    };
    const watch = setInterval(() => { if (popup.closed) done(() => reject(new Error('The Google window was closed before you signed in.'))); }, 500);
    const limit = setTimeout(() => done(() => { popup.close(); reject(new Error('Google sign-in took too long. Try again.')); }), GOOGLE_MINUTES * 60_000);
    window.addEventListener('message', onMessage);
  });
  if (!verifier) throw new Error('Google did not sign you in. Try again, or sign in with your email.');
  // The SDK reads the verifier from the address bar on its next session check, trades it for the session, and removes it.
  const url = new URL(location.href);
  url.searchParams.set('neon_auth_session_verifier', verifier);
  history.replaceState(history.state, '', url.href);
  const signedIn = await authClient.getSession().then(({ data }) => Boolean(data?.user), () => false);
  if (!signedIn) {
    url.searchParams.delete('neon_auth_session_verifier');
    history.replaceState(history.state, '', url.href);
    reportProblem('sign_in', 'Google sign-in returned no session', { signedOut: true });
    throw new Error('Google sign-in did not finish. Try again, or sign in with your email.');
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
  const [credit, setCredit] = useState<string>();
  /** The address the code was sent to, which the code is checked against. */
  const address = useRef('');
  /** Whether it is known yet if anyone is signed in. Later checks (the client repeats them when the window is focused) must not hide the button again. */
  const [known, setKnown] = useState(false);
  useEffect(() => { if (!session.isPending) setKnown(true); }, [session.isPending]);
  useEffect(() => { if (known) rememberSignedIn(Boolean(user)); }, [known, Boolean(user)]);

  // Best effort: without it the menu simply has no amount beside Credit.
  useEffect(() => {
    if (user) loadCredit().then(setCredit, () => undefined);
    else setCredit(undefined);
  }, [user?.id]);

  const closeSignIn = useCallback(() => setOpen(false), []);

  async function sendCode(email: string) {
    await sendSignInCode(email);
    address.current = email;
  }

  async function checkCode(otp: string) {
    await checkSignInCode(address.current, otp);
    return true;
  }

  const groups = ACCOUNT_MENU.map(entries => entries.map(({ line, label, icon }) => line === 'credit'
    ? { label, icon, aside: credit, onSelect: () => setBuying(true) }
    : { label, icon, current: line === page || (line === 'links' && page === 'my-links'), onSelect: () => onNavigate(line) }));

  return <>
    {!known && !user && <AccountPlaceholder onSignIn={() => setOpen(true)} />}
    {known && !user && <Button variant="secondary" onClick={() => setOpen(true)}>Sign in</Button>}
    {user && <div className={PROFILE_CORNER}>
      <UserDropdownMenu email={user.email} groups={groups} onSignOut={() => { void authClient.signOut(); onNavigate('create'); }} />
    </div>}
    <PurchaseCredits open={buying} onClose={() => setBuying(false)} />
    {/* One popup for both states, so the welcome after signing in is not cut short when the button changes. */}
    <SignInDialog open={open} onClose={closeSignIn} onSendCode={sendCode} onCheckCode={checkCode}
      onGoogle={async () => { await signInWithGoogle(); await session.refetch(); }} />
  </>;
}
