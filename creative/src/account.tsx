import { useCallback, useEffect, useRef, useState } from 'react';
import { createAuthClient } from '@neon/auth';
import { BetterAuthReactAdapter } from '@neon/auth/react/adapters';
import { SignInDialog } from './sign-in-dialog';
import { Button } from '@/components/ui/button';
import { UserDropdownMenu } from '@/components/ui/user-dropdown-menu';
import { ACCOUNT_MENU, type AccountPage } from './account-pages';
import { PurchaseCredits } from './purchase-credits';
import { reportProblem } from './report-problem';

/** Neon Auth (managed Better Auth). The browser only ever talks to Neon's auth server and our own /api/account. */
export const authClient = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL, { adapter: BetterAuthReactAdapter() });

type Outcome = Promise<{ error?: { message?: string } | null }>;
/** Email-code sign-in is on the client at runtime, but this SDK version's typings leave it out. */
const emailCode = authClient as unknown as {
  emailOtp: { sendVerificationOtp(input: { email: string; type: 'sign-in' }): Outcome };
  signIn: { emailOtp(input: { email: string; otp: string }): Outcome };
};
/** Changing the email with a code sent to the new address: the account, and so everything kept in it, stays the same. */
const emailChange = authClient as unknown as {
  emailOtp: {
    requestEmailChange(input: { newEmail: string }): Outcome;
    changeEmail(input: { newEmail: string; otp: string }): Outcome;
  };
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

export async function requestEmailChange(newEmail: string) {
  await attempt(() => emailChange.emailOtp.requestEmailChange({ newEmail }), 'Check the email address and try again.');
}

/** Confirms the new address. */
export async function confirmEmailChange(newEmail: string, otp: string) {
  await attempt(() => emailChange.emailOtp.changeEmail({ newEmail, otp }), 'That code is wrong or has expired.');
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
    : { label, icon, current: line === page, onSelect: () => onNavigate(line) }));

  return <>
    {known && !user && <Button variant="secondary" onClick={() => setOpen(true)}>Sign in</Button>}
    {user && <div className="fixed bottom-6 left-6 z-[5]">
      <UserDropdownMenu email={user.email} groups={groups} onSignOut={() => { void authClient.signOut(); onNavigate('create'); }} />
    </div>}
    <PurchaseCredits open={buying} onClose={() => setBuying(false)} />
    {/* One popup for both states, so the welcome after signing in is not cut short when the button changes. */}
    <SignInDialog open={open} onClose={closeSignIn} onSendCode={sendCode} onCheckCode={checkCode} />
  </>;
}
