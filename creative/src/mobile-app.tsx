import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, DownloadIcon, LoaderCircleIcon, LogOutIcon, MonitorIcon, PlayIcon, Share2Icon, SmartphoneIcon, Trash2Icon, XIcon } from '@/components/icons';
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
const SIGN_IN = { title: 'Sign in to your Media', lead: 'Save the videos you made on your computer to your camera roll.' };
/** The links to the files stop working after an hour: the list is asked for again well before then, and whenever the page comes back. */
const RELOAD_MS = 10 * 60_000;
/**
 * An iPhone or iPad saves a video to the camera roll only from the share sheet ("Save Video"); a download goes to Files. Elsewhere
 * (Android) a download lands where the gallery finds it.
 */
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * mumoo on a phone: making videos is for a computer, so a phone gets a short notice, then the person's Media, where they can watch,
 * save, share or delete what they made. It is the same Media as on the computer, read from the same account.
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
      ? <MediaScreen onSignOut={() => { sessionStorage.removeItem(SEEN_NOTICE); void signOut(); }} />
      : <Notice pending={session.isPending} signedIn={Boolean(user)} onEnter={enter} />}
    <SignInDialog open={signingIn} onClose={() => setSigningIn(false)} reason={SIGN_IN}
      onSendCode={async email => { await sendSignInCode(email); address.current = email; }}
      onCheckCode={async code => { await checkSignInCode(address.current, code); setInMedia(true); return true; }}
      onGoogle={async () => { await signInWithGoogle(); setInMedia(true); }} />
    <LegalCorner />
  </div>;
}

