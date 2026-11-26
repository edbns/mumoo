import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { DownloadIcon, LoaderCircleIcon, LogOutIcon, MonitorIcon, PlayIcon, Share2Icon, SmartphoneIcon, Trash2Icon, XIcon } from '@/components/icons';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { accountFetch, authClient, checkSignInCode, sendSignInCode, signInWithGoogle, signOut } from './account';
import { friendlyError } from './friendly-error';
import { LazyMedia, releaseVideo } from './lazy-media';
import { LegalCorner } from './legal-corner';
import { SignInDialog } from './sign-in-dialog';

/** One finished video, as /api/renders lists it: `url` plays it in place, `download` saves it under `name`. */
type Video = { id: string; name?: string; bytes: number; createdAt: string; url: string; download?: string };

const SEEN_NOTICE = 'mumoo-phone-notice';
const SIGN_IN = { title: 'Sign in to your Media', lead: 'Download or share the videos you made on your computer.' };
/** The links to the files stop working after an hour: the list is asked for again well before then, and whenever the page comes back. */
const RELOAD_MS = 10 * 60_000;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * mumoo on a phone: making videos is for a computer, so a phone gets a short notice, then the person's Media, where they can watch,
 * download, share or delete what they made. It is the same Media as on the computer, read from the same account.
 */
export default function MobileApp() {
  const session = authClient.useSession();
  const user = session.data?.user;
  const [inMedia, setInMedia] = useState(() => sessionStorage.getItem(SEEN_NOTICE) === '1');
  const [signingIn, setSigningIn] = useState(false);
  const address = useRef('');

  const enter = () => {
    sessionStorage.setItem(SEEN_NOTICE, '1');
    if (user) setInMedia(true);
    else setSigningIn(true);
  };

  return <div className="flex min-h-dvh flex-col text-foreground">
    {inMedia && user
      ? <MediaScreen onSignOut={() => { void signOut(); setInMedia(false); }} />
      : <Notice pending={session.isPending} signedIn={Boolean(user)} onEnter={enter} />}
    <SignInDialog open={signingIn} onClose={() => setSigningIn(false)} reason={SIGN_IN}
      onSendCode={async email => { await sendSignInCode(email); address.current = email; }}
      onCheckCode={async code => { await checkSignInCode(address.current, code); setInMedia(true); return true; }}
      onGoogle={async () => { await signInWithGoogle(); setInMedia(true); }} />
    <LegalCorner />
  </div>;
}

function Notice({ pending, signedIn, onEnter }: { pending: boolean; signedIn: boolean; onEnter: () => void }) {
  return <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
    <img src="/brand/favicon.png" alt="mumoo" className="size-20 rounded-[22px]" />
    <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />Early access
    </span>
    <div className="flex flex-col gap-2">
      <h1 className="m-0 text-2xl font-semibold tracking-tight text-balance">mumoo works better on desktop</h1>
      <p className="m-0 text-base text-muted-foreground">A quick heads-up before you go.</p>
    </div>
    <div className="flex w-full flex-col gap-3 text-left">
      <NoticeCard icon={<MonitorIcon className="size-5" />} title="Much faster on a computer">
        Making, previewing and exporting your videos happens on a computer, many at once.
      </NoticeCard>
      <NoticeCard icon={<SmartphoneIcon className="size-5" />} title="Mobile app under development">Stay tuned!</NoticeCard>
      <NoticeCard icon={<DownloadIcon className="size-5" />} title="Your Media, on your phone">
        You can sign in here to download or share the videos in your Media.
      </NoticeCard>
    </div>
    <Button className="h-12 w-full text-base" disabled={pending} onClick={onEnter}>{signedIn ? 'Open my Media' : 'Sign in to my Media'}</Button>
  </main>;
}

function NoticeCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="flex gap-3 rounded-[var(--radius-panel)] bg-card p-4">
    <span aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
    <div className="flex flex-col gap-1">
      <p className="m-0 text-sm font-semibold">{title}</p>
      <p className="m-0 text-sm text-muted-foreground">{children}</p>
    </div>
  </div>;
}

/**
 * Sharing a file: a phone lets a page share only straight after a tap, so the file is fetched first and kept; when the fetch took
 * too long for the tap to count, the button says the file is ready and the next tap shares it at once.
 */
