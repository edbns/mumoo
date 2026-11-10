import { animate, AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { ShoppingBagIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RemoveBadge } from '@/components/ui/remove-badge';
import { useEffect, useRef } from 'react';
import type { CartItem } from './cart';
import type { DownloadMessage, DownloadProgress } from './use-cart-download';

export type CartLine = {
  item: CartItem;
  title: string;
  /** False when what it was made from (the person's own picture) is no longer there. */
  available: boolean;
};

/** What the cart offers at the bottom, depending on where the person is: download, go to where that is possible, or why not yet. */
export type CartAction =
  | { kind: 'download'; run: () => void }
  | { kind: 'go'; run: () => void }
  | { kind: 'blocked'; reason: string };

/** The cart in the page header, on every page: a bag that tilts on hover and hops when something is added, with the count popping in on it. */
export function CartButton({ count, progress, onOpen }: { count: number; progress: DownloadProgress | null; onOpen: () => void }) {
  const bag = useRef<HTMLSpanElement>(null);
  const before = useRef(count);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (count > before.current && bag.current && !reduceMotion) void animate(bag.current, { y: [0, -6, 0], rotate: [0, -14, 10, 0] }, { duration: 0.5 });
    before.current = count;
  }, [count, reduceMotion]);
  return <MotionConfig reducedMotion="user">
    <motion.button type="button" onClick={onOpen} whileHover="hover" whileTap={{ scale: 0.92 }}
      className="relative inline-flex h-9 min-w-9 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] bg-secondary p-0 px-2.5 text-secondary-foreground outline-ring transition-colors hover:bg-secondary/80 focus-visible:outline-2 focus-visible:outline-offset-2"
      aria-label={`Cart, ${count} ${count === 1 ? 'creative' : 'creatives'}${progress ? `, ${progress.label}` : ''}`}>
      <span ref={bag} className="inline-flex">
        <motion.span className="inline-flex" variants={{ hover: { rotate: [0, -12, 8, 0], transition: { duration: 0.45 } } }}>
          <ShoppingBagIcon aria-hidden="true" className="size-[18px]" />
        </motion.span>
      </span>
      {progress && <span className="text-xs tabular-nums" aria-hidden="true">{progress.percent}%</span>}
      <AnimatePresence initial={false}>
        {count > 0 && <motion.span key={count} initial={{ scale: 0.3 }} animate={{ scale: 1 }} exit={{ scale: 0.3, opacity: 0 }}
          transition={{ type: 'spring', visualDuration: 0.3, bounce: 0.45 }}
          className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-primary-foreground">{count}</motion.span>}
      </AnimatePresence>
    </motion.button>
  </MotionConfig>;
}

/** The cart, full screen over a slightly see-through backdrop: every liked creative for this song and clip in rows, what it costs and one place to get them. */
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
  return <motion.aside className="fixed inset-0 z-10 overflow-y-auto bg-background/90 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Your cart"
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
    <div className="mx-auto flex min-h-full w-full max-w-[914px] flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold">Your cart</h2>
        <Button ref={close} variant="secondary" onClick={onClose}>Close</Button>
      </div>
      {lines.length === 0
        ? <p className="hint">Add the creatives you like. They stay here, for this song and clip, while you refresh for more.</p>
        : <ul className="m-0 grid list-none grid-cols-4 gap-4 p-0">
          {lines.map(({ item, title, available }) => <li key={item.id} className="flex flex-col gap-2">
            <div className="relative aspect-[9/16] overflow-hidden rounded-[var(--radius)] bg-muted">
              {available
                ? <img className="size-full object-cover" src={item.thumb} alt="" />
                : <p className="m-0 grid size-full place-items-center p-4 text-center text-sm text-muted-foreground">The picture it used is no longer available.</p>}
              <RemoveBadge label={`Remove ${title} from your cart`} disabled={busy} onClick={() => onRemove(item.id)} />
            </div>
            <span className="text-sm text-muted-foreground">{title}</span>
          </li>)}
        </ul>}
      {progress && <div className="flex flex-col gap-2" role="status">
        <progress className="w-full accent-primary" max={100} value={progress.percent} aria-label="Download progress" />
        <strong className="text-sm">{progress.label}</strong>
        <p className="hint">This can take a few minutes. You can close this panel; we will tell you when your creatives are ready.</p>
      </div>}
      {lines.length > 0 && <div className="mt-auto flex flex-col gap-3 pt-2">
        <p className="m-0 flex justify-between text-sm"><span>Total</span><strong>{ready.length} {ready.length === 1 ? 'token' : 'tokens'}</strong></p>
        {action.kind === 'download' && <>
          <Button disabled={busy || ready.length === 0} onClick={action.run}>
            Download {ready.length === 1 ? 'MP4' : `${ready.length} creatives`}
          </Button>
          <p className="hint">We are processing your request. In the meantime, you can continue creating other visuals for your music.</p>
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
