import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

/**
 * A question in the site's own popup. Once confirmed, its button shows the work going on ("Deleting…") and the popup cannot be
 * closed until it is done; then it closes. A failure stays in the popup with the reason.
 */
export function ActionDialog({
  open, onClose, title, description, children, confirmLabel, cancelLabel = 'Cancel', destructive = false, confirmDisabled = false,
  working, onConfirm, onDone,
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
  /** What the button says while the work runs ("Deleting…"). */
  working?: string;
  onConfirm: () => Promise<void>;
  /** After the work, once the popup is closed. */
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setBusy(false); setError(''); }
  }, [open]);

  async function confirm() {
    setBusy(true); setError('');
    try {
      await onConfirm();
      onClose(); onDone?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That didn’t work. Try again in a sec.');
      setBusy(false);
    }
  }

  // The question as it was confirmed: what it names may change under it while the work runs (a selection emptied).
  const asked = useRef(title);
  if (!busy) asked.current = title;
  return <Modal open={open} onClose={busy ? () => {} : onClose} closeOnEscape={!busy} closeOnBackdrop={!busy} showClose={!busy}
    title={asked.current} description={description}>
    <div className="flex flex-col gap-4" aria-busy={busy}>
      {children}
      {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" disabled={busy} onClick={onClose}>{cancelLabel}</Button>
        <Button variant={destructive ? 'destructive' : 'default'} disabled={!busy && confirmDisabled} aria-disabled={busy || undefined}
          className={busy ? 'cursor-wait' : undefined} onClick={() => { if (!busy) void confirm(); }}>
          {busy && <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />}
          {busy ? working ?? confirmLabel : confirmLabel}
        </Button>
      </div>
    </div>
  </Modal>;
}
