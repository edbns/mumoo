import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { authClient, confirmEmailChange, requestEmailChange } from './account';
import { AccountColumn, AccountSection } from './account-section';

/** How long the confirmation is read before the page reloads. */
const RELOAD_MS = 2000;

const field = 'h-10 w-full rounded-[var(--radius-control)] bg-muted px-3 text-sm text-foreground outline-ring placeholder:text-muted-foreground focus-visible:outline-2';

/** The person's settings. For now: changing the email, with a code sent to the new address, so everything they made stays with them. */
export default function SettingsPage() {
  const current = authClient.useSession().data?.user.email ?? '';
  /** The new address once its code has been sent; null while the person is still typing it. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Try again in a moment.');
    } finally { setBusy(false); }
  }

  function sendCode(event: FormEvent) {
    event.preventDefault();
    const next = email.trim();
    if (next.toLowerCase() === current.toLowerCase()) { setError('That is already your email.'); return; }
    void run(async () => { await requestEmailChange(next); setSentTo(next); setCode(''); });
  }

  function confirm(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await confirmEmailChange(sentTo!, code.trim());
      setNotice(`Your email is now ${sentTo}. Everything you made is still yours.`);
      setSentTo(null); setEmail(''); setCode('');
      // The Neon Auth client keeps the signed-in person in memory until it reloads; the reload shows the new address everywhere.
      setTimeout(() => location.reload(), RELOAD_MS);
    });
  }

  return <AccountColumn>
    <AccountSection label="Email">
      <p className="m-0 text-sm">{current}</p>
      <p className="m-0 text-sm text-muted-foreground">Your creatives, uploads and history stay with your account when you change your email.</p>

      {sentTo === null
        ? <form onSubmit={sendCode} className="flex flex-col gap-3">
          <input className={field} type="email" required autoComplete="email" aria-label="New email address" placeholder="New email address"
            value={email} onChange={event => setEmail(event.target.value)} />
          <div className="flex justify-end"><Button type="submit" disabled={busy || !email.trim()}>Send code</Button></div>
        </form>
        : <form onSubmit={confirm} className="flex flex-col gap-3">
          <p className="m-0 text-sm text-muted-foreground">We sent a code to {sentTo}. Enter it to confirm.</p>
          <input className={`${field} tracking-[0.4em]`} inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={6} aria-label="Code from your email" placeholder="000000"
            value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} />
          <div className="flex items-center justify-between gap-3">
            <button type="button" className="cursor-pointer bg-transparent p-0 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              onClick={() => { setSentTo(null); setError(''); }}>Use a different email</button>
            <Button type="submit" disabled={busy || code.length !== 6}>Confirm</Button>
          </div>
        </form>}

      {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="m-0 text-sm text-primary">{notice}</p>}
    </AccountSection>
  </AccountColumn>;
}
