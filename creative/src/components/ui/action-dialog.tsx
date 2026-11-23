import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DONE_MS, StatusButton, wait, type ButtonStatus } from '@/components/ui/status-button';
import { Modal } from '@/components/ui/modal';
import { friendlyError } from '../../friendly-error';

/**
 * A question in the site's own popup. Once confirmed, its button shows the work going on and the popup cannot be closed until
 * it is done; then, with a `done` word, the button says it ("Deleted") for a moment, and the popup closes. A failure stays in
 * the popup with the reason.
 */
export function ActionDialog({
  open, onClose, title, description, children, confirmLabel, cancelLabel = 'Cancel', destructive = false, confirmDisabled = false,
  working, done, onConfirm, onDone,
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
  /** What the work is called while it runs ("Deleting…"), for a screen reader. */
  working?: string;
  /** What the button says once the work is done ("Deleted"). */
  done?: string;
  onConfirm: () => Promise<void>;
  /** After the work, once the popup is closed. */
  onDone?: () => void;
}) {
  const [status, setStatus] = useState<ButtonStatus>('idle');
  const [error, setError] = useState('');
  const busy = status !== 'idle';

  useEffect(() => {
    if (open) { setStatus('idle'); setError(''); }
  }, [open]);

  async function confirm() {
    setStatus('working'); setError('');
    try {
      await onConfirm();
    } catch (cause) {
      setError(friendlyError(cause, 'That didn’t work. Try again in a sec.'));
      setStatus('idle');
      return;
    }
    if (done) { setStatus('done'); await wait(DONE_MS); }
    onClose(); onDone?.();
  }

  // The question as it was confirmed: what it names may change under it while the work runs (a selection emptied).
  const asked = useRef(title);
  if (!busy) asked.current = title;
  return <Modal open={open} onClose={busy ? () => {} : onClose} closeOnEscape={!busy} closeOnBackdrop={!busy} showClose={!busy}
    title={asked.current} description={description}>
    <div className="flex flex-col gap-4" aria-busy={busy}>
      {children}
      {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" disabled={busy} onClick={onClose}>{cancelLabel}</Button>
        <StatusButton variant={destructive ? 'destructive' : 'default'} disabled={!busy && confirmDisabled} status={status}
          working={working ?? confirmLabel} done={done} className="min-w-28" onClick={() => void confirm()}>
          {confirmLabel}
        </StatusButton>
      </div>
    </div>
  </Modal>;
}
