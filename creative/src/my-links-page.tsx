import { useEffect, useRef, useState } from 'react';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authClient, checkSignInCode, sendSignInCode, signInWithGoogle } from './account';
import type { AccountPage } from './account-pages';
import { SignInDialog } from './sign-in-dialog';
import { SOURCE_LABELS, type Source } from '../netlify/lib/traffic-source.mjs';
import { CopyButton, CopyTextButton, Cover, OpenButton, iconButton } from './smart-link-parts';
import { LABELS, addressOf, deletePublished, listLinks, openForEdit, type Published, type Service } from './smart-links';

/**
 * My Smart Links: the person's published links, each with how many times fans pressed each button (counted on the server per day,
 * with nothing about the fans). A link is changed in Create Smart Link, which opens on it. Every link here opens in a new tab.
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
    openForEdit(item);
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

  return <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-6 pb-24 pt-6">
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
    {!session.isPending && !user && <div className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="m-0 text-sm text-muted-foreground">Sign in to see your smart links and how many fans pressed each button.</p>
      <Button onClick={() => setSigningIn(true)}>Sign in</Button>
    </div>}
    {user && links?.length === 0 && !error && <div className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="m-0 text-sm text-muted-foreground">No smart links yet. Make one for your song: one link that opens in every fan’s app.</p>
      <Button onClick={() => onNavigate('links')}><PlusIcon aria-hidden="true" className="size-4" />Create Smart Link</Button>
    </div>}
    {links && links.length > 0 && <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {links.map(item => <LinkRow key={item.slug} item={item} onEdit={() => edit(item)} onDelete={() => void remove(item.slug)} />)}
    </ul>}

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
  const shown = item.link.services.filter(row => !row.hidden).map(row => ({ service: row.service, url: row.url, count: clicks[row.service] ?? 0 }));
  const gone = (Object.keys(clicks) as Service[]).filter(service => !shown.some(row => row.service === service))
    .map(service => ({ service, url: null, count: clicks[service] ?? 0 }));
  const rows = [...shown, ...gone].sort((a, b) => b.count - a.count);
  const most = Math.max(1, ...rows.map(row => row.count));
  return <li className="flex flex-col gap-4 rounded-[var(--radius-panel)] bg-background p-5">
    <div className="flex items-center gap-3">
      <a href={address} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3 text-foreground no-underline hover:opacity-80">
        <Cover src={item.link.cover} size="size-14" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{item.link.title} · {item.link.artist}</span>
          <span className="block truncate text-sm text-muted-foreground">{address.replace(/^https?:\/\//, '')}</span>
        </span>
      </a>
      <CopyButton text={address} />
      <OpenButton slug={item.slug} />
      <button type="button" className={iconButton} aria-label={`Edit ${item.slug}`} onClick={onEdit}><PencilIcon className="size-4" /></button>
      <button type="button" className={iconButton} aria-label={`Delete ${item.slug}`} onClick={onDelete}><Trash2Icon className="size-4" /></button>
    </div>
    <div className="grid gap-x-8 gap-y-4 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex gap-6 sm:flex-col sm:gap-3">
        <Stat label="Opens" value={item.views ?? 0} />
        <Stat label="Clicks" value={total} />
        <Stat label="Clicks, last 7 days" value={item.week ?? 0} />
      </div>
      <ul aria-label={`Clicks per button for ${item.slug}`} className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map(row => <li key={row.service} className="flex items-center gap-3 text-sm">
          <img src={`/logos/${row.service}.svg`} alt="" className="size-5 shrink-0 object-contain" />
          {row.url
            ? <a href={row.url} target="_blank" rel="noreferrer" className="w-28 shrink-0 truncate text-foreground underline-offset-4 hover:underline">{LABELS[row.service]}</a>
            : <span className="w-28 shrink-0 truncate text-muted-foreground">{LABELS[row.service]}</span>}
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${(row.count / most) * 100}%` }} />
          </span>
          <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{row.count}</span>
        </li>)}
      </ul>
    </div>
    <Sources item={item} address={address} />
    {total === 0 && <p className="m-0 text-xs text-muted-foreground">No clicks yet. Each time a fan presses a button, it’s counted here: only the number, nothing about the fan.</p>}
  </li>;
}

/** The address with the tags that mark a visit as coming from a Meta ad (Meta adds its click ID to ads and posts alike). */
const forMetaAds = (address: string) => `${address}?utm_source=meta&utm_medium=paid`;

/** Opens and clicks per traffic source, most opened first, with how many of the opens went on to a service. */
function Sources({ item, address }: { item: Published; address: string }) {
  const rows = (Object.entries(item.sources ?? {}) as [Source, { views: number; clicks: number }][])
    .sort(([, a], [, b]) => b.views - a.views || b.clicks - a.clicks);
  return <div className="flex flex-col gap-2 border-t border-border pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="m-0 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Where fans came from</p>
      <CopyTextButton text={forMetaAds(address)} label="Copy link for Meta ads" />
    </div>
    {rows.length > 0 && <table className="w-full border-collapse text-sm">
      <thead><tr className="text-left text-xs text-muted-foreground">
        <th className="py-1 font-normal">Source</th><th className="w-20 py-1 text-right font-normal">Opens</th>
        <th className="w-20 py-1 text-right font-normal">Clicks</th><th className="w-24 py-1 text-right font-normal">Opens → app</th>
      </tr></thead>
      <tbody>{rows.map(([source, counts]) => <tr key={source}>
        <td className="py-1">{SOURCE_LABELS[source] ?? source}</td>
        <td className="py-1 text-right tabular-nums">{counts.views}</td>
        <td className="py-1 text-right tabular-nums">{counts.clicks}</td>
        <td className="py-1 text-right tabular-nums text-muted-foreground">{counts.views ? `${Math.min(100, Math.round((counts.clicks / counts.views) * 100))}%` : '–'}</td>
      </tr>)}</tbody>
    </table>}
    <p className="m-0 text-xs text-muted-foreground">
      Running Meta ads? Use the Meta ads link as the ad’s website, so its fans show as “Meta ads” here. TikTok and Google ads are recognised by themselves.
    </p>
  </div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div>
    <p className="m-0 text-2xl font-semibold tabular-nums">{value}</p>
    <p className="m-0 text-xs text-muted-foreground">{label}</p>
  </div>;
}
