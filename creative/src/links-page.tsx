import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { FIELD } from '@/components/ui/field';
import { Reorder, useDragControls } from 'motion/react';
import { ExternalLinkIcon, EyeIcon, EyeOffIcon, GripVerticalIcon, PauseIcon, PlayIcon, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Iphone16Pro, SCREEN_RATIO, SCREEN_SHARE } from '@/components/ui/iphone-16-pro';
import { fanPage } from '../netlify/lib/fan-page.mjs';
import { authClient, checkSignInCode, sendSignInCode, signInWithGoogle } from './account';
import type { AccountPage } from './account-pages';
import { AccountSection } from './account-section';
import { AdTracking } from './ad-tracking';
import { AdsNextStep } from './smart-link-cta';
import { handSong } from './song-handoff';
import { SignInDialog } from './sign-in-dialog';
import { LinksSkeleton } from './links-skeleton';
import { AddressLine, Cover, iconButton, textButton } from './smart-link-parts';
import {
  EMPTY_DRAFT, LABELS, SERVICES, addressOf, asLink, checkSlug, fieldsOf, isSearch, listLinks, lookupSong, publishDraft, saveDraft,
  searchSongs, startingDraft, suggestSlug,
  type AdTokens, type Draft, type LinkFields, type Published, type SearchResult, type ServiceRow,
} from './smart-links';

/** How long typing rests before a name is checked or searched. */
const CHECK_PAUSE_MS = 400;
/** The phone's width on screen, and the width the fan page is laid out at inside it (an iPhone's). */
const PHONE_WIDTH = 320;
const PAGE_WIDTH = 390;

const field = FIELD;

/** One song to choose: found by its name, or a guess for a Spotify link we were not sure of. */
type Choice = { key: string; title: string; artist: string | null; cover: string | null; preview: string | null; choose: () => void };

/**
 * Create Smart Link: one page for a song, with a button for every service. Free, and open before signing in: the draft stays in this
 * browser, and only publishing asks the artist to sign in (Google or email). The phone on the right is the fan page itself.
 * A published link is opened here again from My Smart Links (`my-links-page.tsx`), which puts it in the draft.
 */
