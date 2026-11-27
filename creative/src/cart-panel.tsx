import { ArrowRightIcon, XIcon } from '@/components/icons';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { RemoveBadge } from '@/components/ui/remove-badge';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from './account-section';
import type { CartItem } from './cart';
import type { TooMany } from './credit-events';
import type { DownloadMessage, DownloadProgress } from './use-cart-download';

export type CartLine = {
  item: CartItem;
  title: string;
  /** False when what it was made from (the person's own picture, or our library's) is no longer there. */
  available: boolean;
};

/** What the chosen videos page offers at the bottom, depending on where the person is: make them, go to where that is possible, or why not yet. */
export type CartAction =
  | { kind: 'download'; run: () => void }
  | { kind: 'go'; run: () => void }
  | { kind: 'blocked'; reason: string; fix?: { label: string; run: () => void } };

/** How many of the chosen videos the person can make, after choosing to make only those (`free`: just their free first video). */
export type ChosenLimit = { have: number; free: boolean };

const videos = (count: number) => `${count} ${count === 1 ? 'video' : 'videos'}`;

/** More videos chosen than the person can make: buy credits, or make only as many as they can and take the others out. */
export function ChooseFewer({ tooMany, onBuy, onFewer, onClose }: { tooMany: TooMany | null; onBuy: () => void; onFewer: () => void; onClose: () => void }) {
  const { need = 0, have = 0, free = false } = tooMany ?? {};
  return <Modal open={tooMany !== null} onClose={onClose} title={`You selected ${videos(need)}`}
    description={free ? 'Your first export is free. Grab credits to render the rest.'
      : `You have ${have} ${have === 1 ? 'credit' : 'credits'}—enough for ${videos(have)}. Top up to export all ${need}.`}>
    <div className="flex items-center justify-between gap-3">
      <Button variant="secondary" onClick={onFewer}>{free ? 'Export 1 free video' : `Export ${videos(have)}`}</Button>
      <Button onClick={onBuy}>Get credits</Button>
    </div>
  </Modal>;
}

const credits = (count: number) => `${count} ${count === 1 ? 'credit' : 'credits'}`;

/** Where each card just picked was on screen, so the tray can fly a small copy of it down into the deck. */
const launches = new Map<string, DOMRect>();
export function launchToTray(id: string, from: DOMRect) {
  launches.set(id, from);
}

/** The deck's miniatures: the newest last, on top. */
const DECK = 4;
const THUMB_W = 24;
const THUMB_H = 40;
/** How far each miniature overlaps the one before it. */
const OVERLAP = 10;

type Flight = { id: string; thumb: string; from: DOMRect; to: { x: number; y: number } };

/**
 * The tray at the bottom of the window while videos are chosen: a deck of their miniatures, how many, and Export with what it
 * costs (one credit a video). A card picked flies down into the deck, so it is plain it is kept whatever is refreshed. The deck
 * and the count open the chosen videos page. While the videos are being made it shows how far along they are, and Cancel takes
 * back the ones that have not started.
 */