function useShare() {
  const files = useRef(new Map<string, File>());
  const [state, setState] = useState<Record<string, 'preparing' | 'ready'>>({});
  const set = (id: string, value?: 'preparing' | 'ready') => setState(current => {
    const next = { ...current };
    if (value) next[id] = value; else delete next[id];
    return next;
  });
  const share = useCallback(async (video: Video) => {
    let file = files.current.get(video.id);
    if (!file) {
      set(video.id, 'preparing');
      try {
        const response = await fetch(video.download ?? video.url);
        if (!response.ok) throw new Error(String(response.status));
        file = new File([await response.blob()], video.name ?? 'mumoo video.mp4', { type: 'video/mp4' });
        files.current.set(video.id, file);
      } catch (cause) {
        set(video.id);
        throw cause;
      }
    }
    if (!navigator.canShare?.({ files: [file] })) {
      set(video.id);
      throw new Error('Sharing isn’t available in this browser. Download the video, then share it from your Photos or Files.');
    }
    try {
      await navigator.share({ files: [file] });
      set(video.id);
    } catch (cause) {
      const name = (cause as DOMException)?.name;
      if (name === 'NotAllowedError') { set(video.id, 'ready'); return; }
      set(video.id);
      if (name !== 'AbortError') throw cause;
    }
  }, []);
  return { share, state };
}

