import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useState, type ComponentProps, type ReactNode } from 'react';
import { CheckCircleIcon, CircleDashedIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ButtonStatus = 'idle' | 'working' | 'done';
/** How long "Deleted" or "Downloaded" stays on the button before it is a button again (or its popup closes). */
export const DONE_MS = 700;
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A button that shows its own work (after Animata's status button): its words drop away for a turning dashed circle while it
 * runs, then a check springs in beside what was done ("Deleted"). It takes no clicks until it is idle again.
 */
export function StatusButton({ status, children, working, done, className, onClick, ...props }: ComponentProps<typeof Button> & {
  status: ButtonStatus;
  /** Said to a screen reader while it runs ("Deleting…"). */
  working: string;
  done: ReactNode;
}) {
  const calm = useReducedMotion();
  const idle = status === 'idle';
  return <Button {...props} aria-disabled={!idle || undefined} aria-live="polite"
    className={cn('relative overflow-hidden', !idle && 'cursor-default', className)} onClick={event => { if (idle) onClick?.(event); }}>
    <AnimatePresence mode="wait" initial={false}>
      <motion.span key={status} className="flex items-center justify-center gap-2"
        initial={{ opacity: 0, y: calm ? 0 : -15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: calm ? 0 : 15 }} transition={{ duration: 0.075 }}>
        {status === 'done' && <motion.span className="flex" initial={{ scale: calm ? 1 : 0 }} animate={{ scale: 1 }} transition={{ delay: 0.075, type: 'spring' }}>
          <CheckCircleIcon aria-hidden="true" className="size-4" />
        </motion.span>}
        {status === 'working' ? <><CircleDashedIcon aria-hidden="true" className="size-4 motion-safe:animate-spin" /><span className="sr-only">{working}</span></>
          : status === 'done' ? done : children}
      </motion.span>
    </AnimatePresence>
  </Button>;
}

/** The status for one StatusButton: `run` shows the work, then what was done, then the button again. A failure returns it at once and is thrown on. */
export function useStatus() {
  const [status, setStatus] = useState<ButtonStatus>('idle');
  const run = useCallback(async (work: () => Promise<unknown>) => {
    setStatus('working');
    try { await work(); } catch (cause) { setStatus('idle'); throw cause; }
    setStatus('done');
    await wait(DONE_MS);
    setStatus('idle');
  }, []);
  return [status, run] as const;
}
