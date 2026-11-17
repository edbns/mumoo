import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, ExternalLinkIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authClient, checkSignInCode, sendSignInCode, signInWithGoogle } from './account';
import { AccountSection } from './account-section';
import { SignInDialog } from './sign-in-dialog';
import {
  EMPTY_DRAFT, LABELS, addressOf, checkSlug, deletePublished, draftOf, fieldsOf, isSearch, listLinks, loadDraft, lookupSong, publishDraft, saveDraft, suggestSlug,
  type Candidate, type Draft, type Published, type ServiceRow,
} from './smart-links';

/** How long the name rests before it is checked. */
const CHECK_PAUSE_MS = 400;
const COPIED_MS = 1500;

const field = 'h-10 w-full min-w-0 rounded-[var(--radius-control)] bg-muted px-3 text-sm text-foreground outline-ring placeholder:text-muted-foreground focus-visible:outline-2';
const textButton = 'cursor-pointer bg-transparent p-0 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground';
const iconButton = 'grid size-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-control)] bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30';

/**
 * Smart links: one page for a song, with a button for every service. Free, and open before signing in: the draft stays in this
 * browser, and only publishing asks the artist to sign in (Google or email). Signed in, their published links are listed below.
 */
export default function LinksPage() {
  const session = authClient.useSession();
  const user = session.data?.user;
  const [draft, setDraft] = useState<Draft>(loadDraft);
  useEffect(() => saveDraft(draft), [draft]);
  const [busy, setBusy] = useState<'find' | 'pick' | 'publish' | null>(null);
  const [error, setError] = useState('');
  const [links, setLinks] = useState<Published[] | null>(null);
  const [published, setPublished] = useState<Published | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  /** Publish was pressed while signed out: it goes ahead once they are signed in. */
  const publishWhenIn = useRef(false);
  const signInAddress = useRef('');

  useEffect(() => {
    if (!user) return;
    let live = true;
    listLinks().then(found => { if (live) setLinks(found); }, () => { if (live) setLinks([]); });
    return () => { live = false; };
  }, [user?.id]);

  const slug = useSlugCheck(draft.editing ? '' : draft.slug);
  const link = draft.link;
  const ready = Boolean(link && link.title.trim() && link.artist.trim() && link.services.some(row => !row.hidden)
    && (draft.editing || slug.free));

  async function run(kind: NonNullable<typeof busy>, work: () => Promise<void>) {
    setBusy(kind); setError('');
    try { await work(); } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Try again in a moment.');
    } finally { setBusy(null); }
  }

  function change(update: (current: Draft) => Draft) {
    setPublished(null);
    setDraft(update);
  }

  function find(event: FormEvent) {
    event.preventDefault();
    const url = draft.url.trim();
    void run('find', async () => {
      const song = await lookupSong(url);
      const fields = fieldsOf(url, song);
      change(current => ({ ...current, url, link: fields, candidates: song.confident ? null : song.candidates ?? [],
        slug: current.editing ? current.slug : suggestSlug(fields.artist, fields.title) }));
    });
  }

  function pick(candidate: Candidate) {
    if (!link) return;
    void run('pick', async () => {
      const song = await lookupSong(link.source, candidate.pick);
      if (!song.confident) throw new Error('That song does not have this link’s title. Pick another, or correct the details below.');
      const fields = fieldsOf(link.source, song);
      change(current => ({ ...current, link: fields, candidates: null, slug: current.editing ? current.slug : suggestSlug(fields.artist, fields.title) }));
    });
  }

  function edit(fields: Partial<NonNullable<Draft['link']>>) {
    change(current => current.link ? { ...current, link: { ...current.link, ...fields } } : current);
  }

  function setRow(index: number, row: Partial<ServiceRow>) {
    if (link) edit({ services: link.services.map((current, at) => at === index ? { ...current, ...row } : current) });
  }

  function move(index: number, by: -1 | 1) {
    if (!link) return;
    const services = [...link.services];
    [services[index], services[index + by]] = [services[index + by], services[index]];
    edit({ services });
  }

  function publish() {
    if (!user) { publishWhenIn.current = true; setSigningIn(true); return; }
    void run('publish', async () => {
      const done = await publishDraft(draft);
      setLinks(current => [done, ...(current ?? []).filter(other => other.slug !== done.slug)]);
      setDraft(EMPTY_DRAFT);
      setPublished(done);
    });
  }
  const publishLatest = useRef(publish);
  publishLatest.current = publish;
  useEffect(() => {
    if (user && publishWhenIn.current) { publishWhenIn.current = false; publishLatest.current(); }
  }, [user]);

  async function remove(slug: string) {
    if (!window.confirm(`Delete ${addressOf(slug)}? Anyone who opens it will find nothing. This cannot be undone.`)) return;
    try {
      await deletePublished(slug);
      setLinks(current => (current ?? []).filter(other => other.slug !== slug));
      if (draft.editing === slug) setDraft(EMPTY_DRAFT);
      if (published?.slug === slug) setPublished(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Try again in a moment.');
    }
  }

  return <main className="mx-auto grid w-full max-w-[1040px] items-start gap-4 px-6 pb-24 pt-6 md:grid-cols-[minmax(0,1fr)_300px]">
    <div className="flex min-w-0 flex-col gap-4">
      {published && <AccountSection label={published.updated_at === published.created_at ? 'Your link is live' : 'Your changes are live'}>
        <AddressLine slug={published.slug} />
        <p className="m-0 text-sm text-muted-foreground">Put it in your bio and posts. Every fan gets the button for the app they use.</p>
      </AccountSection>}

      <AccountSection label={draft.editing ? 'Editing your link' : 'Smart link'} aside={(draft.url || link) &&
        <button type="button" className={textButton} onClick={() => { setDraft(EMPTY_DRAFT); setError(''); }}>{draft.editing ? 'Cancel' : 'Start again'}</button>}>
        {!draft.editing && !link && <p className="m-0 text-sm text-muted-foreground">One link for your song that opens in every fan’s app: Spotify, Apple Music, YouTube and more. Free.</p>}
        <form onSubmit={find} className="flex gap-2">
          <input className={field} type="url" inputMode="url" required aria-label="Song link" placeholder="Paste your song’s Spotify, Apple Music or YouTube link"
            value={draft.url} onChange={event => setDraft(current => ({ ...current, url: event.target.value }))} />
          <Button type="submit" className="h-10" disabled={!draft.url.trim() || busy !== null}>{busy === 'find' ? 'Finding…' : 'Find'}</Button>
        </form>
        {draft.candidates && draft.candidates.length > 0 && <div className="flex flex-col gap-2">
          <p className="m-0 text-sm">Is this your song?</p>
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {draft.candidates.map(candidate => <li key={candidate.pick}>
              <button type="button" disabled={busy !== null} onClick={() => pick(candidate)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] bg-muted p-2 text-left text-sm hover:bg-accent disabled:opacity-50">
                <Cover src={candidate.cover} size="size-10" />
                <span className="min-w-0"><span className="block truncate">{candidate.title}</span><span className="block truncate text-muted-foreground">{candidate.artist}</span></span>
              </button>
            </li>)}
          </ul>
          <button type="button" className={`${textButton} self-start`} onClick={() => change(current => ({ ...current, candidates: null }))}>None of these: I’ll correct the details</button>
        </div>}
        {link && <div className="grid gap-3 sm:grid-cols-2">
          <label className="m-0 flex flex-col gap-1.5 text-xs text-muted-foreground">Title
            <input className={field} value={link.title} maxLength={200} onChange={event => edit({ title: event.target.value })} />
          </label>
          <label className="m-0 flex flex-col gap-1.5 text-xs text-muted-foreground">Artist
            <input className={field} value={link.artist} maxLength={200} onChange={event => edit({ artist: event.target.value })} />
          </label>
        </div>}
        {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
      </AccountSection>

      {link && <AccountSection label="Buttons">
        <p className="m-0 text-sm text-muted-foreground">“Search” buttons open a search for your song on that service. Paste your song’s own link there to send fans straight to it.</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {link.services.map((row, index) => <li key={row.service} className={`flex items-center gap-2 ${row.hidden ? 'opacity-50' : ''}`}>
            <span className="w-28 shrink-0 text-sm">{LABELS[row.service]}</span>
            <input className={field} type="url" aria-label={`${LABELS[row.service]} link`} value={row.url}
              onChange={event => setRow(index, { url: event.target.value, exact: !isSearch(event.target.value) })} />
            <span className={`w-14 shrink-0 text-xs ${row.exact ? 'text-primary' : 'text-muted-foreground'}`}>{row.exact ? 'Song' : 'Search'}</span>
            <button type="button" className={iconButton} aria-label={`Move ${LABELS[row.service]} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUpIcon className="size-4" /></button>
            <button type="button" className={iconButton} aria-label={`Move ${LABELS[row.service]} down`} disabled={index === link.services.length - 1} onClick={() => move(index, 1)}><ArrowDownIcon className="size-4" /></button>
            <button type="button" className={iconButton} aria-label={row.hidden ? `Show ${LABELS[row.service]}` : `Hide ${LABELS[row.service]}`} aria-pressed={row.hidden}
              onClick={() => setRow(index, { hidden: !row.hidden })}>{row.hidden ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}</button>
          </li>)}
        </ul>
      </AccountSection>}

      {link && <AccountSection label="Address">
        {draft.editing
          ? <><AddressLine slug={draft.editing} /><p className="m-0 text-sm text-muted-foreground">The address stays the same, so where you shared it keeps working.</p></>
          : <>
            <label className="m-0 flex items-center gap-1 rounded-[var(--radius-control)] bg-muted pl-3 text-sm text-muted-foreground">
              <span className="shrink-0">{location.host}/l/</span>
              <input className={`${field} pl-0`} aria-label="Your link’s name" value={draft.slug} maxLength={40} autoCapitalize="off" spellCheck={false}
                onChange={event => change(current => ({ ...current, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') }))} />
            </label>
            <p role="status" className={`m-0 text-sm ${slug.free ? 'text-primary' : slug.error ? 'text-destructive' : 'text-muted-foreground'}`}>
              {!draft.slug ? 'Choose a name for your link.' : slug.free ? 'This name is free.' : slug.error || 'Checking…'}
            </p>
          </>}
        <div className="flex items-center justify-end gap-3">
          {!user && <span className="text-sm text-muted-foreground">You’ll sign in to publish.</span>}
          <Button disabled={!ready || busy !== null} onClick={publish}>
            {busy === 'publish' ? 'Publishing…' : draft.editing ? 'Save changes' : 'Publish'}
          </Button>
        </div>
      </AccountSection>}

      {user && links && links.length > 0 && <AccountSection label="Your links">
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {links.map(item => <li key={item.slug} className="flex items-center gap-3">
            <Cover src={item.link.cover} size="size-10" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block truncate">{item.link.title} · {item.link.artist}</span>
              <a className="block truncate text-muted-foreground hover:text-foreground" href={addressOf(item.slug)} target="_blank" rel="noreferrer">{addressOf(item.slug).replace(/^https?:\/\//, '')}</a>
            </span>
            <CopyButton text={addressOf(item.slug)} />
            <button type="button" className={iconButton} aria-label={`Edit ${item.slug}`} onClick={() => { setPublished(null); setError(''); setDraft(draftOf(item)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><PencilIcon className="size-4" /></button>
            <button type="button" className={iconButton} aria-label={`Delete ${item.slug}`} onClick={() => void remove(item.slug)}><Trash2Icon className="size-4" /></button>
          </li>)}
        </ul>
      </AccountSection>}
    </div>

    {link && <FanPreview link={link} />}

    <SignInDialog open={signingIn} onClose={() => setSigningIn(false)}
      onSendCode={async email => { await sendSignInCode(email); signInAddress.current = email; }}
      onCheckCode={async code => { await checkSignInCode(signInAddress.current, code); return true; }}
      onGoogle={async () => { await signInWithGoogle(); await session.refetch(); }} />
  </main>;
}

/** Whether the wanted name is free, checked once the typing rests. */
function useSlugCheck(name: string) {
  const [state, setState] = useState<{ name: string; free: boolean; error?: string } | null>(null);
  useEffect(() => {
    if (!name) return;
    let live = true;
    const timer = window.setTimeout(() => {
      checkSlug(name).then(result => { if (live) setState({ name, ...result }); }, (cause: Error) => { if (live) setState({ name, free: false, error: cause.message }); });
    }, CHECK_PAUSE_MS);
    return () => { live = false; window.clearTimeout(timer); };
  }, [name]);
  return state?.name === name ? state : { name, free: false };
}

function Cover({ src, size }: { src: string | null; size: string }) {
  return src ? <img src={src} alt="" className={`${size} shrink-0 rounded-[4px] object-cover`} /> : <span className={`${size} shrink-0 rounded-[4px] bg-muted`} />;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className={iconButton} aria-label={copied ? 'Copied' : 'Copy link'}
    onClick={() => void navigator.clipboard.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), COPIED_MS); })}>
    {copied ? <CheckIcon className="size-4 text-primary" /> : <CopyIcon className="size-4" />}
  </button>;
}

function AddressLine({ slug }: { slug: string }) {
  const address = addressOf(slug);
  return <div className="flex items-center gap-2 rounded-[var(--radius-control)] bg-muted py-1 pl-3 pr-1">
    <span className="min-w-0 flex-1 truncate text-sm">{address.replace(/^https?:\/\//, '')}</span>
    <CopyButton text={address} />
    <a className={iconButton} href={address} target="_blank" rel="noreferrer" aria-label="Open link"><ExternalLinkIcon className="size-4" /></a>
  </div>;
}

/** Roughly what a fan will see: the cover, the song, and the buttons the artist kept, in their order. */
function FanPreview({ link }: { link: NonNullable<Draft['link']> }) {
  return <aside aria-label="Preview" className="sticky top-20 hidden flex-col items-center gap-3 overflow-hidden rounded-[var(--radius-panel)] bg-background p-5 md:flex">
    <p className="m-0 self-start text-xs font-semibold uppercase tracking-widest text-muted-foreground">Preview</p>
    <Cover src={link.cover} size="size-40" />
    <div className="w-full text-center">
      <p className="m-0 truncate font-semibold">{link.title || 'Title'}</p>
      <p className="m-0 truncate text-sm text-muted-foreground">{link.artist || 'Artist'}</p>
    </div>
    <ul className="m-0 flex w-full list-none flex-col gap-2 p-0">
      {link.services.filter(row => !row.hidden).map(row => <li key={row.service} className="flex items-center justify-between rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm">
        {LABELS[row.service]}<span className="text-xs text-muted-foreground">Play</span>
      </li>)}
    </ul>
    <p className="m-0 text-[11px] text-muted-foreground">Powered by mumoo</p>
  </aside>;
}
