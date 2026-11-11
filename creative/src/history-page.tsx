import { CheckIcon, DownloadIcon } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ImageGeneration } from '@/components/ui/image-generation';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { AccountColumn } from './account-section';
import { accountFetch } from './account';
import { LazyMedia } from './lazy-media';
import type { ProfileTab } from './profile-nav';
import { listUploads, removeUpload, type Upload } from './uploads';
import type { DownloadProgress } from './use-cart-download';

type Creative = { id: string; bytes: number; createdAt: string; url: string };
type Storage = { used: number; quota: number };
/** One card of the history, whichever kind it is. */
type Item = { id: string; kind: 'creative' | 'upload'; bytes: number; createdAt: string; picture?: string; video?: string; download?: string; extension: 'mp4' | 'jpg'; note?: string };

/** How many cards appear at first, and how many more each time the person scrolls near the end. */
const PAGE = 24;
const SKELETONS = 12;
const GRID = 'm-0 grid list-none grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4 p-0';
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
/** A zip is built in the browser's memory, so it is offered while everything fits comfortably. */
const ZIP_LIMIT = 1_000_000_000;

function size(bytes: number) {
  if (bytes >= 1e9) return `${Number((bytes / 1e9).toFixed(1))} GB`;
  return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
}

const creativeItem = (creative: Creative): Item => ({ id: creative.id, kind: 'creative', bytes: creative.bytes, createdAt: creative.createdAt, video: creative.url, download: creative.url, extension: 'mp4' });
const uploadItem = (upload: Upload): Item => ({
  id: upload.id, kind: 'upload', bytes: upload.bytes, createdAt: upload.createdAt,
  picture: upload.url, download: upload.motionUrl ?? upload.url, extension: upload.motionUrl ? 'mp4' : 'jpg',
  ...(upload.url ? {} : { note: upload.status === 'failed' ? upload.error ?? 'This picture could not be prepared.' : 'Preparing…' }),
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
export default function HistoryPage({ tab, progress, delivered }: { tab: ProfileTab; progress: DownloadProgress | null; delivered: number }) {
  const [creatives, setCreatives] = useState<Creative[] | null>(null);
  const [uploads, setUploads] = useState<Upload[] | null>(null);
  const [storage, setStorage] = useState<Storage | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [renders, pictures, account] = await Promise.all([
        accountFetch('/api/renders').then(response => response.json() as Promise<{ renders: Creative[] }>),
        listUploads(),
        accountFetch('/api/account').then(response => response.json() as Promise<{ storage: Storage }>),
      ]);
      setCreatives(renders.renders); setUploads(pictures); setStorage(account.storage); setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your history is unavailable right now.');
    }
  }
  // Opened, and again whenever a download has just been delivered, so the new creatives appear.
  useEffect(() => { void load(); }, [delivered]);
  useEffect(() => { setSelected(new Set()); }, [tab]);

  const items = (tab === 'creatives' ? creatives?.map(creativeItem) : uploads?.map(uploadItem)) ?? null;
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

  /** One file goes straight to the downloads; several go as one zip. */
  async function downloadChosen() {
    setBusy(true); setError('');
    try {
      const files = chosen.filter(item => item.download);
      if (files.length === 1) {
        const link = document.createElement('a');
        link.href = files[0].download!;
        link.download = '';
        link.click();
        return;
      }
      const { zipSync } = await import('fflate');
      const zipped: Record<string, Uint8Array> = {};
      for (const item of files) {
        const bytes = new Uint8Array(await (await fetch(item.download!)).arrayBuffer());
        zipped[`${day(item.createdAt)} ${item.id.slice(0, 6)}.${item.extension}`] = bytes;
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([zipSync(zipped, { level: 0 }) as BlobPart], { type: 'application/zip' }));
      link.download = tab === 'creatives' ? 'mumoo-creatives.zip' : 'mumoo-uploads.zip';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    } catch {
      setError('The zip could not be made. Download them one by one instead.');
    } finally { setBusy(false); }
  }

  async function deleteChosen() {
    setBusy(true); setError('');
    try {
      for (const item of chosen) {
        if (item.kind === 'creative') await accountFetch(`/api/renders?id=${item.id}`, { method: 'DELETE' });
        else await removeUpload(item.id);
      }
      setSelected(new Set());
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That could not be deleted.');
      await load();
    } finally { setBusy(false); setConfirming(false); }
  }

  return <AccountColumn wide>
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <h2 className="m-0 text-2xl font-semibold tracking-tight">History</h2>
      {storage && <p className="m-0 text-sm text-muted-foreground">{size(Math.max(0, storage.quota - storage.used))} remaining space from {size(storage.quota)}</p>}
    </div>
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
    {progress && <div className="flex flex-col gap-2 rounded-[var(--radius-panel)] bg-background p-5" role="status">
      <strong className="text-sm">{progress.label}</strong>
      <progress className="w-full accent-primary" max={100} value={progress.percent} aria-label="Your creatives are being made" />
      <p className="m-0 text-sm text-muted-foreground">This can take a few minutes. They appear here when they are ready.</p>
    </div>}

    {items?.length === 0 && <p className="m-0 py-24 text-center text-sm text-muted-foreground">
      {tab === 'creatives' ? 'Creatives you download while signed in are kept here.' : 'Each visit starts clean. Only the photos, videos and GIFs your cart still uses are kept here, private to you.'}
    </p>}

    {items && items.length > 0 && <div className="sticky top-4 z-10 flex min-h-12 items-center justify-between gap-3 rounded-full bg-background/80 px-5 py-1.5 backdrop-blur-md">
      <button type="button" className="cursor-pointer bg-transparent p-0 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        onClick={() => setSelected(chosen.length === items.length ? new Set() : new Set(items.map(item => item.id)))}>
        {chosen.length === items.length ? 'Clear selection' : 'Select all'}
      </button>
      <div className="flex items-center gap-3">
        {chosen.length > 0 && <span className="text-sm text-muted-foreground" role="status">{chosen.length} selected</span>}
        <Button variant="secondary" disabled={busy || chosen.length === 0 || chosen.every(item => !item.download) || (chosen.length > 1 && chosenBytes > ZIP_LIMIT)}
          title={chosen.length > 1 && chosenBytes > ZIP_LIMIT ? 'Too much to zip at once. Download them one by one.' : undefined}
          onClick={() => void downloadChosen()}>Download</Button>
        <Button variant="destructive" disabled={busy || chosen.length === 0} onClick={() => setConfirming(true)}>Delete</Button>
      </div>
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
            className={cn('relative aspect-[9/16] overflow-hidden rounded-[var(--radius)] bg-muted transition-shadow duration-200', on && 'shadow-[0_0_0_2px_var(--primary)]')}>
            {(item.video || item.picture) && <LazyMedia video={item.video} picture={item.picture} />}
            {item.note && <p className="m-0 grid size-full place-items-center p-3 text-center text-sm text-muted-foreground">{item.note}</p>}
            <button type="button" aria-pressed={on} aria-label={`${on ? 'Selected' : 'Select'} ${noun} from ${day(item.createdAt)}`} onClick={() => toggle(item.id)}
              className="absolute inset-0 size-full cursor-pointer rounded-[inherit] bg-transparent p-0 outline-ring focus-visible:outline-2" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col bg-linear-to-t from-black/75 to-transparent p-2.5 pt-8 text-xs">
              <span>{day(item.createdAt)}</span><span className="text-muted-foreground">{size(item.bytes)}</span>
            </div>
            {on && <span aria-hidden="true" className="pointer-events-none absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><CheckIcon className="size-4" /></span>}
            {item.download && <a href={item.download} download="" aria-label={`Download ${noun} from ${day(item.createdAt)}`}
              className="absolute top-2 right-2 z-10 flex size-8 items-center justify-center rounded-full bg-black/60 text-white outline-ring transition-colors hover:bg-black/80 focus-visible:outline-2">
              <DownloadIcon aria-hidden="true" className="size-4" />
            </a>}
          </li>;
        })}
      </motion.ul>}
    </MotionConfig>
    <div ref={end} aria-hidden="true" />

    <Modal open={confirming} onClose={() => setConfirming(false)}
      title={`Delete ${chosen.length} ${noun}${chosen.length === 1 ? '' : 's'}?`}
      description="This cannot be undone.">
      <div className="flex justify-end gap-3">
        <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
        <Button variant="destructive" disabled={busy} onClick={() => void deleteChosen()}>Delete</Button>
      </div>
    </Modal>
  </AccountColumn>;
}
