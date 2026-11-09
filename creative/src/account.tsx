import { useEffect, useState, type FormEvent } from 'react';
import { createAuthClient } from '@neon/auth';
import { BetterAuthReactAdapter } from '@neon/auth/react/adapters';
import { MyLibrary } from './my-library';

/** Neon Auth (managed Better Auth). The browser only ever talks to Neon's auth server and our own /api/account. */
export const authClient = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL, { adapter: BetterAuthReactAdapter() });

type Outcome = Promise<{ error?: { message?: string } | null }>;
/** Email-code sign-in is on the client at runtime, but this SDK version's typings leave it out. */
const emailCode = authClient as unknown as {
  emailOtp: { sendVerificationOtp(input: { email: string; type: 'sign-in' }): Outcome };
  signIn: { emailOtp(input: { email: string; otp: string }): Outcome };
};

type Person = { email: string; lastSeenAt: string; storage: { used: number; quota: number } };

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

/** Asks our server who is signed in; the server verifies the token and records the visit. */
async function loadPerson(): Promise<Person> {
  const token = await sessionToken();
  if (!token) throw new Error('Your session could not be verified.');
  const response = await fetch('/api/account', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Your account is unavailable right now.');
  return response.json() as Promise<Person>;
}

export function AccountBar() {
  const session = authClient.useSession();
  const user = session.data?.user;
  const [person, setPerson] = useState<Person | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState(false);

  useEffect(() => {
    if (!user) { setPerson(null); return; }
    let alive = true;
    loadPerson().then(next => { if (alive) { setPerson(next); setError(''); } }).catch(cause => { if (alive) setError(cause.message); });
    return () => { alive = false; };
  }, [user?.id]);

  /** Runs one request to Neon Auth. The client throws on a rejected request: a 4xx is the person's mistake, anything else is ours. */
  async function attempt(run: () => Outcome, mistake: string) {
    setBusy(true); setError('');
    try {
      const result = await run();
      if (result.error) { setError(mistake); return false; }
      return true;
    } catch (cause) {
      const status = (cause as { status?: number }).status;
      setError(status && status < 500 ? mistake : 'Sign in is unavailable right now. Try again in a moment.');
      return false;
    } finally { setBusy(false); }
  }

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = String(new FormData(event.currentTarget).get('email') || '').trim();
    if (await attempt(() => emailCode.emailOtp.sendVerificationOtp({ email: address, type: 'sign-in' }), 'Check the email address and try again.')) {
      setEmail(address); setSent(true);
    }
  }

  async function checkCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const otp = String(new FormData(event.currentTarget).get('code') || '').trim();
    if (await attempt(() => emailCode.signIn.emailOtp({ email, otp }), 'That code is wrong or has expired.')) { setOpen(false); setSent(false); }
  }

  if (session.isPending) return <div className="account-bar" aria-busy="true" />;
  if (user) {
    return <div className="account-bar">
      <span className="account-email" title={person ? `Last seen ${new Date(person.lastSeenAt).toLocaleString()}` : undefined}>{user.email}</span>
      <button type="button" className="link-button" onClick={() => setLibrary(true)}>My library</button>
      <button type="button" className="link-button" onClick={() => void authClient.signOut()}>Sign out</button>
      {library && <MyLibrary onClose={() => setLibrary(false)} />}
      {error && <span role="alert" className="hint">{error}</span>}
    </div>;
  }
  if (!open) return <div className="account-bar"><button type="button" className="link-button" onClick={() => setOpen(true)}>Sign in</button></div>;
  return <div className="account-bar">
    {sent
      ? <form className="account-form" onSubmit={event => void checkCode(event)}>
        <span className="hint">We emailed a code to {email}</span>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Code" required aria-label="Code from your email" autoFocus />
        <button type="submit" className="primary-accent" disabled={busy}>Sign in</button>
        <button type="button" className="link-button" onClick={() => { setSent(false); setError(''); }}>Use another email</button>
        {error && <span role="alert" className="hint">{error}</span>}
      </form>
      : <form className="account-form" onSubmit={event => void sendCode(event)}>
        <input name="email" type="email" autoComplete="email" placeholder="Email" defaultValue={email} required aria-label="Email" autoFocus />
        <button type="submit" className="primary-accent" disabled={busy}>Email me a code</button>
        {error && <span role="alert" className="hint">{error}</span>}
      </form>}
  </div>;
}