function MediaScreen({ onSignOut }: { onSignOut: () => void }) {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [error, setError] = useState('');
  const [watching, setWatching] = useState<Video | null>(null);
  const [deleting, setDeleting] = useState<Video | null>(null);
  const loadedAt = useRef(0);
  const { share, state } = useShare();

  const load = useCallback(async () => {
    try {
      const { renders } = await accountFetch('/api/renders').then(response => response.json() as Promise<{ renders: Video[] }>);
      loadedAt.current = Date.now();
      setVideos(renders); setError('');
      return renders;
    } catch (cause) {
      setError(friendlyError(cause, 'Media library is temporarily offline. Check back in a moment.'));
      return null;
    }
  }, []);
  // What was made or deleted on the computer shows here as soon as the phone comes back to the page.
  useEffect(() => {
    void load();
    const renew = () => { if (document.visibilityState === 'visible' && Date.now() - loadedAt.current >= 15_000) void load(); };
    const timer = setInterval(() => { if (Date.now() - loadedAt.current >= RELOAD_MS) renew(); }, 60_000);
    document.addEventListener('visibilitychange', renew);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', renew); };
  }, [load]);

  const shareOne = (video: Video) => { setError(''); void share(video).catch(cause => setError(friendlyError(cause, 'Couldn’t share this video. Download it instead.'))); };
  async function remove() {
    if (!deleting) return;
    await accountFetch(`/api/renders?id=${deleting.id}`, { method: 'DELETE' });
    if (watching?.id === deleting.id) setWatching(null);
    await load();
  }

  return <>
    <header className="flex items-center justify-between px-4 pt-4 pb-2">
      <img src="/brand/mumoo-logo.png" alt="mumoo" className="h-5" />
      <Button variant="secondary" size="sm" onClick={onSignOut}><LogOutIcon aria-hidden="true" className="size-4" />Sign out</Button>
    </header>
    <main className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-10">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-semibold tracking-tight">Your videos</h1>
        <p className="m-0 text-sm text-muted-foreground">Made on your computer, ready to download or share.</p>
      </div>
      {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
      {videos === null && !error && <ul aria-hidden="true" className="m-0 grid list-none grid-cols-2 gap-3 p-0">
        {Array.from({ length: 4 }, (_, index) => <li key={index} className="aspect-[9/16] animate-pulse rounded-[var(--radius-panel)] bg-muted" />)}
      </ul>}
      {videos?.length === 0 && <p className="m-0 rounded-[var(--radius-panel)] bg-card p-6 text-center text-sm text-muted-foreground">
        No videos yet. Make them on your computer—they show up here as soon as they’re exported.
      </p>}
      {videos && videos.length > 0 && <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0">
        {videos.map(video => <li key={video.id} className="flex flex-col gap-2 rounded-[var(--radius-panel)] bg-card p-2">
          <button type="button" aria-label={`Watch the video from ${day(video.createdAt)}`} onClick={() => setWatching(video)}
            className="relative aspect-[9/16] cursor-pointer overflow-hidden rounded-[var(--radius)] border-0 bg-muted p-0">
            <LazyMedia video={video.url} />
            <span aria-hidden="true" className="absolute top-1/2 left-1/2 flex size-11 -translate-1/2 items-center justify-center rounded-full bg-black/60 text-white">
              <PlayIcon className="ml-0.5 size-5 fill-current" />
            </span>
          </button>
          <span className="px-1 text-xs text-muted-foreground">{day(video.createdAt)}</span>
          <div className="grid grid-cols-3 gap-1.5">
            <ShareButton state={state[video.id]} onShare={() => shareOne(video)} compact />
            <IconAction label="Download" href={video.download} name={video.name}><DownloadIcon aria-hidden="true" className="size-4" /></IconAction>
            <IconAction label="Delete" onClick={() => setDeleting(video)}><Trash2Icon aria-hidden="true" className="size-4" /></IconAction>
          </div>
        </li>)}
      </ul>}
    </main>

    {watching && <Viewer video={watching} shareState={state[watching.id]} onClose={() => setWatching(null)} onShare={() => shareOne(watching)}
      onDelete={() => setDeleting(watching)} onExpired={() => void load().then(list => {
        const fresh = list?.find(video => video.id === watching.id);
        if (fresh && fresh.url !== watching.url) setWatching(fresh);
      })} />}

    <ActionDialog open={deleting !== null} onClose={() => setDeleting(null)} destructive
      title="Delete this video?" description="This permanently deletes the video from your account, on your phone and your computer. This can’t be undone."
      confirmLabel="Delete" working="Deleting…" done="Deleted" onConfirm={remove} />
  </>;
}

const ACTION = 'flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border-0 bg-secondary px-3 text-sm font-medium text-foreground no-underline disabled:cursor-default disabled:opacity-60';

function IconAction({ label, href, name, onClick, children }: { label: string; href?: string; name?: string; onClick?: () => void; children: ReactNode }) {
  if (href) return <a href={href} download={name ?? ''} aria-label={label} title={label} className={ACTION}>{children}</a>;
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={ACTION}>{children}</button>;
}

function ShareButton({ state, onShare, compact = false }: { state?: 'preparing' | 'ready'; onShare: () => void; compact?: boolean }) {
  const label = state === 'preparing' ? 'Getting the video ready to share' : state === 'ready' ? 'Ready: tap to share' : 'Share';
  return <button type="button" aria-label={label} title={label} disabled={state === 'preparing'} onClick={onShare}
    className={cn(ACTION, state === 'ready' && 'bg-primary text-primary-foreground')}>
    {state === 'preparing' ? <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" /> : <Share2Icon aria-hidden="true" className="size-4" />}
    {!compact && (state === 'ready' ? 'Tap to share' : 'Share')}
  </button>;
}

/** The video full screen, with sound, and what can be done with it. */
function Viewer({ video, shareState, onClose, onShare, onDelete, onExpired }: {
  video: Video; shareState?: 'preparing' | 'ready'; onClose: () => void; onShare: () => void; onDelete: () => void; onExpired: () => void;
}) {
  const holdPlayer = useCallback((player: HTMLVideoElement | null) => (player ? () => releaseVideo(player) : undefined), []);
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = before; };
  }, []);
  return <div role="dialog" aria-modal="true" aria-label={`Video from ${day(video.createdAt)}`} className="fixed inset-0 z-40 flex flex-col bg-black">
    <div className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
      <span className="pl-1 text-sm text-muted-foreground">{day(video.createdAt)}</span>
      <button type="button" aria-label="Close" onClick={onClose}
        className="grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-white/10 p-0 text-white"><XIcon aria-hidden="true" className="size-5" /></button>
    </div>
    <video ref={holdPlayer} key={video.url} src={video.url} controls autoPlay playsInline preload="auto" onError={onExpired}
      className="min-h-0 w-full flex-1 bg-black object-contain" />
    <div className="grid grid-cols-3 gap-2 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <ShareButton state={shareState} onShare={onShare} />
      <a href={video.download} download={video.name ?? ''} className={ACTION}><DownloadIcon aria-hidden="true" className="size-4" />Download</a>
      <button type="button" onClick={onDelete} className={ACTION}><Trash2Icon aria-hidden="true" className="size-4" />Delete</button>
    </div>
  </div>;
}
