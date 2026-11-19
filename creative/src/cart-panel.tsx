import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { RemoveBadge } from '@/components/ui/remove-badge';
import { useEffect, useRef } from 'react';
import { EmptyState } from './account-section';
import type { CartItem } from './cart';
import { RenderProgress } from './render-progress';
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
  | { kind: 'blocked'; reason: string };

/** What the bar says: one credit makes one video, so the count is the price. */
export const chosenLabel = (count: number) => (count === 1 ? '1 Video = 1 credit' : `${count} Videos = ${count} credits`);

/**
 * The bar at the bottom of the page while videos are chosen: the step notch turned upside down, rising from the bottom edge.
 * Pressing it opens the page where the videos are made. While they are being made it shows how far along they are.
 */
export function ChosenBar({ count, progress, onOpen }: { count: number; progress: DownloadProgress | null; onOpen: () => void }) {
  return <MotionConfig reducedMotion="user">
    <AnimatePresence>
      {(count > 0 || progress) && <motion.nav key="chosen" className="step-nav chosen-bar" aria-label="Chosen videos"
        initial={{ y: '110%' }} animate={{ y: 0 }} exit={{ y: '110%' }} transition={{ type: 'spring', visualDuration: 0.35, bounce: 0.2 }}>
        <ol>
          {count > 0 && <li><motion.button key={count} type="button" aria-current="step" onClick={onOpen}
            initial={{ scale: 0.92 }} animate={{ scale: 1 }} transition={{ type: 'spring', visualDuration: 0.25, bounce: 0.45 }}>
            {chosenLabel(count)}
          </motion.button></li>}
          {progress && <li><button type="button" onClick={onOpen} className="tabular-nums">{progress.label} {progress.percent}%</button></li>}
        </ol>
      </motion.nav>}
    </AnimatePresence>
  </MotionConfig>;
}

/** The chosen videos, full screen over a slightly see-through backdrop: every one for this song and clip in rows, what they cost and one place to make them. */
export function CartPanel({ lines, progress, action, onClose, onRemove }: {
  lines: CartLine[];
  progress: DownloadProgress | null;
  action: CartAction;
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const ready = lines.filter(line => line.available);
  const busy = progress !== null;
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
      <div className="flex items-center justify-end">
        <Button ref={close} variant="secondary" onClick={onClose}>Close</Button>
      </div>
      {lines.length === 0
        ? <EmptyState>Choose the creatives you like. They stay here, for this song and clip, while you refresh for more.</EmptyState>
        : <ul className="m-0 grid list-none grid-cols-4 gap-4 p-0">
          {lines.map(({ item, title, available }) => <li key={item.id} className="flex flex-col gap-2">
            <div className="relative aspect-[9/16] overflow-hidden rounded-[var(--radius)] bg-muted">
              {available
                ? <img className="size-full object-cover" src={item.thumb} alt="" />
                : <p className="m-0 grid size-full place-items-center p-4 text-center text-sm text-muted-foreground">The picture it used is no longer available.</p>}
              <RemoveBadge label={`Remove ${title}`} disabled={busy} onClick={() => onRemove(item.id)} />
            </div>
            <span className="text-sm text-muted-foreground">{title}</span>
          </li>)}
        </ul>}
      {progress && <RenderProgress progress={progress} note="This can take a few minutes. You can close this and keep creating." />}
      {lines.length > 0 && <div className="mt-auto flex flex-col gap-3 pt-2">
        <p className="m-0 flex justify-between text-sm"><span>Total</span><strong>{ready.length} {ready.length === 1 ? 'credit' : 'credits'}</strong></p>
        {action.kind === 'download' && <>
          <Button disabled={busy || ready.length === 0} onClick={action.run}>
            Make {ready.length === 1 ? 'video' : `${ready.length} videos`}
          </Button>
          {busy && <p className="hint">We are processing your request. In the meantime, you can continue creating other visuals for your music.</p>}
        </>}
        {action.kind === 'go' && <>
          <Button disabled={busy} onClick={action.run}>Go to your creatives</Button>
          <p className="hint">Videos are made and downloaded from your creatives page.</p>
        </>}
        {action.kind === 'blocked' && <p className="hint">{action.reason}</p>}
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
