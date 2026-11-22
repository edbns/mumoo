import { XIcon } from '@/components/icons';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { RemoveBadge } from '@/components/ui/remove-badge';
import { useEffect, useRef } from 'react';
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
  return <Modal open={tooMany !== null} onClose={onClose} title={`You chose ${videos(need)}`}
    description={free ? 'You can only make 1 free video, or buy credits for the rest.'
      : `You have ${have} ${have === 1 ? 'credit' : 'credits'}. You can only make ${videos(have)}, or buy credits for all of them.`}>
    <div className="flex items-center justify-between gap-3">
      <Button variant="secondary" onClick={onFewer}>{free ? 'Get my free video' : `Make ${videos(have)}`}</Button>
      <Button onClick={onBuy}>Buy credits</Button>
    </div>
  </Modal>;
}

/** What the bar says: one credit makes one video, so the count is the price. */
export const chosenLabel = (count: number) => (count === 1 ? '1 video = 1 credit' : `${count} videos = ${count} credits`);

/**
 * The bar at the bottom of the page while videos are chosen: the step notch turned upside down, rising from the bottom edge.
 * Pressing it opens the page where the videos are made. While they are being made it only shows how far along they are: the
 * chosen videos cannot be changed then, and Cancel takes back the ones that have not started.
 */
export function ChosenBar({ count, progress, onOpen, onClear, onCancel }: {
  count: number; progress: DownloadProgress | null; onOpen: () => void;
  /** Shown on the creatives page only: takes every chosen video out. */
  onClear?: () => void;
  /** Takes back the videos being made that have not started yet. */
  onCancel?: () => void;
}) {
  return <MotionConfig reducedMotion="user">
    <AnimatePresence>
      {(count > 0 || progress) && <motion.nav key="chosen" className="step-nav chosen-bar" aria-label="Chosen videos"
        initial={{ y: '110%' }} animate={{ y: 0 }} exit={{ y: '110%' }} transition={{ type: 'spring', visualDuration: 0.35, bounce: 0.2 }}>
        <span aria-hidden="true" className="chosen-bar-dot" />
        <ol>
          {count > 0 && !progress && <li><motion.button key={count} type="button" aria-current="step" onClick={onOpen}
            initial={{ scale: 0.92 }} animate={{ scale: 1 }} transition={{ type: 'spring', visualDuration: 0.25, bounce: 0.45 }}>
            {chosenLabel(count)}
          </motion.button></li>}
          {count > 0 && progress && <li><span className="chosen-bar-status chosen-bar-count">{chosenLabel(count)}</span></li>}
          {progress && <li><span role="status" className="chosen-bar-status tabular-nums">{progress.label} {progress.percent}%</span></li>}
          {progress && onCancel && (progress.cancellable || progress.cancelling) && <li>
            <button type="button" onClick={onCancel} disabled={progress.cancelling} className="chosen-bar-clear" aria-label="Cancel the videos that have not started">
              <XIcon aria-hidden="true" className="size-3.5" />{progress.cancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          </li>}
          {onClear && count > 0 && !progress && <li><button type="button" onClick={onClear} className="chosen-bar-clear" aria-label="Clear the chosen videos">
            <XIcon aria-hidden="true" className="size-3.5" />Clear
          </button></li>}
        </ol>
      </motion.nav>}
    </AnimatePresence>
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
  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <motion.aside className="fixed inset-0 z-10 overflow-y-auto bg-background/90 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Your chosen videos"
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
    <div className="mx-auto flex min-h-full w-full max-w-[914px] flex-col gap-6 px-6 py-8">
      {/* Make them from the top too, for whoever does not scroll down to the total. */}
      <div className="flex items-center justify-between gap-3">
        {lines.length > 0 && action.kind === 'download'
          ? <Button disabled={busy || ready.length === 0 || excess > 0} onClick={action.run}>Create · {ready.length} {ready.length === 1 ? 'credit' : 'credits'}</Button>
          : <span />}
        <Button ref={close} variant="secondary" className="size-9 rounded-full p-0" onClick={onClose} aria-label="Close"><XIcon aria-hidden="true" className="size-4" /></Button>
      </div>
      {lines.length === 0
        ? <EmptyState>Pick the creatives you like. They stay here for this song and clip while you refresh for more.</EmptyState>
        : <ul className="m-0 grid list-none grid-cols-4 gap-4 p-0">
          {lines.map(({ item, title, available }) => <li key={item.id} className="flex flex-col gap-2">
            <div className="relative aspect-[9/16] overflow-hidden rounded-[var(--radius)] bg-muted">
              {available
                ? item.thumb && <img className="size-full object-cover" src={item.thumb} alt="" />
                : <p className="m-0 grid size-full place-items-center p-4 text-center text-sm text-muted-foreground">The picture it used isn’t available anymore.</p>}
              <RemoveBadge label={`Remove ${title}`} disabled={busy} onClick={() => onRemove(item.id)} />
            </div>
            <span className="text-sm text-muted-foreground">{title}</span>
          </li>)}
        </ul>}
      {lines.length > 0 && <div className="mt-auto flex flex-col gap-3 pt-2">
        <p className="m-0 flex justify-between text-sm"><span>Total</span><strong>{ready.length} {ready.length === 1 ? 'credit' : 'credits'}</strong></p>
        {limit && excess > 0 && <p role="status" className="m-0 rounded-[var(--radius-control)] bg-primary/10 px-4 py-3 text-sm text-foreground">
          {limit.free ? 'You can make 1 video free.' : `You have ${limit.have} ${limit.have === 1 ? 'credit' : 'credits'}.`} Take
          out {videos(excess)} with the × so only {limit.have} {limit.have === 1 ? 'is' : 'are'} left, then make {limit.have === 1 ? 'it' : 'them'}.
        </p>}
        {action.kind === 'download' && <>
          <Button disabled={busy || ready.length === 0 || excess > 0} onClick={action.run}>Create</Button>
          {busy && <p className="hint">We’re working on it. You can keep making other visuals in the meantime.</p>}
        </>}
        {action.kind === 'go' && <>
          <Button disabled={busy} onClick={action.run}>Go to your creatives</Button>
          <p className="hint">Videos get made and downloaded from your creatives page.</p>
        </>}
        {action.kind === 'blocked' && <>
          {action.fix && <Button onClick={action.fix.run}>{action.fix.label}</Button>}
          <p className="hint">{action.reason}</p>
        </>}
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