export function ChosenBar({ items = [], count, progress, onOpen, onExport, onClear, onCancel }: {
  /** The chosen videos, oldest first, for their miniatures. */
  items?: { id: string; thumb?: string }[];
  count: number; progress: DownloadProgress | null; onOpen: () => void;
  /** Makes them at once; without it, Export opens the chosen videos page, which says what is still needed. */
  onExport?: () => void;
  /** Takes every chosen video out. */
  onClear?: () => void;
  /** Takes back the videos being made that have not started yet. */
  onCancel?: () => void;
}) {
  const reduce = useReducedMotion();
  const deck = useRef<HTMLButtonElement>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const shown = items.slice(-DECK);
  const ids = items.map(item => item.id).join(',');
  useEffect(() => {
    const landing = items.filter(item => launches.has(item.id));
    if (!landing.length) return;
    // The deck is measured once the tray is in place, so the miniature lands where it will stay.
    const frame = requestAnimationFrame(() => {
      const box = deck.current?.getBoundingClientRect();
      const next: Flight[] = [];
      for (const item of landing) {
        const from = launches.get(item.id)!;
        launches.delete(item.id);
        if (!box || !item.thumb || reduce) continue;
        const place = Math.max(0, shown.findIndex(candidate => candidate.id === item.id));
        next.push({ id: item.id, thumb: item.thumb, from, to: { x: box.left + place * (THUMB_W - OVERLAP), y: box.top + (box.height - THUMB_H) / 2 } });
      }
      if (next.length) setFlights(current => [...current, ...next]);
    });
    return () => cancelAnimationFrame(frame);
  }, [ids]);
  const flying = new Set(flights.map(flight => flight.id));
  const busy = Boolean(progress);
  return <MotionConfig reducedMotion="user">
    <AnimatePresence>
      {(count > 0 || progress) && <motion.nav key="chosen" aria-label="Chosen videos"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[15] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-1 rounded-[1.75rem] bg-[#1A1A1D]/90 p-2 shadow-[0_18px_44px_-14px_#000,inset_0_0_0_1px_rgba(255,255,255,0.12)] backdrop-blur-md"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ type: 'spring', visualDuration: 0.3, bounce: 0.2 }}>
        <div className="flex items-center gap-3">
          {count > 0 && <button ref={deck} type="button" onClick={onOpen} disabled={busy}
            className="flex cursor-pointer items-center gap-3 rounded-full border-0 bg-transparent py-1 pr-1 pl-1.5 text-sm text-foreground disabled:cursor-default"
            aria-label={`See your ${count} chosen ${count === 1 ? 'video' : 'videos'}`}>
            <span aria-hidden="true" className="flex">
              {shown.map((item, index) => <span key={item.id} style={{ width: THUMB_W, height: THUMB_H, marginLeft: index ? -OVERLAP : 0, zIndex: index }}
                className={`relative block shrink-0 overflow-hidden rounded-[5px] bg-muted shadow-[0_0_0_2px_#1A1A1D] transition-opacity duration-150 ${flying.has(item.id) ? 'opacity-0' : 'opacity-100'}`}>
                {item.thumb && <img src={item.thumb} alt="" className="size-full object-cover" />}
              </span>)}
            </span>
            <motion.span key={count} className="whitespace-nowrap font-medium tabular-nums" initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', visualDuration: 0.25, bounce: 0.45 }}>{count} selected</motion.span>
          </button>}
          {progress && <span role="status" className="whitespace-nowrap px-1 text-sm text-muted-foreground tabular-nums">{progress.label} {progress.percent}%</span>}
          {progress && onCancel && (progress.cancellable || progress.cancelling) &&
            <button type="button" onClick={onCancel} disabled={progress.cancelling} aria-label="Cancel the videos that have not started"
              className="cursor-pointer whitespace-nowrap border-0 bg-transparent px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-default">
              {progress.cancelling ? 'Cancelling…' : 'Cancel'}
            </button>}
          {count > 0 && !busy && <>
            <Button className="h-10 rounded-full px-5" onClick={onExport ?? onOpen}>Export · {credits(count)}<ArrowRightIcon aria-hidden="true" className="size-4" /></Button>
            {onClear && <button type="button" onClick={onClear} aria-label="Clear the chosen videos"
              className="cursor-pointer whitespace-nowrap border-0 bg-transparent pr-3 pl-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Clear</button>}
          </>}
        </div>
        {progress?.note && <p role="status" className="chosen-bar-note">{progress.note}</p>}
      </motion.nav>}
    </AnimatePresence>
    {flights.map(flight => <motion.img key={flight.id} src={flight.thumb} alt="" aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-[16] origin-top-left rounded-[5px] object-cover shadow-[0_12px_30px_-10px_#000]"
      style={{ width: THUMB_W, height: THUMB_H }}
      initial={{ x: flight.from.left, y: flight.from.top, scaleX: flight.from.width / THUMB_W, scaleY: flight.from.height / THUMB_H }}
      animate={{ x: flight.to.x, y: flight.to.y, scaleX: 1, scaleY: 1 }}
      transition={{ duration: 0.55, ease: [0.5, 0, 0.2, 1] }}
      onAnimationComplete={() => setFlights(current => current.filter(other => other.id !== flight.id))} />)}
  </MotionConfig>;
}

/** The chosen videos, full screen over a slightly see-through backdrop: every one for this song and clip in rows, what they cost and one place to make them. */
export function CartPanel({ lines, progress, action, limit = null, onClose, onRemove }: {
  lines: CartLine[];
  progress: DownloadProgress | null;
  action: CartAction;
  /** Set once the person chose to make only the videos they can: Make waits until the others are taken out. */
  limit?: ChosenLimit | null;
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const ready = lines.filter(line => line.available);
  const busy = progress !== null;
  const excess = limit ? ready.length - limit.have : 0;
  const close = useRef<HTMLButtonElement>(null);
  const hint = action.kind === 'download' ? (busy ? 'Rendering in progress. Feel free to keep browsing and tweaking other videos.' : '')
    : action.kind === 'go' ? 'Head back to your studio page to render and download videos.'
    : action.reason;
  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Above every page's own layers (a card's play button is z-10), under the notices and dialogs.
  return <motion.aside className="fixed inset-0 z-[18] overflow-y-auto bg-background/90 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Your chosen videos"
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
    <div className="mx-auto flex min-h-full w-full max-w-[914px] flex-col gap-6 px-6 py-8">
      {/* Make them from the top too, for whoever does not scroll down to the total. */}
      <div className="flex items-center justify-between gap-3">
        {lines.length > 0 && action.kind === 'download'
          ? <Button disabled={busy || ready.length === 0 || excess > 0} onClick={action.run}>Export · {ready.length} {ready.length === 1 ? 'credit' : 'credits'}</Button>
          : <span />}
        <Button ref={close} variant="secondary" className="size-9 rounded-full p-0" onClick={onClose} aria-label="Close"><XIcon aria-hidden="true" className="size-4" /></Button>
      </div>
      {/* What stops or explains making them shows up here, at the top, where it is seen however many rows are chosen. */}
      {lines.length > 0 && (limit && excess > 0 || hint) && <div className="flex flex-col gap-3">
        {limit && excess > 0 && <p role="status" className="m-0 rounded-[var(--radius-control)] bg-secondary px-4 py-3 text-sm text-foreground">
          {limit.free ? 'You have 1 free export.' : `You have ${limit.have} ${limit.have === 1 ? 'credit' : 'credits'}.`} Remove {videos(excess)} to export now, or top up your balance.
        </p>}
        {hint && <p role="status" className="hint m-0">{hint}</p>}
        {action.kind === 'blocked' && action.fix && <Button className="self-start" onClick={action.fix.run}>{action.fix.label}</Button>}
      </div>}
      {lines.length === 0
        ? <EmptyState>Lock in the videos you like. They’ll stay saved here while you refresh for fresh variations.</EmptyState>
        : <ul className="m-0 grid list-none grid-cols-4 gap-4 p-0">
          {lines.map(({ item, title, available }) => <li key={item.id} className="flex flex-col gap-2">
            <div className="relative aspect-[9/16] overflow-hidden rounded-[var(--radius)] bg-muted">
              {available
                ? item.thumb && <img className="size-full object-cover" src={item.thumb} alt="" />
                : <p className="m-0 grid size-full place-items-center p-4 text-center text-sm text-muted-foreground">A visual used in this video is no longer available.</p>}
              <RemoveBadge label={`Remove ${title}`} disabled={busy} onClick={() => onRemove(item.id)} />
            </div>
            <span className="text-sm text-muted-foreground">{title}</span>
          </li>)}
        </ul>}
      {lines.length > 0 && <div className="mt-auto flex flex-col gap-3 pt-2">
        <p className="m-0 flex justify-between text-sm"><span>Total:</span><strong>{ready.length} {ready.length === 1 ? 'credit' : 'credits'}</strong></p>
        {action.kind === 'download' && <Button disabled={busy || ready.length === 0 || excess > 0} onClick={action.run}>Export</Button>}
        {action.kind === 'go' && <Button disabled={busy} onClick={action.run}>Back to videos</Button>}
        {action.kind === 'blocked' && action.fix && <Button onClick={action.fix.run}>{action.fix.label}</Button>}
      </div>}
    </div>
  </motion.aside>;
}

/** How a download ended, shown on whatever page the person is on until they dismiss it. */
export function DownloadNotice({ message, onDismiss }: { message: DownloadMessage; onDismiss: () => void }) {
  return <div className={`download-notice ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
    <span>{message.text}</span>
    <button type="button" className="link-button" onClick={onDismiss}>Dismiss</button>
  </div>;
}
