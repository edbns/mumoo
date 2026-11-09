import { useRef } from 'react';
import { ACCEPT, type PictureUse, type Upload } from './uploads';
import type { Uploads } from './use-uploads';

const LABEL: Record<PictureUse, string> = { dust: 'Upload photo', riso: 'Upload photo', filter: 'Upload photo, video or GIF', window: 'Upload photo, video or GIF' };

/**
 * One row's own picture, as simply as it can be: a button that opens the file picker, one plain sentence about
 * rights, and (only while the row draws an own picture) a way back to ours. Adding a picture replaces the old one
 * once it is ready, so nothing needs choosing or removing.
 */
export function PictureUpload({ use, uploads, active, onChange }: {
  use: PictureUse;
  uploads: Uploads;
  /** The row's own picture that is being drawn now, if any. */
  active: Upload | null;
  /** Called before the row's picture changes, so the page can stop what is playing. */
  onChange: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const sending = uploads.sending?.use === use ? uploads.sending : null;
  const preparing = (uploads.list ?? []).some(item => item.use === use && item.status === 'preparing');
  const problem = uploads.problem && (uploads.problem.use === use || uploads.problem.use === null) ? uploads.problem.message : '';

  function pick(file: File | undefined) {
    if (input.current) input.current.value = '';
    if (!file) return;
    onChange();
    void uploads.add(file, use);
  }

  return <div className="picture-upload">
    <input ref={input} type="file" accept={ACCEPT[use]} hidden onChange={event => pick(event.target.files?.[0])} />
    <button type="button" className="secondary" disabled={!uploads.signedIn || uploads.sending !== null || preparing} onClick={() => input.current?.click()}>
      {LABEL[use]}
    </button>
    <span className="hint">
      {uploads.signedIn || uploads.pending ? 'By uploading you confirm you own the rights to it.' : 'Sign in (top right) to use your own picture.'}
    </span>
    {sending && <span role="status" className="hint">{sending.share === undefined ? 'Sending…' : sending.share < 1 ? `Sending ${Math.round(sending.share * 100)}%` : 'Starting…'}</span>}
    {!sending && preparing && <span role="status" className="hint">Preparing…</span>}
    {active && !preparing && !sending && <button type="button" className="link-button" onClick={() => { onChange(); void uploads.remove(active); }}>Use ours again</button>}
    {problem && <span role="alert" className="hint picture-problem">{problem}</span>}
  </div>;
}