function Notice({ pending, signedIn, onEnter }: { pending: boolean; signedIn: boolean; onEnter: () => void }) {
  return <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-7 px-6 py-10 text-center">
    <img src="/brand/favicon.png" alt="mumoo" className="size-20 rounded-[22px]" />
    <h1 className="m-0 text-2xl font-semibold tracking-tight text-balance">Create on desktop. Post from your phone.</h1>
    <div className="flex w-full flex-col gap-3 text-left">
      <NoticeCard icon={<MonitorIcon className="size-5" />} title="Full studio on desktop">
        Upload tracks, sync lyrics, and preview multiple videos at once on a computer.
      </NoticeCard>
      <NoticeCard icon={<SmartphoneIcon className="size-5" />} title="Mobile app coming soon">We’re bringing the studio to mobile next.</NoticeCard>
      <NoticeCard icon={<DownloadIcon className="size-5" />} title="Your Media, ready to post">
        Sign in here to download your videos straight to your camera roll.
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

type Action = 'save' | 'share';
/** How a press of Save or Share ended: done, put off by the cancelled sheet, or waiting for one more tap (the phone asked for a fresh one). */
type Outcome = 'done' | 'cancelled' | 'tap-again';

/**
 * The video files themselves, for the share sheet. A phone lets a page open it only straight after a tap, so a chosen video's file
 * is fetched as soon as it is chosen; when the tap has gone stale by the time they are in, the caller asks for one more.
 */
function useFiles() {
  const files = useRef(new Map<string, Promise<File>>());
  const fileOf = useCallback((video: Video) => {
    let file = files.current.get(video.id);
    if (!file) {
      file = fetch(video.download ?? video.url).then(async response => {
        if (!response.ok) throw new Error('Couldn’t get this video. Try again.');
        return new File([await response.blob()], video.name ?? 'mumoo video.mp4', { type: 'video/mp4' });
      });
      file.catch(() => files.current.delete(video.id));
      files.current.set(video.id, file);
    }
    return file;
  }, []);
  /** Opens the share sheet with `videos` (an iPhone's also offers Save Video to the camera roll); `onFile` counts them in. */
  const share = useCallback(async (videos: Video[], onFile: () => void): Promise<Outcome> => {
    const shown = await Promise.all(videos.map(video => fileOf(video).then(file => { onFile(); return file; })));
    if (!navigator.canShare?.({ files: shown })) throw new Error('Sharing isn’t available in this browser. Save the videos, then share them from your gallery.');
    try {
      await navigator.share({ files: shown });
      return 'done';
    } catch (cause) {
      const name = (cause as DOMException)?.name;
      if (name === 'NotAllowedError') return 'tap-again';
      if (name === 'AbortError') return 'cancelled';
      throw cause;
    }
  }, [fileOf]);
  return { fileOf, share };
}

/** Saves each video by itself, one after the other (no zip): where the browser puts downloads, the gallery finds them. */
async function downloadEach(videos: Video[], onFile: () => void) {
  for (const video of videos) {
    onFile();
    if (!video.download) continue;
    const link = document.createElement('a');
    link.href = video.download;
    link.download = video.name ?? '';
    link.click();
    await new Promise(resolve => setTimeout(resolve, 700));
  }
}

function MediaScreen({ onSignOut }: { onSignOut: () => void }) {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [watching, setWatching] = useState<Video | null>(null);
  const [deleting, setDeleting] = useState<Video[] | null>(null);
  const loadedAt = useRef(0);
  const { fileOf, share } = useFiles();
  /** The Save or Share under way, with how many of its videos are in; or the one waiting for another tap. */
  const [work, setWork] = useState<{ action: Action; done: number; total: number } | null>(null);
  const [again, setAgain] = useState<Action | null>(null);
  /** A short line floating over the videos: how far a save has got, then that it is done. */
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice || work) return;
    const timer = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timer);
  }, [notice, work]);

  const load = useCallback(async () => {
    try {
      const { renders } = await accountFetch('/api/renders').then(response => response.json() as Promise<{ renders: Video[] }>);
      loadedAt.current = Date.now();
      setVideos(renders); setError('');
      setSelected(current => new Set(renders.filter(video => current.has(video.id)).map(video => video.id)));
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

  const chosen = (videos ?? []).filter(video => selected.has(video.id));
  function toggle(video: Video) {
    setAgain(null);
    setSelected(current => {
      const next = new Set(current);
      if (!next.delete(video.id)) { next.add(video.id); if (IOS) void fileOf(video).catch(() => undefined); }
      return next;
    });
  }
  /** Save (to the camera roll on an iPhone, a download elsewhere) or Share `list`; once saved, the selection is let go. */
  async function act(action: Action, list: Video[]) {
    if (work) return;
    setError(''); setAgain(null);
    const total = list.length;
    const onFile = () => setWork(current => current && { ...current, done: Math.min(current.total, current.done + 1) });
    setWork({ action, done: 0, total });
    try {
      if (action === 'save' && !IOS) {
        await downloadEach(list, onFile);
        setNotice(total === 1 ? 'Video downloaded.' : `${total} videos downloaded.`);
        setSelected(new Set());
        return;
      }
      const outcome = await share(list, onFile);
      if (outcome === 'tap-again') { setAgain(action); setNotice('Ready. Tap again.'); return; }
      if (outcome === 'cancelled') { setNotice(''); return; }
      setNotice(action === 'share' ? 'Shared.' : total === 1 ? 'Saved to your camera roll.' : `${total} videos saved to your camera roll.`);
      if (action === 'save') setSelected(new Set());
    } catch (cause) {
      setNotice('');
      setError(friendlyError(cause, action === 'share' ? 'Couldn’t share this video. Try again.' : 'Couldn’t save these videos. Try again.'));
    } finally {
      setWork(null);
    }
  }
  const progress = work && (work.action === 'save' && !IOS
    ? `Downloading ${Math.max(1, work.done)} of ${work.total}…`
    : work.total === 1 ? 'Getting your video ready…' : `Getting ${work.done} of ${work.total} ready…`);
  const saveLabel = IOS ? 'Save to camera roll' : 'Download';
  const actionProps = (action: Action) => ({ busy: work?.action === action, ready: again === action });

  async function remove() {
    if (!deleting) return;
    try {
      for (const video of deleting) await accountFetch(`/api/renders?id=${video.id}`, { method: 'DELETE' });
      if (watching && deleting.some(video => video.id === watching.id)) setWatching(null);
      setSelected(new Set());
    } finally { await load(); }
  }

  return <>
    <header className="flex items-center justify-between px-4 pt-4 pb-2">
      <img src="/brand/mumoo-logo.png" alt="mumoo" className="h-5" />
      <button type="button" aria-label="Sign out" title="Sign out" onClick={onSignOut}
        className="grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-secondary p-0 text-foreground"><LogOutIcon aria-hidden="true" className="size-4" /></button>
    </header>
    <main className="flex flex-1 flex-col gap-4 px-3 pt-2 pb-32">
      {error && <p role="alert" className="m-0 px-1 text-sm text-destructive">{error}</p>}
      {videos === null && !error && <ul aria-hidden="true" className="m-0 grid list-none grid-cols-2 gap-1.5 p-0">
        {Array.from({ length: 4 }, (_, index) => <li key={index} className="aspect-[9/16] animate-pulse rounded-[var(--radius)] bg-muted" />)}
      </ul>}
      {videos?.length === 0 && <p className="m-0 p-6 text-center text-sm text-muted-foreground">
        No videos yet. Make them on your computer—they show up here as soon as they’re exported.
      </p>}
      {videos && videos.length > 0 && <ul aria-label="Your videos" className="m-0 grid list-none grid-cols-2 gap-1.5 p-0">
        {videos.map(video => {
          const on = selected.has(video.id);
          return <li key={video.id} className="relative">
            <button type="button" aria-pressed={on} aria-label={`${on ? 'Selected' : 'Select'}: video from ${day(video.createdAt)}`} onClick={() => toggle(video)}
              className={cn('relative block aspect-[9/16] w-full cursor-pointer overflow-hidden rounded-[var(--radius)] border-0 bg-muted p-0 transition-[box-shadow,transform] duration-200',
                on && 'scale-[0.97] shadow-[0_0_0_2px_var(--primary)]')}>
              <LazyMedia video={video.url} />
            </button>
            {on && <span aria-hidden="true" className="pointer-events-none absolute top-2 left-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground"><CheckIcon className="size-4" /></span>}
          </li>;
        })}
      </ul>}
    </main>

    {chosen.length > 0 && !watching && <FloatingBar>
      {chosen.length === 1 && <FloatingAction label="Watch" onClick={() => setWatching(chosen[0])}><PlayIcon className="ml-0.5 size-5 fill-current" /></FloatingAction>}
      <FloatingAction label={saveLabel} {...actionProps('save')} onClick={() => void act('save', chosen)}><DownloadIcon className="size-5" /></FloatingAction>
      {chosen.length === 1 && <FloatingAction label="Share" {...actionProps('share')} onClick={() => void act('share', chosen)}><Share2Icon className="size-5" /></FloatingAction>}
      <FloatingAction label="Delete" onClick={() => setDeleting(chosen)}><Trash2Icon className="size-5" /></FloatingAction>
      <FloatingAction label="Deselect" onClick={() => setSelected(new Set())}><XIcon className="size-5" /></FloatingAction>
    </FloatingBar>}

    {watching && <Viewer video={watching} onClose={() => setWatching(null)} onExpired={() => void load().then(list => {
      const fresh = list?.find(video => video.id === watching.id);
      if (fresh && fresh.url !== watching.url) setWatching(fresh);
    })}>
      <FloatingAction label={saveLabel} {...actionProps('save')} onClick={() => void act('save', [watching])}><DownloadIcon className="size-5" /></FloatingAction>
      <FloatingAction label="Share" {...actionProps('share')} onClick={() => void act('share', [watching])}><Share2Icon className="size-5" /></FloatingAction>
      <FloatingAction label="Delete" onClick={() => setDeleting([watching])}><Trash2Icon className="size-5" /></FloatingAction>
    </Viewer>}

    {(progress || notice) && <p role="status" aria-live="polite"
      className={cn('pointer-events-none fixed inset-x-0 z-50', watching ? 'bottom-[max(9.5rem,calc(env(safe-area-inset-bottom)+8.5rem))]' : 'bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))]',
        'm-0 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-full bg-black/85 px-4 py-2 text-center text-sm text-white shadow-[0_12px_32px_-12px_#000,inset_0_0_0_1px_rgba(255,255,255,0.12)] backdrop-blur-md')}>
      {progress || notice}
    </p>}

    <ActionDialog open={deleting !== null} onClose={() => setDeleting(null)} destructive
      title={deleting && deleting.length > 1 ? `Delete ${deleting.length} videos?` : 'Delete this video?'}
      description={`This permanently deletes ${deleting && deleting.length > 1 ? 'the videos' : 'the video'} from your account, on your phone and your computer. This can’t be undone.`}
      confirmLabel="Delete" working="Deleting…" done="Deleted" onConfirm={remove} />
  </>;
}

function FloatingBar({ children }: { children: ReactNode }) {
  return <div role="toolbar" aria-label="Selected videos"
    className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 mx-auto flex w-fit items-center gap-1 rounded-full bg-black/80 p-1.5 shadow-[0_16px_40px_-12px_#000,inset_0_0_0_1px_rgba(255,255,255,0.12)] backdrop-blur-md">
    {children}
  </div>;
}

function FloatingAction({ label, busy = false, ready = false, onClick, children }: { label: string; busy?: boolean; ready?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={ready ? `${label}: ready, tap again` : label} title={label} disabled={busy} onClick={onClick}
    className={cn('grid size-12 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-white transition-colors active:bg-white/15 disabled:cursor-default',
      ready && 'bg-primary text-primary-foreground')}>
    <span aria-hidden="true" className="grid place-items-center">{busy ? <LoaderCircleIcon className="size-5 animate-spin" /> : children}</span>
  </button>;
}

/** The video full screen, with sound; its actions float over it. */
function Viewer({ video, onClose, onExpired, children }: { video: Video; onClose: () => void; onExpired: () => void; children: ReactNode }) {
  const holdPlayer = useCallback((player: HTMLVideoElement | null) => (player ? () => releaseVideo(player) : undefined), []);
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = before; };
  }, []);
  return <div role="dialog" aria-modal="true" aria-label={`Video from ${day(video.createdAt)}`} className="fixed inset-0 z-40 bg-black">
    <video ref={holdPlayer} key={video.url} src={video.url} controls autoPlay playsInline preload="auto" onError={onExpired} className="size-full object-contain" />
    <button type="button" aria-label="Close" onClick={onClose}
      className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 grid size-11 cursor-pointer place-items-center rounded-full border-0 bg-black/60 p-0 text-white backdrop-blur-md">
      <XIcon aria-hidden="true" className="size-5" />
    </button>
    <div className="absolute inset-x-0 bottom-[max(5rem,calc(env(safe-area-inset-bottom)+4rem))] mx-auto flex w-fit items-center gap-1 rounded-full bg-black/70 p-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] backdrop-blur-md">
      {children}
    </div>
  </div>;
}