export default function LinksPage({ onNavigate }: { onNavigate: (page: AccountPage) => void }) {
  const session = authClient.useSession();
  const user = session.data?.user;
  const [draft, setDraft] = useState<Draft>(startingDraft);
  useEffect(() => saveDraft(draft), [draft]);
  const [busy, setBusy] = useState<'find' | 'pick' | 'publish' | null>(null);
  const [error, setError] = useState('');
  /** The page shows once the phone has drawn the fan page (or after a second at most), so the two arrive together. */
  const [phoneReady, setPhoneReady] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setPhoneReady(true), 1000); return () => clearTimeout(timer); }, []);
  const [published, setPublished] = useState<Published | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  /** Ad tokens typed for this link: only in memory, sent once with Publish. */
  const [tokens, setTokens] = useState<AdTokens>({});
  const player = usePreview();
  /** Publish was pressed while signed out: it goes ahead once they are signed in. */
  const publishWhenIn = useRef(false);
  const signInAddress = useRef('');

  const slug = useSlugCheck(draft.editing ? '' : draft.slug);
  const link = draft.link;
  const typedName = asLink(draft.url) ? '' : draft.url.trim();
  const found = useSongSearch(link ? '' : typedName);
  const ready = Boolean(link && link.title.trim() && link.artist.trim() && link.services.some(row => !row.hidden)
    && (draft.editing || slug.free));

  async function run(kind: NonNullable<typeof busy>, work: () => Promise<void>) {
    setBusy(kind); setError('');
    try { await work(); } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That didn’t work. Try again in a sec.');
    } finally { setBusy(null); }
  }

  function change(update: (current: Draft) => Draft) {
    setPublished(null);
    setDraft(update);
  }

  /** Fills the editor from the song behind `url`: a pasted link, or the Deezer link of a song chosen by name. */
  function lookUp(kind: 'find' | 'pick', url: string, pick?: string) {
    player.stop();
    void run(kind, async () => {
      const song = await lookupSong(url, pick);
      if (pick && !song.confident) throw new Error('That song doesn’t match this link’s title. Pick another or fix the details below.');
      const fields = fieldsOf(url, song);
      change(current => ({ ...current, link: fields, candidates: song.confident ? null : song.candidates ?? [],
        slug: current.editing ? current.slug : suggestSlug(fields.artist, fields.title) }));
    });
  }

  function find(event: FormEvent) {
    event.preventDefault();
    const url = asLink(draft.url);
    if (url) lookUp('find', url);
    else if (!found.results?.[0] && typedName.length < 2) setError('Type your song’s name or paste its link.');
  }

  function edit(fields: Partial<LinkFields>) {
    change(current => current.link ? { ...current, link: { ...current.link, ...fields } } : current);
  }

  function setRow(service: ServiceRow['service'], row: Partial<ServiceRow>) {
    if (link) edit({ services: link.services.map(current => current.service === service ? { ...current, ...row } : current) });
  }

  function move(service: ServiceRow['service'], by: -1 | 1) {
    if (!link) return;
    const from = link.services.findIndex(row => row.service === service);
    const to = from + by;
    if (to < 0 || to >= link.services.length) return;
    const services = [...link.services];
    [services[from], services[to]] = [services[to], services[from]];
    edit({ services });
  }

  function publish() {
    if (!user) { publishWhenIn.current = true; setSigningIn(true); return; }
    void run('publish', async () => {
      const done = await publishDraft(draft, tokens);
      setDraft(EMPTY_DRAFT);
      setTokens({});
      setPublished(done);
    });
  }
  useEffect(() => {
    if (user) listLinks(user.id).catch(() => { /* My Smart Links fetches again and shows the error */ });
  }, [user?.id, published]);
  const publishLatest = useRef(publish);
  publishLatest.current = publish;
  useEffect(() => {
    if (user && publishWhenIn.current) { publishWhenIn.current = false; publishLatest.current(); }
  }, [user]);

  function startAgain() {
    player.stop();
    const wasEditing = Boolean(draft.editing);
    setDraft(EMPTY_DRAFT);
    setTokens({});
    setError('');
    if (wasEditing) onNavigate('my-links');
  }

  const choices: Choice[] | null = link && draft.candidates?.length
    ? draft.candidates.map(candidate => ({ key: candidate.pick, ...candidate, preview: null, choose: () => lookUp('pick', link.source, candidate.pick) }))
    : !link && found.results
      ? found.results.map((result: SearchResult) => ({ key: result.url, ...result, choose: () => lookUp('pick', result.url) }))
      : null;

  return <main className="relative mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-6 pb-24 pt-6">
    {/* Cross-fades with the page, so there is never a blank moment between the two. */}
    <LinksSkeleton hidden={phoneReady} className={`pointer-events-none absolute inset-x-0 top-0 transition-opacity duration-300 ${phoneReady ? 'opacity-0' : 'opacity-100'}`} />
    <div className={`flex flex-col gap-4 transition-opacity duration-300 ${phoneReady ? 'opacity-100' : 'opacity-0'}`}>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        {published && <AccountSection label={published.updated_at === published.created_at ? 'Your link is live' : 'Your changes are live'}>
          <AddressLine slug={published.slug} />
          <p className="m-0 text-sm text-muted-foreground">Drop it in your bio and posts. Fans get the right app button, and My Smart Links tracks which ones they press.</p>
          <AdsNextStep published={published} onStart={() => {
            handSong({ title: published.link.title, artist: published.link.artist, cover: published.link.cover });
            onNavigate('create');
          }} />
        </AccountSection>}

        <AccountSection label={draft.editing ? 'Editing your link' : 'Your song'} aside={(draft.url || link) &&
          <button type="button" className={textButton} onClick={startAgain}>{draft.editing ? 'Cancel' : 'Start again'}</button>}>
          {!draft.editing && !link && <p className="m-0 text-sm text-muted-foreground">One link for your song that opens in every fan’s app: Spotify, Apple Music, YouTube and more.</p>}
          {!draft.editing && <form onSubmit={find} className="flex gap-2">
            <label className="m-0 flex h-[var(--control-height-md)] min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] bg-muted px-3 font-normal focus-within:shadow-[0_0_0_2px_var(--focus-ring)]">
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
              <input className="h-full w-full min-w-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground" type="text"
                aria-label="Your song’s name or link" placeholder="Search your song or paste its Spotify, Apple Music or YouTube link" autoComplete="off" spellCheck={false}
                value={draft.url} onChange={event => { setError(''); change(current => ({ ...current, url: event.target.value, link: null, candidates: null })); }}
                onPaste={event => {
                  const pasted = asLink(event.clipboardData.getData('text'));
                  if (pasted && !draft.url.trim()) { event.preventDefault(); change(current => ({ ...current, url: pasted, link: null, candidates: null })); lookUp('find', pasted); }
                }} />
            </label>
            <Button type="submit" className="h-[var(--control-height-md)] px-5" disabled={!draft.url.trim() || busy !== null}>
              {busy === 'find' ? 'Finding…' : 'Find'}
            </Button>
          </form>}
          {!link && typedName.length >= 2 && found.state !== 'done' && <p className="m-0 text-sm text-muted-foreground">{found.state === 'failed' ? found.error : 'Searching…'}</p>}
          {!link && found.state === 'done' && !found.results?.length && <p className="m-0 text-sm text-muted-foreground">Nothing found for “{typedName}”. Try artist + title or paste the song’s link.</p>}
          {choices && choices.length > 0 && <SongChoices title={link ? 'Not sure. Is this your song?' : 'Pick your song'} choices={choices}
            busy={busy !== null} player={player} />}
          {link && draft.candidates && draft.candidates.length > 0 &&
            <button type="button" className={`${textButton} self-start`} onClick={() => change(current => ({ ...current, candidates: null }))}>None of these: I’ll fix the details</button>}
          {link && <div className="grid gap-3 sm:grid-cols-2">
            <label className="m-0 flex flex-col gap-1.5 text-xs font-normal text-muted-foreground">Title
              <input className={field} value={link.title} maxLength={200} onChange={event => edit({ title: event.target.value })} />
            </label>
            <label className="m-0 flex flex-col gap-1.5 text-xs font-normal text-muted-foreground">Artist
              <input className={field} value={link.artist} maxLength={200} onChange={event => edit({ artist: event.target.value })} />
            </label>
          </div>}
          {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
        </AccountSection>

        {link && <AccountSection label="Buttons">
          <p className="m-0 text-sm text-muted-foreground">Drag to change the order. “Search” buttons open a search for your song — paste the direct link to send fans straight there.</p>
          <Reorder.Group axis="y" values={link.services} onReorder={services => edit({ services })} className="m-0 flex list-none flex-col gap-2 p-0">
            {link.services.map(row => <ServiceEditor key={row.service} row={row}
              onChange={changes => setRow(row.service, changes)} onMove={by => move(row.service, by)} />)}
          </Reorder.Group>
        </AccountSection>}

        {link && <AdTracking key={draft.editing ?? 'new'} ids={draft.ads} saved={draft.tokensSaved} tokens={tokens}
          onIds={ads => change(current => ({ ...current, ads }))} onTokens={next => { setPublished(null); setTokens(next); }} />}

        {link && <AccountSection label="Address">
          {draft.editing
            ? <><AddressLine slug={draft.editing} /><p className="m-0 text-sm text-muted-foreground">The address stays the same so where you shared it keeps working.</p></>
            : <>
              <label className="m-0 flex h-[var(--control-height-md)] items-center gap-0 rounded-[var(--radius-control)] bg-muted pl-3 text-sm font-normal text-muted-foreground focus-within:shadow-[0_0_0_2px_var(--focus-ring)]">
                <span className="shrink-0">{location.host}/l/</span>
                <input className="h-full w-full min-w-0 bg-transparent p-0 pr-3 text-sm text-foreground outline-none" aria-label="Your link’s name" value={draft.slug} maxLength={40} autoCapitalize="off" spellCheck={false}
                  onChange={event => change(current => ({ ...current, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') }))} />
              </label>
              <p role="status" className={`m-0 text-sm ${slug.free ? 'text-primary' : slug.error ? 'text-destructive' : 'text-muted-foreground'}`}>
                {!draft.slug ? 'Choose a name for your link.' : slug.free ? 'This name is free.' : slug.error || 'Checking…'}
              </p>
            </>}
          <div className="flex items-center justify-end gap-3">
            {!user && <span className="text-sm text-muted-foreground">You’ll sign in to publish.</span>}
            <Button className="h-[var(--control-height-md)] px-5" disabled={!ready || busy !== null} onClick={publish}>
              {busy === 'publish' ? 'Publishing…' : draft.editing ? 'Save changes' : 'Publish'}
            </Button>
          </div>
        </AccountSection>}
      </div>

      <PhonePreview link={link} slug={draft.editing ?? draft.slug} onReady={() => setPhoneReady(true)} />
    </div>
    </div>

    <SignInDialog open={signingIn} onClose={() => setSigningIn(false)}
      onSendCode={async email => { await sendSignInCode(email); signInAddress.current = email; }}
      onCheckCode={async code => { await checkSignInCode(signInAddress.current, code); return true; }}
      onGoogle={async () => { await signInWithGoogle(); await session.refetch(); }} />
  </main>;
}

/** One button of the fan page: dragged by its handle (or moved with the arrow keys on it), its link, and shown or hidden. */
function ServiceEditor({ row, onChange, onMove }: { row: ServiceRow; onChange: (changes: Partial<ServiceRow>) => void; onMove: (by: -1 | 1) => void }) {
  const drag = useDragControls();
  const label = LABELS[row.service];
  const opens = row.url.startsWith('https://');
  function keys(event: KeyboardEvent) {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); onMove(event.key === 'ArrowUp' ? -1 : 1); }
  }
  return <Reorder.Item value={row} dragListener={false} dragControls={drag}
    className={`relative flex items-center gap-2 rounded-[var(--radius-control)] bg-card p-1.5 ${row.hidden ? 'opacity-50' : ''}`}>
    <button type="button" className={`${iconButton} cursor-grab touch-none active:cursor-grabbing`} aria-label={`Move ${label}: drag or use the up/down arrow keys`}
      onPointerDown={event => drag.start(event)} onKeyDown={keys}><GripVerticalIcon className="size-4" /></button>
    <img src={`/logos/${row.service}.svg`} alt="" className="size-6 shrink-0 object-contain" draggable={false} />
    <span className="w-28 shrink-0 truncate text-sm font-medium">{label}</span>
    <input className={field} type="url" aria-label={`${label} link`} value={row.url}
      onChange={event => onChange({ url: event.target.value, exact: !isSearch(event.target.value) })} />
    <span className={`w-14 shrink-0 text-center text-xs ${row.exact ? 'text-primary' : 'text-muted-foreground'}`}>{row.exact ? 'Song' : 'Search'}</span>
    <a className={`${iconButton} ${opens ? '' : 'pointer-events-none opacity-30'}`} href={opens ? row.url : undefined} target="_blank" rel="noreferrer"
      aria-label={`Open the ${label} link in a new tab`} aria-disabled={!opens}><ExternalLinkIcon className="size-4" /></a>
    <button type="button" className={iconButton} aria-label={row.hidden ? `Show ${label}` : `Hide ${label}`} aria-pressed={row.hidden}
      onClick={() => onChange({ hidden: !row.hidden })}>{row.hidden ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}</button>
  </Reorder.Item>;
}

function SongChoices({ title, choices, busy, player }: { title: string; choices: Choice[]; busy: boolean; player: Preview }) {
  return <div className="flex flex-col gap-2">
    <p className="m-0 text-sm">{title}</p>
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {choices.map(choice => <li key={choice.key} className="flex items-center gap-2 rounded-[var(--radius-control)] bg-muted p-1.5 pr-2">
        <button type="button" disabled={busy} onClick={choice.choose}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[calc(var(--radius-control)-4px)] bg-transparent p-0 text-left text-sm hover:opacity-80 disabled:opacity-50">
          <Cover src={choice.cover} size="size-11" />
          <span className="min-w-0"><span className="block truncate font-medium">{choice.title}</span><span className="block truncate text-muted-foreground">{choice.artist}</span></span>
        </button>
        {choice.preview && <PlayButton playing={player.playing === choice.preview} onClick={() => player.toggle(choice.preview!)} />}
        <Button size="sm" variant="secondary" disabled={busy} onClick={choice.choose}>Choose</Button>
      </li>)}
    </ul>
  </div>;
}

function PlayButton({ playing, onClick }: { playing: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={playing ? 'Pause preview' : 'Play preview'}
    className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-foreground p-0 text-background hover:opacity-90">
    {playing ? <PauseIcon className="size-3.5 fill-current" /> : <PlayIcon className="ml-0.5 size-3.5 fill-current" />}
  </button>;
}

/** The fan page itself, on an iPhone: what fans will see, with the preview playing from its own button. */
function PhonePreview({ link, slug, onReady }: { link: LinkFields | null; slug: string; onReady: () => void }) {
  const shown = link ?? EXAMPLE;
  const html = useResting(fanPage(shown, addressOf(slug || 'your-song'), location.origin, { inPhone: true }), 250);
  const scale = (PHONE_WIDTH * SCREEN_SHARE) / PAGE_WIDTH;
  return <aside aria-label="Preview" className="flex flex-col items-center gap-4 lg:sticky lg:top-20">
    <Iphone16Pro className="w-[320px] max-w-full">
      <iframe title="Your fan page" srcDoc={html} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" onLoad={onReady}
        className="block origin-top-left border-0" style={{ width: PAGE_WIDTH, height: PAGE_WIDTH * SCREEN_RATIO, transform: `scale(${scale})` }} />
    </Iphone16Pro>
    <p className="m-0 text-center text-xs text-muted-foreground">{link ? 'What fans see. Press play to hear the preview.' : 'Find your song and your page shows up here.'}</p>
  </aside>;
}

const EXAMPLE: LinkFields = {
  source: '', title: 'Your song', artist: 'Your name', cover: null, preview: null, isrc: null,
  services: SERVICES.map(service => ({ service, url: '#', hidden: false, exact: false })),
};

/** One preview playing at a time, from any list. */
type Preview = { playing: string | null; toggle: (url: string) => void; stop: () => void };
function usePreview(): Preview {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  function stop() { audio.current?.pause(); setPlaying(null); }
  function toggle(url: string) {
    if (playing === url) { stop(); return; }
    audio.current?.pause();
    const next = new Audio(url);
    next.onended = () => setPlaying(null);
    audio.current = next;
    setPlaying(url);
    next.play().catch(() => setPlaying(null));
  }
  return { playing, toggle, stop };
}

/** Songs for a typed name, searched once the typing rests. */
function useSongSearch(name: string) {
  const [state, setState] = useState<{ name: string; results?: SearchResult[]; error?: string } | null>(null);
  useEffect(() => {
    if (name.length < 2) return;
    const stop = new AbortController();
    const timer = window.setTimeout(() => {
      searchSongs(name, stop.signal).then(results => setState({ name, results }),
        (cause: Error) => { if (!stop.signal.aborted) setState({ name, error: cause.message }); });
    }, CHECK_PAUSE_MS);
    return () => { stop.abort(); window.clearTimeout(timer); };
  }, [name]);
  if (state?.name !== name) return { state: 'searching' as const };
  return state.error ? { state: 'failed' as const, error: state.error } : { state: 'done' as const, results: state.results };
}

/** `value`, once it has stopped changing for `ms`: the phone reloads its page only when the typing rests. */
function useResting<T>(value: T, ms: number) {
  const [resting, setResting] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setResting(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return resting;
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
