import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';
import type { CartItem } from './cart';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH } from './pack-renderer';

export type CartLine = {
  item: CartItem;
  title: string;
  /** False when what it was made from (the person's own picture) is no longer there. */
  available: boolean;
};

/** The cart button in the page header, and the panel it opens: every liked creative, what it costs and one place to get them. */
export function Cart({ lines, open, busy, status, onOpen, onClose, onRemove, onDownload, paint, onError }: {
  lines: CartLine[];
  open: boolean;
  busy: boolean;
  status: string;
  onOpen: () => void;
  onClose: () => void;
  onRemove: (id: string) => void;
  onDownload: () => void;
  paint: (item: CartItem, canvas: HTMLCanvasElement) => Promise<void>;
  onError: (cause: unknown) => void;
}) {
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const latest = useRef({ paint, onError });
  latest.current = { paint, onError };
  const ids = lines.filter(line => line.available).map(line => line.item.id).join();

  // Posters are drawn when the panel opens or its items change, one after another.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      for (const id of ids.split(',').filter(Boolean)) {
        const canvas = canvases.current.get(id);
        const line = lines.find(item => item.item.id === id);
        if (!alive || !canvas || !line) return;
        await latest.current.paint(line.item, canvas).catch(latest.current.onError);
      }
    })();
    return () => { alive = false; };
  }, [open, ids]);

  const ready = lines.filter(line => line.available);
  const button = document.getElementById('masthead-cart');
  return <>
    {button && createPortal(
      <button type="button" className="cart-button secondary" onClick={onOpen} aria-label={`Cart, ${lines.length} ${lines.length === 1 ? 'creative' : 'creatives'}`}>
        Cart{lines.length > 0 && <span className="cart-count">{lines.length}</span>}
      </button>,
      button,
    )}
    {open && <aside className="cart-panel" role="dialog" aria-label="Your cart">
      <div className="cart-head">
        <h2>Your cart</h2>
        <button type="button" className="secondary" onClick={onClose}>Close</button>
      </div>
      {lines.length === 0
        ? <p className="hint">Add the creatives you like. They stay here while you refresh for more.</p>
        : <ul className="cart-list">
          {lines.map(({ item, title, available }) => <li key={item.id} className="cart-line">
            {available
              ? <canvas ref={node => { if (node) canvases.current.set(item.id, node); else canvases.current.delete(item.id); }} width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} aria-hidden="true" />
              : <div className="cart-missing">Picture removed</div>}
            <div className="cart-line-text">
              <strong>{title}</strong>
              <span>1 token</span>
              {!available && <span className="hint">The picture it used is no longer available. Remove it.</span>}
            </div>
            <button type="button" className="link-button" disabled={busy} onClick={() => onRemove(item.id)}>Remove</button>
          </li>)}
        </ul>}
      {lines.length > 0 && <div className="cart-foot">
        <p className="cart-total"><span>Total</span><strong>{ready.length} {ready.length === 1 ? 'token' : 'tokens'}</strong></p>
        <button type="button" className="primary-accent" disabled={busy || ready.length === 0} onClick={onDownload}>
          Download {ready.length === 1 ? 'MP4' : `${ready.length} creatives`}
        </button>
        <p className="hint">No charge on staging yet. Videos are made in the cloud when you download.</p>
      </div>}
      {status && <p role="status">{status}</p>}
    </aside>}
  </>;
}
