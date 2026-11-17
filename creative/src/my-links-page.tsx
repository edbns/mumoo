import { useEffect, useRef, useState } from 'react';
import { BarChart3Icon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authClient, checkSignInCode, sendSignInCode, signInWithGoogle } from './account';
import type { AccountPage } from './account-pages';
import LinkAnalytics from './link-analytics';
import { SignInDialog } from './sign-in-dialog';
import { CopyButton, Cover, OpenButton, iconButton } from './smart-link-parts';
import { LABELS, addressOf, deletePublished, listLinks, openForEdit, type Published, type Service, type Tracking } from './smart-links';

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
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(location.search).get(LINK_PARAM));
  const signInAddress = useRef('');

  useEffect(() => {
    if (!user) return;
    let live = true;
    listLinks().then(found => { if (live) setLinks(found); },
      (cause: Error) => { if (live) { setLinks([]); setError(cause.message || 'Your links could not be loaded. Try again in a moment.'); } });
    return () => { live = false; };
  }, [user?.id]);

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
    if (!window.confirm(`Delete ${addressOf(slug)}? Anyone who opens it will find nothing, and its analytics go too. This cannot be undone.`)) return;
    try {
      await deletePublished(slug);
      setLinks(current => (current ?? []).filter(other => other.slug !== slug));
      if (open === slug) show(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Try again in a moment.');
    }
  }

  function tracked(slug: string, tracking: Tracking) {
    setLinks(current => (current ?? []).map(item => item.slug === slug ? { ...item, tracking } : item));
  }

  const opened = open ? links?.find(item => item.slug === open) : null;

  return <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-6 pb-24 pt-6">
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
    {!session.isPending && !user && <div className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="m-0 text-sm text-muted-foreground">Sign in to see your smart links and their analytics.</p>
      <Button onClick={() => setSigningIn(true)}>Sign in</Button>
    </div>}
    {user && links?.length === 0 && !error && <div className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="m-0 text-sm text-muted-foreground">No smart links yet. Make one for your song: one link that opens in every fan’s app.</p>
      <Button onClick={() => onNavigate('links')}><PlusIcon aria-hidden="true" className="size-4" />Create Smart Link</Button>
    </div>}
    {opened && <LinkAnalytics item={opened} onBack={() => show(null)} onEdit={() => edit(opened)} onTracking={tracking => tracked(opened.slug, tracking)} />}
    {!opened && links && links.length > 0 && <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {links.map(item => <LinkRow key={item.slug} item={item} onOpen={() => show(item.slug)} onEdit={() => edit(item)} onDelete={() => void remove(item.slug)} />)}
    </ul>}

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
      <Button variant="secondary" className="mr-1" onClick={onOpen}><BarChart3Icon aria-hidden="true" className="size-4" />Analytics</Button>
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
