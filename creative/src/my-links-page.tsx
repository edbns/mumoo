import { useEffect, useRef, useState } from 'react';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authClient, checkSignInCode, sendSignInCode, signInWithGoogle } from './account';
import type { AccountPage } from './account-pages';
import { SignInDialog } from './sign-in-dialog';
import { CopyButton, Cover, LinksCard, OpenButton, iconButton } from './smart-link-parts';
import { LABELS, addressOf, deletePublished, draftOf, listLinks, saveDraft, type Published, type Service } from './smart-links';

/**
 * My Smart Links: the person's published links, each with how many times fans pressed each button (counted on the server per day,
 * with nothing about the fans). A link is changed in Create Smart Link, which it is put in as the draft.
 */
export default function MyLinksPage({ onNavigate }: { onNavigate: (page: AccountPage) => void }) {
  const session = authClient.useSession();
  const user = session.data?.user;
  const [links, setLinks] = useState<Published[] | null>(null);
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const signInAddress = useRef('');

  useEffect(() => {
    if (!user) return;
    let live = true;
    listLinks().then(found => { if (live) setLinks(found); },
      (cause: Error) => { if (live) { setLinks([]); setError(cause.message || 'Your links could not be loaded. Try again in a moment.'); } });
    return () => { live = false; };
  }, [user?.id]);

  function edit(item: Published) {
    saveDraft(draftOf(item));
    onNavigate('links');
  }

  async function remove(slug: string) {
    if (!window.confirm(`Delete ${addressOf(slug)}? Anyone who opens it will find nothing, and its clicks go too. This cannot be undone.`)) return;
    try {
      await deletePublished(slug);
      setLinks(current => (current ?? []).filter(other => other.slug !== slug));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Try again in a moment.');
    }
  }

  const create = <Button className="h-[var(--control-height-md)] px-5" onClick={() => onNavigate('links')}><PlusIcon className="size-4" aria-hidden />Create Smart Link</Button>;

  return <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-6 pb-24 pt-6">
    <LinksCard label="My Smart Links" aside={user && links && links.length > 0 && create}>
      {!session.isPending && !user && <div className="flex flex-col items-start gap-4 rounded-[var(--radius-panel)] bg-background p-5">
        <p className="m-0 text-sm text-muted-foreground">Sign in to see your smart links and how many fans pressed each button.</p>
        <Button className="h-[var(--control-height-md)] px-5" onClick={() => setSigningIn(true)}>Sign in</Button>
      </div>}
      {user && links === null && <p className="m-0 text-sm text-muted-foreground">Loading your links…</p>}
      {user && links?.length === 0 && !error && <div className="flex flex-col items-start gap-4 rounded-[var(--radius-panel)] bg-background p-5">
        <p className="m-0 text-sm text-muted-foreground">No smart links yet. Make one for your song: one link that opens in every fan’s app.</p>
        {create}
      </div>}
      {error && <p role="alert" className="m-0 mb-4 text-sm text-destructive">{error}</p>}
      {links && links.length > 0 && <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {links.map(item => <LinkRow key={item.slug} item={item} onEdit={() => edit(item)} onDelete={() => void remove(item.slug)} />)}
      </ul>}
    </LinksCard>

    <SignInDialog open={signingIn} onClose={() => setSigningIn(false)}
      onSendCode={async email => { await sendSignInCode(email); signInAddress.current = email; }}
      onCheckCode={async code => { await checkSignInCode(signInAddress.current, code); return true; }}
      onGoogle={async () => { await signInWithGoogle(); await session.refetch(); }} />
  </main>;
}

/** One link: its song, address and actions, then its clicks per button, most pressed first. */
function LinkRow({ item, onEdit, onDelete }: { item: Published; onEdit: () => void; onDelete: () => void }) {
  const address = addressOf(item.slug);
  const clicks = item.clicks ?? {};
  const total = Object.values(clicks).reduce((sum, count) => sum + (count ?? 0), 0);
  const shown = item.link.services.filter(row => !row.hidden).map(row => ({ service: row.service, count: clicks[row.service] ?? 0 }));
  const gone = (Object.keys(clicks) as Service[]).filter(service => !shown.some(row => row.service === service)).map(service => ({ service, count: clicks[service] ?? 0 }));
  const rows = [...shown, ...gone].sort((a, b) => b.count - a.count);
  const most = Math.max(1, ...rows.map(row => row.count));
  return <li className="flex flex-col gap-4 rounded-[var(--radius-panel)] bg-background p-5">
    <div className="flex items-center gap-3">
      <Cover src={item.link.cover} size="size-14" />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-medium">{item.link.title} · {item.link.artist}</p>
        <a className="block truncate text-sm text-muted-foreground hover:text-foreground" href={address} target="_blank" rel="noreferrer">{address.replace(/^https?:\/\//, '')}</a>
      </div>
      <CopyButton text={address} />
      <OpenButton slug={item.slug} />
      <button type="button" className={iconButton} aria-label={`Edit ${item.slug}`} onClick={onEdit}><PencilIcon className="size-4" /></button>
      <button type="button" className={iconButton} aria-label={`Delete ${item.slug}`} onClick={onDelete}><Trash2Icon className="size-4" /></button>
    </div>
    <div className="grid gap-x-8 gap-y-4 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex gap-6 sm:flex-col sm:gap-3">
        <Stat label="Clicks" value={total} />
        <Stat label="Last 7 days" value={item.week ?? 0} />
      </div>
      <ul aria-label={`Clicks per button for ${item.slug}`} className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map(row => <li key={row.service} className="flex items-center gap-3 text-sm">
          <img src={`/logos/${row.service}.svg`} alt="" className="size-5 shrink-0 object-contain" />
          <span className="w-28 shrink-0 truncate">{LABELS[row.service]}</span>
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${(row.count / most) * 100}%` }} />
          </span>
          <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{row.count}</span>
        </li>)}
      </ul>
    </div>
    {total === 0 && <p className="m-0 text-xs text-muted-foreground">No clicks yet. Each time a fan presses a button, it’s counted here: only the number, nothing about the fan.</p>}
  </li>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div>
    <p className="m-0 text-2xl font-semibold tabular-nums">{value}</p>
    <p className="m-0 text-xs text-muted-foreground">{label}</p>
  </div>;
}
