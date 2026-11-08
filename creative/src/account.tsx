import { useEffect, useState, type FormEvent } from 'react';
import { createAuthClient } from '@neon/auth';
import { BetterAuthReactAdapter } from '@neon/auth/react/adapters';

/** Neon Auth (managed Better Auth). The browser only ever talks to Neon's auth server and our own /api/account. */
export const authClient = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL, { adapter: BetterAuthReactAdapter() });

type Person = { email: string; lastSeenAt: string };

/** Asks our server who is signed in; the server verifies the token and records the visit. */
async function loadPerson(): Promise<Person> {
  // Neon Auth hands the browser a signed JWT on the session (this SDK version has no separate token call).
  const { data } = await authClient.getSession();
  const token = data?.session?.token;
  if (!token || token.split('.').length !== 3) throw new Error('Your session could not be verified.');
  const response = await fetch('/api/account', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Your account is unavailable right now.');
  return response.json() as Promise<Person>;
}

export function AccountBar() {
  const session = authClient.useSession();
  const user = session.data?.user;
  const [person, setPerson] = useState<Person | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) { setPerson(null); return; }
    let alive = true;
    loadPerson().then(next => { if (alive) { setPerson(next); setError(''); } }).catch(cause => { if (alive) setError(cause.message); });
    return () => { alive = false; };
  }, [user?.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    setBusy(true); setError('');
    try {
      const result = mode === 'up'
        ? await authClient.signUp.email({ email, password, name: email.split('@')[0] })
        : await authClient.signIn.email({ email, password });
      if (result.error) setError(result.error.message || (mode === 'up' ? 'Could not create the account.' : 'Wrong email or password.'));
      else setOpen(false);
    } catch (cause) {
      // The Neon Auth client throws on a rejected request; a 4xx is the person's mistake, anything else is ours.
      const status = (cause as { status?: number }).status;
      setError(status && status < 500
        ? (mode === 'up' ? 'Could not create the account. Try another email or a longer password.' : 'Wrong email or password.')
        : 'Sign in is unavailable right now. Try again in a moment.');
    } finally { setBusy(false); }
  }

  if (session.isPending) return <div className="account-bar" aria-busy="true" />;
  if (user) {
    return <div className="account-bar">
      <span className="account-email" title={person ? `Last seen ${new Date(person.lastSeenAt).toLocaleString()}` : undefined}>{user.email}</span>
      <button type="button" className="link-button" onClick={() => void authClient.signOut()}>Sign out</button>
      {error && <span role="alert" className="hint">{error}</span>}
    </div>;
  }
  return <div className="account-bar">
    {!open
      ? <button type="button" className="link-button" onClick={() => setOpen(true)}>Sign in</button>
      : <form className="account-form" onSubmit={event => void submit(event)}>
        <input name="email" type="email" autoComplete="email" placeholder="Email" required aria-label="Email" />
        <input name="password" type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} placeholder="Password" minLength={8} required aria-label="Password" />
        <button type="submit" className="primary-accent" disabled={busy}>{mode === 'up' ? 'Create account' : 'Sign in'}</button>
        <button type="button" className="link-button" onClick={() => { setMode(mode === 'up' ? 'in' : 'up'); setError(''); }}>{mode === 'up' ? 'I have an account' : 'Create an account'}</button>
        {error && <span role="alert" className="hint">{error}</span>}
      </form>}
  </div>;
}
