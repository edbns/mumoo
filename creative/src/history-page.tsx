import { CheckIcon, DownloadIcon, PlayIcon, Trash2Icon } from '@/components/icons';
import { MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Button } from '@/components/ui/button';
import { StatusButton, useStatus } from '@/components/ui/status-button';
import { ImageGeneration } from '@/components/ui/image-generation';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { AccountColumn, EmptyState } from './account-section';
import { accountFetch, authClient } from './account';
import { keep, recall } from './page-memory';
import { LazyMedia, releaseVideo } from './lazy-media';
import type { ProfileTab } from './profile-nav';
import { listUploads, removeUpload, type Upload } from './uploads';
import { friendlyError } from './friendly-error';

type Creative = { id: string; bytes: number; createdAt: string; url: string; download?: string };
type Storage = { used: number; quota: number };
/** One card of the history, whichever kind it is. */
type Item = { id: string; kind: 'creative' | 'upload'; bytes: number; createdAt: string; picture?: string; video?: string; play?: string; download?: string; extension: 'mp4' | 'jpg'; note?: string };

/** How many cards appear at first, and how many more each time the person scrolls near the end. */
const PAGE = 24;
const SKELETONS = 12;
const GRID = 'm-0 grid list-none grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4 p-0';
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
/** A zip is built in the browser's memory, so it is offered while everything fits comfortably. */
const ZIP_LIMIT = 1_000_000_000;
/** The links to the files stop working after 15 minutes (uploads) or an hour (creatives): the page asks for new ones before then. */
const RELINK_MS = 10 * 60_000;

/** Sends one file to the person's downloads. */
function save(url: string, name = '') {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
}

const fileName = (item: Item) => `${day(item.createdAt)} ${item.id.slice(0, 6)}.${item.extension}`;

/** Fetched first, so its button can show the file coming in; a file that can't be fetched here is handed to the browser to download. */
async function saveItem(item: Item) {
  try {
    const response = await fetch(item.download!);
    if (!response.ok) throw new Error(String(response.status));
    const href = URL.createObjectURL(await response.blob());
    save(href, fileName(item));
    setTimeout(() => URL.revokeObjectURL(href), 30000);
  } catch {
    save(item.download!);
  }
}

type Shown = { creatives: Creative[]; uploads: Upload[]; storage: Storage };

