import { CheckIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { ProgressiveFluxLoader } from '@/components/ui/progressive-flux-loader';

/** Tells the dialog how far the work has got, when it knows: `done` of `total`, with an optional line ("Deleting 2 of 5"). */
export type ReportProgress = (done: number, total: number, line?: string) => void;

/** How long the finished state is seen before the dialog closes itself. */
const DONE_MS = 900;

/**
 * A question in the site's own popup, then the work behind it: once confirmed it cannot be closed, shows the green bar (real
 * progress when `report` is called, else a steady creep) and a tick when it is done, then closes. A failure comes back to the question.
 */
export function ActionDialog({
  open, onClose, title, description, children, confirmLabel, cancelLabel = 'Cancel', destructive = false, confirmDisabled = false,
  working, done = 'Done', onConfirm, onDone,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** More of the question, such as a field to type into. */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmDisabled?: boolean;
  /** What the bar says while the work runs ("Deleting your account"). Without it the work is instant: no bar, the dialog just closes. */
  working?: string;
  done?: string;
  onConfirm: (report: ReportProgress) => Promise<void>;
  /** After the finished state has been seen; the dialog is closed by then. */
  onDone?: () => void;
}) {
  const [stage, setStage] = useState<'ask' | 'working' | 'done'>('ask');
  const [percent, setPercent] = useState(0);
  const [line, setLine] = useState('');
  const [error, setError] = useState('');
  const reported = useRef(false);

  useEffect(() => {
    if (open) { setStage('ask'); setPercent(0); setLine(''); setError(''); }
  }, [open]);

  // With nothing reported, the bar creeps towards 90% and waits there for the answer.
  useEffect(() => {
    if (stage !== 'working') return;
    const timer = setInterval(() => {
      if (!reported.current) setPercent(current => current + (90 - current) * 0.08);
    }, 200);
    return () => clearInterval(timer);
  }, [stage]);

  async function confirm() {
    if (!working) {
      await onConfirm(() => {});
      onClose(); onDone?.();
      return;
    }
    reported.current = false;
    setStage('working'); setPercent(4); setLine(''); setError('');
    try {
      await onConfirm((count, total, next) => {
        reported.current = true;
        setPercent(Math.max(4, Math.min(96, (count / Math.max(1, total)) * 100)));
        if (next !== undefined) setLine(next);
      });
      setPercent(100); setStage('done');
      setTimeout(() => { onClose(); onDone?.(); }, DONE_MS);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Try again in a moment.');
      setStage('ask');
    }
  }

  const busy = stage !== 'ask';
  // The question as it was confirmed: what it names may change under it while the work runs (a selection emptied).
  const asked = useRef(title);
  if (!busy) asked.current = title;
  return <Modal open={open} onClose={busy ? () => {} : onClose} closeOnEscape={!busy} closeOnBackdrop={!busy} showClose={!busy}
    title={asked.current} description={busy ? undefined : description}>
    {busy
      ? <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 pt-2 text-center">
        <ProgressiveFluxLoader value={percent} phases={[{ at: 0, label: working ?? '' }, { at: 100, label: done }]}
          className="gap-5 [--flux-from:var(--primary)] [--flux-to:#d4ff9a]" textClassName="text-xl font-semibold text-foreground" barClassName="h-3" />
        <p className="m-0 flex min-h-5 items-center gap-1.5 text-sm text-muted-foreground">
          {stage === 'done'
            ? <><CheckIcon aria-hidden="true" className="size-4 text-primary" strokeWidth={3} />All done</>
            : line || 'This only takes a moment. Keep this window open.'}
        </p>
      </div>
      : <div className="flex flex-col gap-4">
        {children}
        {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>{cancelLabel}</Button>
          <Button variant={destructive ? 'destructive' : 'default'} disabled={confirmDisabled} onClick={() => void confirm()}>{confirmLabel}</Button>
        </div>
      </div>}
  </Modal>;
}
