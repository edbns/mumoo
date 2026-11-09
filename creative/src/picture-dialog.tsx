import { useEffect, useRef, useState } from 'react';
import { PICTURE_RULES, type PictureUse } from './uploads';
import type { Uploads } from './use-uploads';

const COPY: Record<PictureUse, { title: string; add: string }> = {
  dust: { title: 'Your photo for Dust', add: 'Choose a photo' },
  filter: { title: 'Your pictures for Filters', add: 'Choose a photo, video or GIF' },
};

/**
 * The pop-up for one row's own pictures: what it accepts and how many it keeps, the rights confirmation, the
 * pictures it holds (choose which one the row draws from, or remove one), and the file picker.
 */
export function PictureDialog({ use, open, onClose, uploads, chosenId, onChoose }: {
  use: PictureUse;
  open: boolean;
  onClose: () => void;
  uploads: Uploads;
  chosenId: string | null;
  onChoose: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [rights, setRights] = useState(false);
  const rules = PICTURE_RULES[use];
  const mine = (uploads.list ?? []).filter(item => item.use === use);
  const full = mine.length >= rules.limit;
  const sending = uploads.progress !== undefined;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  async function pick(file: File | undefined) {
    if (!file) return;
    await uploads.add(file, use);
    if (input.current) input.current.value = '';
  }

  return <dialog ref={dialog} className="picture-dialog" aria-labelledby={`picture-dialog-${use}`} onClose={onClose}>
    <h3 id={`picture-dialog-${use}`}>{COPY[use].title}</h3>
    <ul className="picture-rules">{rules.rules.map(rule => <li key={rule}>{rule}</li>)}</ul>
    {!uploads.signedIn
      ? <p className="hint">Sign in (top right) to add your own picture. It stays private to you.</p>
      : <>
        <p className="hint">{mine.length} of {rules.limit} in use</p>
        {mine.length > 0 && <ul className="own-photo-list">
          {mine.map(item => <li key={item.id}>
            {item.status === 'ready' && item.url
              ? <button type="button" aria-pressed={chosenId === item.id} aria-label={item.kind === 'motion' ? 'Use this video' : 'Use this photo'} onClick={() => onChoose(item.id)}>
                <img src={item.url} alt="" />
                {item.kind === 'motion' && <span className="motion-mark" aria-hidden="true">▶</span>}
              </button>
              : <div className={`own-photo-wait${item.status === 'failed' ? ' failed' : ''}`} role="status">
                {item.status === 'failed' ? item.error : 'Preparing…'}
              </div>}
            <button type="button" className="link-button" disabled={sending} onClick={() => void uploads.remove(item.id)}>Remove</button>
          </li>)}
        </ul>}
        <label className="rights">
          <input type="checkbox" checked={rights} onChange={event => setRights(event.target.checked)} />
          <span>I own this or have the right to use it, and the people in it are happy for me to.</span>
        </label>
        <input ref={input} type="file" accept={rules.accepts} hidden onChange={event => void pick(event.target.files?.[0])} />
        <button type="button" className="primary-accent" disabled={!rights || full || sending} onClick={() => input.current?.click()}>
          {sending ? (uploads.progress! < 1 ? `Sending ${Math.round(uploads.progress! * 100)}%` : 'Starting…') : COPY[use].add}
        </button>
        {full && <p className="hint">That is the limit. Remove one to add another.</p>}
      </>}
    {uploads.error && <p role="alert">{uploads.error}</p>}
    <div className="trim-actions"><button type="button" className="secondary" onClick={onClose}>Done</button></div>
  </dialog>;
}