/** How much of the account's room is used, as a short line and a thin bar. */
function StorageMeter({ used, quota }: { used: number; quota: number }) {
  const share = quota > 0 ? Math.min(1, used / quota) : 0;
  return <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
    <span>{size(used)} of {size(quota)} used</span>
    <span aria-hidden="true" className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, share * 100)}%` }} />
    </span>
  </div>;
}

function size(bytes: number) {
  if (bytes >= 1e9) return `${Number((bytes / 1e9).toFixed(1))} GB`;
  return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
}

const creativeItem = (creative: Creative): Item => ({ id: creative.id, kind: 'creative', bytes: creative.bytes, createdAt: creative.createdAt, video: creative.url, play: creative.url, download: creative.download ?? creative.url, extension: 'mp4' });
const uploadItem = (upload: Upload): Item => ({
  id: upload.id, kind: 'upload', bytes: upload.bytes, createdAt: upload.createdAt,
  picture: upload.url, play: upload.motionUrl, download: upload.motionUrl ?? upload.url, extension: upload.motionUrl ? 'mp4' : 'jpg',
  ...(upload.url ? {} : { note: upload.status === 'failed' ? upload.error ?? 'Couldn’t prepare this picture.' : 'Preparing…' }),
});

/** Shows the list a page at a time: the next page appears just before the person reaches the end, so scrolling never stops. */
function useMoreOnScroll(total: number, resetKey: string) {
  const [shown, setShown] = useState(PAGE);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => setShown(PAGE), [resetKey]);
  useEffect(() => {
    const node = end.current;
    if (!node || shown >= total) return;
    const watcher = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setShown(count => count + PAGE); }, { rootMargin: '900px 0px' });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, [shown, total]);
  return { shown, end };
}

/** Everything the person has kept, as one wide, endlessly scrolling wall: finished creatives or their own uploads, chosen in the notch. */
export default function HistoryPage({ tab, delivered }: { tab: ProfileTab; delivered: number }) {
  const owner = authClient.useSession().data?.user.id;
  const [last] = useState(() => recall<Shown>('history', owner, RELINK_MS));
  const [creatives, setCreatives] = useState<Creative[] | null>(last?.creatives ?? null);
  const [uploads, setUploads] = useState<Upload[] | null>(last?.uploads ?? null);
  const [storage, setStorage] = useState<Storage | null>(last?.storage ?? null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [downloading, download] = useStatus();
  const [downloadingOne, downloadOne] = useStatus();
  const busy = downloading !== 'idle';
  const [error, setError] = useState('');
  /**
   * The video playing large, with sound, so the person can see what it is before downloading it again. Its link is its own: the
   * wall's links are renewed while it plays, and only a link that stopped working is swapped.
   */
  const [watching, setWatching] = useState<Item | null>(null);
  /** The player asked for new links once for this video, after its link stopped working. */
  const relinked = useRef<string | null>(null);
  const loadedAt = useRef(0);
  /** A player taken off the page (closed, or another link) stops downloading at once. */
  const holdPlayer = useCallback((video: HTMLVideoElement | null) => (video ? () => releaseVideo(video) : undefined), []);

  async function load(): Promise<Item[] | null> {
    try {
      const [renders, pictures, account] = await Promise.all([
        accountFetch('/api/renders').then(response => response.json() as Promise<{ renders: Creative[] }>),
        listUploads(),
        accountFetch('/api/account').then(response => response.json() as Promise<{ storage: Storage }>),
      ]);
      loadedAt.current = Date.now();
      keep('history', owner, { creatives: renders.renders, uploads: pictures, storage: account.storage } satisfies Shown);
      setCreatives(renders.renders); setUploads(pictures); setStorage(account.storage); setError('');
      return [...renders.renders.map(creativeItem), ...pictures.map(uploadItem)];
    } catch (cause) {
      setError(friendlyError(cause, 'Your media is unavailable right now. Try again soon.'));
      return null;
    }
  }
  // Opened, and again whenever a download has just been delivered, so the new creatives appear.
  useEffect(() => { void load(); }, [delivered]);
  useEffect(() => {
    const renew = () => { if (document.visibilityState === 'visible' && Date.now() - loadedAt.current >= RELINK_MS) void load(); };
    const timer = setInterval(renew, 60_000);
    document.addEventListener('visibilitychange', renew);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', renew); };
  }, []);
  useEffect(() => { setSelected(new Set()); }, [tab]);

  const items = (tab === 'creatives' ? creatives?.map(creativeItem) : uploads?.map(uploadItem)) ?? null;
  /** The player's link stopped working (it expired while the page was open): new links are asked for, once, and it plays from the new one. */
  async function relink() {
    const id = watching?.id;
    if (!id || relinked.current === id) return;
    relinked.current = id;
    const fresh = (await load())?.find(item => item.id === id);
    if (fresh) setWatching(current => (current?.id === id ? fresh : current));
  }
  const chosen = (items ?? []).filter(item => selected.has(item.id));
  const chosenBytes = chosen.reduce((sum, item) => sum + item.bytes, 0);
  const noun = tab === 'creatives' ? 'creative' : 'upload';
  const { shown, end } = useMoreOnScroll(items?.length ?? 0, tab);

  function toggle(id: string) {
    setSelected(current => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** One file goes straight to the downloads; several go as one zip. Once they are downloaded, the selection is let go. */
  async function downloadChosen() {
    setError('');
    const files = chosen.filter(item => item.download);
    if (files.length === 1) {
      await download(() => saveItem(files[0])).then(() => setSelected(new Set()), () => setError('Couldn’t download it. Try again.'));
      return;
    }
    await download(async () => {
      const { zipSync } = await import('fflate');
      const zipped: Record<string, Uint8Array> = {};
      for (const item of files) {
        const bytes = new Uint8Array(await (await fetch(item.download!)).arrayBuffer());
        zipped[fileName(item)] = bytes;
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([zipSync(zipped, { level: 0 }) as BlobPart], { type: 'application/zip' }));
      link.download = tab === 'creatives' ? 'mumoo-creatives.zip' : 'mumoo-uploads.zip';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    }).then(() => setSelected(new Set()), () => setError('Couldn’t make the zip. Download them one by one instead.'));
  }

  async function deleteChosen() {
    try {
      for (const item of chosen) {
        if (item.kind === 'creative') await accountFetch(`/api/renders?id=${item.id}`, { method: 'DELETE' });
        else await removeUpload(item.id);
      }
      setSelected(new Set());
    } finally { await load(); }
  }

  return <AccountColumn wide>
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}

    {items?.length === 0 && <EmptyState>
      {tab === 'creatives' ? 'The videos you make stay here. Download whenever you want.' : 'Photos, videos and GIFs you upload stay here, private to you, until you delete them.'}
    </EmptyState>}

    {items && items.length > 0 && <div className="sticky top-4 z-10 flex min-h-12 items-center justify-between gap-3 rounded-full bg-background/80 px-5 py-1.5 backdrop-blur-md">
      <Button variant="secondary" disabled={busy} onClick={() => setSelected(chosen.length ? new Set() : new Set(items.map(item => item.id)))}>
        {chosen.length ? 'Clear selection' : 'Select all'}
      </Button>
      {chosen.length === 0 ? storage && <StorageMeter used={storage.used} quota={storage.quota} /> : <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground" role="status">{chosen.length} selected</span>
        <StatusButton variant="secondary" status={downloading} working="Downloading…" done="Downloaded" className="min-w-32"
          disabled={!busy && (chosen.length === 0 || chosen.every(item => !item.download) || (chosen.length > 1 && chosenBytes > ZIP_LIMIT))}
          title={chosen.length > 1 && chosenBytes > ZIP_LIMIT ? 'Too many to zip at once. Download one by one.' : undefined}
          onClick={() => void downloadChosen()}><DownloadIcon aria-hidden="true" />Download</StatusButton>
        <Button variant="destructive" disabled={busy} onClick={() => setConfirming(true)}><Trash2Icon aria-hidden="true" />Delete</Button>
      </div>}
    </div>}

    {items === null && !error && <div aria-hidden="true" className="min-h-12" />}
    {items === null && !error && <ul aria-hidden="true" className={GRID}>
      {Array.from({ length: SKELETONS }, (_, index) => <li key={index} className="aspect-[9/16] overflow-hidden rounded-[var(--radius)]"><ImageGeneration compact label="Loading" /></li>)}
    </ul>}
    <MotionConfig reducedMotion="user">
      {/* The wall fades in as one piece. Cards that join it as the person scrolls just join it: a fade on each card makes the wall flash in waves. */}
      {items && <motion.ul key={tab} className={GRID} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
        {items.slice(0, shown).map(item => {
          const on = selected.has(item.id);
          return <li key={item.id}
            className={cn('group relative aspect-[9/16] overflow-hidden rounded-[var(--radius)] bg-muted transition-shadow duration-200', on && 'shadow-[0_0_0_2px_var(--primary)]')}>
            {(item.video || item.picture) && <LazyMedia video={item.video} picture={item.picture} />}
            {item.note && <p className="m-0 grid size-full place-items-center p-3 text-center text-sm text-muted-foreground">{item.note}</p>}
            <button type="button" aria-pressed={on} aria-label={`${on ? 'Selected' : 'Select'} ${noun} from ${day(item.createdAt)}`} onClick={() => toggle(item.id)}
              className="absolute inset-0 size-full cursor-pointer rounded-[inherit] bg-transparent p-0 outline-ring focus-visible:outline-2" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col bg-linear-to-t from-black/75 to-transparent p-2.5 pt-8 text-xs">
              <span>{day(item.createdAt)}</span><span className="text-muted-foreground">{size(item.bytes)}</span>
            </div>
            {on && <span aria-hidden="true" className="pointer-events-none absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><CheckIcon className="size-4" /></span>}
            {item.play && <button type="button" aria-label={`Play ${noun} from ${day(item.createdAt)}`} onClick={() => { relinked.current = null; setWatching(item); }}
              className="absolute top-1/2 left-1/2 z-10 flex size-12 -translate-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-black/60 p-0 text-white outline-ring transition-colors hover:bg-black/80 focus-visible:outline-2">
              <PlayIcon aria-hidden="true" className="ml-0.5 size-5 fill-current" />
            </button>}
            {item.download && <a href={item.download} download="" aria-label={`Download ${noun} from ${day(item.createdAt)}`}
              className="absolute top-2 right-2 z-10 flex size-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 outline-ring transition-[opacity,background-color] group-hover:opacity-100 hover:bg-black/80 focus-visible:opacity-100 focus-visible:outline-2">
              <DownloadIcon aria-hidden="true" className="size-4" />
            </a>}
          </li>;
        })}
      </motion.ul>}
    </MotionConfig>
    <div ref={end} aria-hidden="true" />

    <Modal open={watching !== null} onClose={() => setWatching(null)} bare maxWidth={460} maxHeight="calc(100vh - 3rem)"
      title={watching ? `${watching.kind === 'creative' ? 'Creative' : 'Upload'} from ${day(watching.createdAt)}` : ''}>
      {watching?.play && <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] bg-muted p-3 shadow-[0_28px_56px_-24px_#000]">
        {/* A new player each time it opens (and for a renewed link): a reused one can keep a finished or failed load. */}
        <video ref={holdPlayer} key={`${watching.id}|${watching.play}`} src={watching.play} controls autoPlay playsInline preload="auto" onError={() => void relink()}
          className="max-h-[calc(100vh-10rem)] w-full rounded-[var(--radius)] bg-black object-contain" />
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-sm text-muted-foreground">{day(watching.createdAt)} · {size(watching.bytes)}</span>
          {watching.download && <StatusButton variant="secondary" status={downloadingOne} working="Downloading…" done="Downloaded" className="min-w-32"
            onClick={() => void downloadOne(() => saveItem(watching))}><DownloadIcon aria-hidden="true" />Download</StatusButton>}
        </div>
      </div>}
    </Modal>

    <ActionDialog open={confirming} onClose={() => setConfirming(false)} destructive
      title={`Delete ${chosen.length} ${noun}${chosen.length === 1 ? '' : 's'}?`}
      description="They’re removed from your account and storage. Can’t be undone."
      confirmLabel="Delete" working="Deleting…" done="Deleted" onConfirm={deleteChosen} />
  </AccountColumn>;
}
