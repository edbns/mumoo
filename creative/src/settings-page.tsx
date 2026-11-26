import { CheckIcon, CopyIcon, Trash2Icon } from '@/components/icons';
import { useRef, useState, type FormEvent } from 'react';
import { FIELD, POPUP_FIELD } from '@/components/ui/field';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Button } from '@/components/ui/button';
import { authClient, confirmEmailChange, deleteAccount, requestEmailChange } from './account';
import { AccountColumn, AccountSection } from './account-section';
import { friendlyError } from './friendly-error';

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
      setError(friendlyError(cause, 'That didn’t work. Try again in a sec.'));
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
      <p className="m-0 text-sm text-muted-foreground">Your videos, uploads and history stay with your account when you change email.</p>

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
            <Button variant="secondary" size="sm" onClick={() => { setSentTo(null); setError(''); }}>Use a different email</Button>
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
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const matches = Boolean(email) && typed.trim().toLowerCase() === email.toLowerCase();

  return <AccountSection label="Delete account">
    <p className="m-0 text-sm text-muted-foreground">Permanently deletes your account, videos, uploads and history. Can’t be undone. Download what you want first.</p>
    <div className="flex justify-end"><Button variant="destructive" onClick={() => { setTyped(''); setCopied(false); setOpen(true); }}><Trash2Icon aria-hidden="true" />Delete account</Button></div>
    <ActionDialog open={open} onClose={() => setOpen(false)} destructive
      title="Delete your account?"
      description="This permanently deletes your videos, uploads and history. Can’t be undone."
      cancelLabel="Keep my account" confirmLabel="Delete everything" confirmDisabled={!matches}
      working="Deleting…" done="Deleted" initialFocusRef={field}
      onConfirm={() => deleteAccount(typed.trim())} onDone={() => location.assign('/')}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="m-0 text-center leading-6 text-muted-foreground">
          Type{' '}
          <strong className="break-all text-foreground">{email}</strong>{' '}
          <button type="button" aria-label={copied ? 'Email copied' : 'Copy your email'}
            className="-mx-1 inline-grid size-6 cursor-pointer place-items-center rounded-md border-0 bg-transparent p-0 align-middle text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            onClick={() => void navigator.clipboard.writeText(email).then(() => setCopied(true))}>
            {copied ? <CheckIcon aria-hidden="true" className="size-3.5 text-primary" /> : <CopyIcon aria-hidden="true" className="size-3.5" />}
          </button>{' '}
          to confirm.
        </p>
        <input ref={field} className={POPUP_FIELD} type="email" autoComplete="off" aria-label="Your email, to confirm" placeholder="Your email" value={typed} onChange={event => setTyped(event.target.value)} />
      </div>
    </ActionDialog>
  </AccountSection>;
}
