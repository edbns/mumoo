import type { CartItem } from './cart';
import { shouldAskToNotify, type DownloadMessage, type DownloadProgress } from './use-cart-download';

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

/** The cart button in the page header, on every page. */
export function CartButton({ count, progress, onOpen }: { count: number; progress: DownloadProgress | null; onOpen: () => void }) {
  return <button type="button" className="cart-button secondary" onClick={onOpen} aria-label={`Cart, ${count} ${count === 1 ? 'creative' : 'creatives'}${progress ? `, ${progress.label}` : ''}`}>
    Cart{count > 0 && <span className="cart-count">{count}</span>}
    {progress && <span className="cart-working" aria-hidden="true">{progress.percent}%</span>}
  </button>;
}

/** The panel the button opens: every liked creative for this song and clip, what it costs and one place to get them. */
export function CartPanel({ lines, progress, action, onClose, onRemove }: {
  lines: CartLine[];
  progress: DownloadProgress | null;
  action: CartAction;
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const ready = lines.filter(line => line.available);
  const busy = progress !== null;
  return <aside className="cart-panel" role="dialog" aria-label="Your cart">
    <div className="cart-head">
      <h2>Your cart</h2>
      <button type="button" className="secondary" onClick={onClose}>Close</button>
    </div>
    {lines.length === 0
      ? <p className="hint">Add the creatives you like. They stay here, for this song and clip, while you refresh for more.</p>
      : <ul className="cart-list">
        {lines.map(({ item, title, available }) => <li key={item.id} className="cart-line">
          {available
            ? <img src={item.thumb} width="54" height="96" alt="" />
            : <div className="cart-missing">Picture removed</div>}
          <div className="cart-line-text">
            <strong>{title}</strong>
            <span>1 token</span>
            {!available && <span className="hint">The picture it used is no longer available. Remove it.</span>}
          </div>
          <button type="button" className="link-button" disabled={busy} onClick={() => onRemove(item.id)}>Remove</button>
        </li>)}
      </ul>}
    {progress && <div className="cart-progress" role="status">
      <progress max={100} value={progress.percent} aria-label="Download progress" />
      <strong>{progress.label}</strong>
      <p className="hint">This can take a few minutes. You can close this panel; we will tell you when your creatives are ready.</p>
    </div>}
    {lines.length > 0 && <div className="cart-foot">
      <p className="cart-total"><span>Total</span><strong>{ready.length} {ready.length === 1 ? 'token' : 'tokens'}</strong></p>
      {action.kind === 'download' && <>
        <button type="button" className="primary-accent" disabled={busy || ready.length === 0} onClick={action.run}>
          Download {ready.length === 1 ? 'MP4' : `${ready.length} creatives`}
        </button>
        {!busy && shouldAskToNotify() && <p className="hint">We will ask to notify you when your creatives are ready, so you can do something else meanwhile.</p>}
        <p className="hint">No charge on staging yet. Videos are made in the cloud when you download.</p>
      </>}
      {action.kind === 'go' && <>
        <button type="button" className="primary-accent" disabled={busy} onClick={action.run}>Go to your creatives</button>
        <p className="hint">Videos are made and downloaded from your creatives page.</p>
      </>}
      {action.kind === 'blocked' && <p className="hint">{action.reason}</p>}
    </div>}
  </aside>;
}

/** How a download ended, shown on whatever page the person is on until they dismiss it. */
export function DownloadNotice({ message, onDismiss }: { message: DownloadMessage; onDismiss: () => void }) {
  return <div className={`download-notice ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
    <span>{message.text}</span>
    <button type="button" className="link-button" onClick={onDismiss}>Dismiss</button>
  </div>;
}
