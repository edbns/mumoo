import { useState, type FormEvent } from 'react';
import { FIELD, POPUP_FIELD } from '@/components/ui/field';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Button } from '@/components/ui/button';
import { authClient, confirmEmailChange, deleteAccount, requestEmailChange } from './account';
import { AccountColumn, AccountSection } from './account-section';

/** How long the confirmation is read before the page reloads. */
const RELOAD_MS = 2000;

/** In a popup, which is itself the muted grey, a field is drawn in the page's dark so it can be seen before it is clicked. */

/** The person's settings: changing the email (with a code sent to the new address, so everything they made stays with them), and deleting the account. */
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
      setError(cause instanceof Error ? cause.message : 'That didn’t work. Try again in a sec.');
    } finally { setBusy(false); }
  }

  function sendCode(event: FormEvent) {
    event.preventDefault();
    const next = email.trim();
    if (next.toLowerCase() === current.toLowerCase()) { setError('That’s already your email.'); return; }
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
      <p className="m-0 text-sm text-muted-foreground">Your creatives, uploads and history stay with your account when you change email.</p>

      {sentTo === null
        ? <form onSubmit={sendCode} className="flex flex-col gap-3">
          <input className={FIELD} type="email" required autoComplete="email" aria-label="New email address" placeholder="New email address"
            value={email} onChange={event => setEmail(event.target.value)} />
          <div className="flex justify-end"><Button type="submit" disabled={busy || !email.trim()}>Send code</Button></div>
        </form>
        : <form onSubmit={confirm} className="flex flex-col gap-3">
          <p className="m-0 text-sm text-muted-foreground">We sent a code to {sentTo}. Enter it to confirm.</p>
          <input className={`${FIELD} tracking-[0.4em]`} inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={6} aria-label="Code from your email" placeholder="000000"
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
    <DeleteAccount email={current} />
  </AccountColumn>;
}

/** Deleting the account for good: the person types their email to confirm, since nothing can be brought back. */
function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const matches = Boolean(email) && typed.trim().toLowerCase() === email.toLowerCase();

  return <AccountSection label="Delete account">
    <p className="m-0 text-sm text-muted-foreground">Deletes your account and everything in it: creatives, pictures and history. Can’t be undone. Download what you want first.</p>
    <div className="flex justify-end"><Button variant="destructive" onClick={() => { setTyped(''); setOpen(true); }}>Delete account</Button></div>
    <ActionDialog open={open} onClose={() => setOpen(false)} destructive
      title="Delete your account?"
      description="Your creatives, pictures and history get deleted for good. Can’t be undone."
      cancelLabel="Keep my account" confirmLabel="Delete everything" confirmDisabled={!matches}
      working="Deleting…"
      onConfirm={() => deleteAccount(typed.trim())} onDone={() => location.assign('/')}>
      <label className="flex flex-col gap-3 text-sm">
        <span className="text-center text-muted-foreground">Type <strong className="break-all text-foreground">{email}</strong> to confirm.</span>
        <input className={POPUP_FIELD} type="email" autoComplete="off" autoFocus aria-label="Your email, to confirm" placeholder="Your email" value={typed} onChange={event => setTyped(event.target.value)} />
      </label>
    </ActionDialog>
  </AccountSection>;
}
