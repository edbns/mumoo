import { useEffect, useRef, useState } from 'react';
import { BarChart3Icon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Button } from '@/components/ui/button';
import { authClient, checkSignInCode, sendSignInCode, signInWithGoogle } from './account';
import type { AccountPage } from './account-pages';
import { EmptyState } from './account-section';
import LinkAnalytics from './link-analytics';
import { SignInDialog } from './sign-in-dialog';
import { CopyButton, Cover, OpenButton, iconButton } from './smart-link-parts';
import { LABELS, addressOf, deletePublished, knownLinks, listLinks, openForEdit, rememberLinks, type Published, type Service } from './smart-links';

const LINK_PARAM = 'link';

/**
 * My Smart Links: the person's published links with their visits, clicks and engagement, each opening its own analytics page
 * (`link-analytics.tsx`, kept in the address as ?link=). A link is changed in Create Smart Link, which opens on it. Every link here
 * opens in a new tab.
 */
export default function MyLinksPage({ onNavigate }: { onNavigate: (page: AccountPage) => void }) {
  const session = authClient.useSession();
  const user = session.data?.user;
  const [links, setLinks] = useState<Published[] | null>(null);
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  /** The link being asked about, then deleted. */
  const [deleting, setDeleting] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(location.search).get(LINK_PARAM));
  const signInAddress = useRef('');

  useEffect(() => {
    if (!user) return;
    let live = true;
    setLinks(current => current ?? knownLinks(user.id));
    listLinks(user.id).then(found => { if (live) setLinks(found); },
      (cause: Error) => { if (live) { setLinks(current => current ?? []); setError(cause.message || 'Your links could not be loaded. Try again in a moment.'); } });
    return () => { live = false; };
  }, [user?.id]);
  useEffect(() => { if (user && links) rememberLinks(user.id, links); }, [user?.id, links]);

  function show(slug: string | null) {
    setOpen(slug);
    const address = new URL(location.href);
    if (slug) address.searchParams.set(LINK_PARAM, slug); else address.searchParams.delete(LINK_PARAM);
    history.replaceState(history.state, '', address);
    window.scrollTo({ top: 0 });
  }

  function edit(item: Published) {
    openForEdit(item);
    onNavigate('links');
  }

  async function remove(slug: string) {
    await deletePublished(slug);
    setLinks(current => (current ?? []).filter(other => other.slug !== slug));
    if (open === slug) show(null);
  }

  const shown = links ?? (user ? knownLinks(user.id) : null);
  const opened = open ? shown?.find(item => item.slug === open) : null;
  const loading = session.isPending || (Boolean(user) && !shown);

  return <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-4 px-6 pb-24 pt-6">
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
    {!session.isPending && !user && <EmptyState action={<Button onClick={() => setSigningIn(true)}>Sign in</Button>}>
      Sign in to see your smart links and their analytics.
    </EmptyState>}
    {loading && <ul aria-busy="true" aria-label="Loading your smart links" className="m-0 flex list-none flex-col gap-3 p-0">
      {[0, 1, 2].map(index => <li key={index} className="flex items-center gap-4 rounded-[var(--radius-panel)] bg-background p-4">
        <span className="size-14 shrink-0 animate-pulse rounded-[6px] bg-muted" />
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="h-3.5 w-40 max-w-full animate-pulse rounded-full bg-muted" />
          <span className="h-3 w-24 animate-pulse rounded-full bg-muted" />
        </span>
        <span className="hidden h-8 w-48 animate-pulse rounded-full bg-muted md:block" />
      </li>)}
    </ul>}
    {user && shown?.length === 0 && !error && <EmptyState
      action={<Button onClick={() => onNavigate('links')}><PlusIcon aria-hidden="true" className="size-4" />Create Smart Link</Button>}>
      No smart links yet. Make one for your song: one link that opens in every fan’s app.
    </EmptyState>}
    {opened && <LinkAnalytics item={opened} onBack={() => show(null)} onEdit={() => edit(opened)} />}
    {!opened && shown && shown.length > 0 && <ul className="m-0 flex list-none flex-col gap-3 p-0 animate-in fade-in-0 duration-300">
      {shown.map(item => <LinkRow key={item.slug} item={item} onOpen={() => show(item.slug)} onEdit={() => edit(item)} onDelete={() => setDeleting(item.slug)} />)}
    </ul>}

    <ActionDialog open={deleting !== null} onClose={() => setDeleting(null)} destructive
      title={`Delete ${deleting ? addressOf(deleting).replace(/^https?:\/\//, '') : 'this link'}?`}
      description="Anyone who opens it will find nothing, and its analytics go too. This cannot be undone."
      confirmLabel="Delete link" working="Deleting…" onConfirm={() => remove(deleting!)} />

    <SignInDialog open={signingIn} onClose={() => setSigningIn(false)}
      onSendCode={async email => { await sendSignInCode(email); signInAddress.current = email; }}
      onCheckCode={async code => { await checkSignInCode(signInAddress.current, code); return true; }}
      onGoogle={async () => { await signInWithGoogle(); await session.refetch(); }} />
  </main>;
}

/** One link: its song and address, its numbers, its most pressed services, and what can be done with it. */
function LinkRow({ item, onOpen, onEdit, onDelete }: { item: Published; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const address = addressOf(item.slug);
  const views = item.views ?? 0;
  const clicks = item.clicks ?? 0;
  const top = (Object.entries(item.services ?? {}) as [Service, number][]).sort(([, a], [, b]) => b - a).slice(0, 3);
  return <li className="grid items-center gap-x-6 gap-y-4 rounded-[var(--radius-panel)] bg-background p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
    <a href={address} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3 text-foreground no-underline hover:opacity-80">
      <Cover src={item.link.cover} size="size-14" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{item.link.title}</span>
        <span className="block truncate text-sm text-muted-foreground">{item.link.artist}</span>
        <span className="block truncate text-xs text-muted-foreground">{address.replace(/^https?:\/\//, '')}</span>
      </span>
    </a>
    <dl className="m-0 grid grid-cols-3 gap-3">
      <Figure label="Visits" value={views.toLocaleString()} />
      <Figure label="Clicks" value={clicks.toLocaleString()} />
      <Figure label="Engagement" value={views ? `${Math.round(Math.min(1, clicks / views) * 100)}%` : '–'} />
    </dl>
    <ul aria-label="Most pressed" className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
      {top.length === 0 && <li className="text-muted-foreground">No clicks yet</li>}
      {top.map(([service, count]) => <li key={service} className="flex items-center gap-2">
        <img src={`/logos/${service}.svg`} alt="" className="size-4 shrink-0 object-contain" />
        <span className="min-w-0 flex-1 truncate">{LABELS[service]}</span>
        <span className="tabular-nums text-muted-foreground">{count.toLocaleString()}{clicks ? ` · ${Math.round((count / clicks) * 100)}%` : ''}</span>
      </li>)}
    </ul>
    <div className="flex items-center gap-1 justify-self-end">
      <button type="button" className={iconButton} aria-label={`Analytics for ${item.slug}`} title="Analytics" onClick={onOpen}><BarChart3Icon className="size-4" /></button>
      <CopyButton text={address} />
      <OpenButton slug={item.slug} />
      <button type="button" className={iconButton} aria-label={`Edit ${item.slug}`} onClick={onEdit}><PencilIcon className="size-4" /></button>
      <button type="button" className={iconButton} aria-label={`Delete ${item.slug}`} onClick={onDelete}><Trash2Icon className="size-4" /></button>
    </div>
  </li>;
}

function Figure({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="m-0 text-lg font-semibold tabular-nums">{value}</dd>
  </div>;
}
