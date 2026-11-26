import { CheckIcon, ImageIcon, PlayIcon, UploadIcon, XIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LazyMedia } from './lazy-media';
import { Button } from '@/components/ui/button';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { Modal } from '@/components/ui/modal';
import { PhoneUpload } from './phone-upload';
import { IS_ALIGNMENT_STAGING } from './staging-alignment';
import { ACCEPT, MAX_SHELF_PICTURES, type Upload } from './uploads';
import type { Uploads } from './use-uploads';
import { RenderProgress } from './render-progress';

const UPLOAD_PHASES = [
  { at: 0, label: 'Uploading…' },
  { at: 70, label: 'Processing…' },
  { at: 95, label: 'Almost ready…' },
];

/** Shown in place of the shelf while a batch comes in: the Director starts once all of it is here. */
export function UploadProgress({ uploads }: { uploads: Uploads }) {
  const { sending, batchPercent } = uploads;
  if (batchPercent === null) return null;
  const label = sending
    ? (sending.total > 1 ? `Uploading ${sending.index + 1} of ${sending.total}…` : 'Uploading…')
    : 'Prepping in the cloud…';
  return <RenderProgress phases={UPLOAD_PHASES} progress={{ percent: batchPercent, label }}
    note="Your visuals will appear in the templates as soon as they’re ready. Keep this tab open." />;
}

const readyUploads = (uploads: Uploads) => (uploads.list ?? []).filter(item => item.status === 'ready' && item.url);
const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * What the person uploaded before (kept in Media → Uploads), full screen like the Media page: clips play, and up to ten are
 * ticked together and put back on the shelf.
 */
function UploadsPicker({ uploads, onUse, onClose }: { uploads: Uploads; onUse: (ids: string[]) => void; onClose: () => void }) {
  const earlier = readyUploads(uploads);
  const [chosen, setChosen] = useState<string[]>(() => uploads.current.map(item => item.id).filter(id => earlier.some(item => item.id === id)));
  const [watching, setWatching] = useState<Upload | null>(null);
  const full = chosen.length >= MAX_SHELF_PICTURES;
  const toggle = (id: string) => setChosen(current => current.includes(id)
    ? current.filter(other => other !== id)
    : current.length < MAX_SHELF_PICTURES ? [...current, id] : current);

  useEffect(() => {
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = scroll; };
  }, []);
  useEffect(() => {
    if (watching) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [watching, onClose]);

  return createPortal(<div role="dialog" aria-modal="true" aria-label="Your uploads" className="fixed inset-0 z-40 overflow-y-auto bg-background">
    <div className="sticky top-0 z-10 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-5 py-4">
        <div className="flex flex-col">
          <h2 className="m-0 text-lg font-semibold text-foreground">Your uploads</h2>
          <span className="text-sm text-muted-foreground">{chosen.length} of {MAX_SHELF_PICTURES} selected</span>
        </div>
        <button type="button" aria-label="Close" onClick={onClose}
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-secondary p-0 text-foreground outline-ring transition-colors hover:bg-muted focus-visible:outline-2">
          <XIcon aria-hidden="true" className="size-5" />
        </button>
      </div>
    </div>
    <ul className="mx-auto m-0 grid max-w-[1100px] list-none grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4 px-5 pt-5 pb-28">
      {earlier.map(item => {
        const on = chosen.includes(item.id);
        const noun = item.kind === 'motion' ? 'Video' : 'Photo';
        return <li key={item.id}
          className={cn('relative aspect-[9/16] overflow-hidden rounded-[var(--radius)] bg-muted transition-[box-shadow,opacity] duration-200',
            on && 'shadow-[0_0_0_2px_var(--primary)]', full && !on && 'opacity-50')}>
          <LazyMedia picture={item.url} />
          <button type="button" aria-pressed={on} disabled={full && !on} aria-label={`${on ? 'Selected' : 'Select'} ${noun.toLowerCase()} from ${dayOf(item.createdAt)}`}
            onClick={() => toggle(item.id)}
            className="absolute inset-0 size-full cursor-pointer rounded-[inherit] bg-transparent p-0 outline-ring focus-visible:outline-2 disabled:cursor-not-allowed" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 to-transparent p-2.5 pt-8 text-xs">{noun} · {dayOf(item.createdAt)}</div>
          {on && <span aria-hidden="true" className="pointer-events-none absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><CheckIcon className="size-4" /></span>}
          {item.kind === 'motion' && item.motionUrl && <button type="button" aria-label={`Play video from ${dayOf(item.createdAt)}`} onClick={() => setWatching(item)}
            className="absolute top-1/2 left-1/2 z-10 flex size-12 -translate-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-black/60 p-0 text-white outline-ring transition-colors hover:bg-black/80 focus-visible:outline-2">
            <PlayIcon aria-hidden="true" className="ml-0.5 size-5 fill-current" />
          </button>}
        </li>;
      })}
    </ul>
    <div className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center p-5">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-secondary/95 p-2 shadow-[0_18px_40px_-16px_#000] backdrop-blur">
        {chosen.length > 0 && <Button variant="ghost" onClick={() => setChosen([])}>Deselect</Button>}
        <Button disabled={!chosen.length} onClick={() => onUse(chosen)}>
          {chosen.length ? `Use ${chosen.length === 1 ? 'this' : `these ${chosen.length}`}` : 'Select media'}
        </Button>
      </div>
    </div>
    <Modal open={watching !== null} onClose={() => setWatching(null)} bare maxWidth={460} maxHeight="calc(100vh - 3rem)"
      title={watching ? `Video from ${dayOf(watching.createdAt)}` : ''}>
      {watching?.motionUrl && <div className="rounded-[var(--radius-panel)] bg-muted p-3 shadow-[0_28px_56px_-24px_#000]">
        <video key={watching.id} src={watching.motionUrl} poster={watching.url} controls autoPlay loop playsInline
          className="max-h-[calc(100vh-8rem)] w-full rounded-[var(--radius)] bg-black object-contain" />
      </div>}
    </Modal>
  </div>, document.body);
}

/**
 * The shelf's own pictures: one button that opens the upload popup (up to ten photos, videos or GIFs, picked together), and a
 * plain line about what is happening to them. The creatives are dealt from all of them, so nothing needs choosing or removing.
 */
export function PictureUpload({ uploads, token, onChange }: {
  uploads: Uploads;
  /** Staging access, for sending the pictures from a phone. */
  token: string;
  /** Called before the pictures change (or the same ones are picked again), so the page can stop what is playing and show them. */
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const { sending } = uploads;
  const hasEarlier = readyUploads(uploads).length > 0;
  const problem = uploads.problem?.message ?? '';

  async function pick(files: File[]) {
    onChange();
    setOpen(false);
    await uploads.add(files);
  }

  return <>
    {problem && <span role="alert" className="text-sm text-destructive">{problem}</span>}
    <Button variant="secondary" disabled={uploads.pending || uploads.batchPercent !== null} onClick={() => setOpen(true)}>
      <UploadIcon aria-hidden="true" className="-ms-1 size-4 opacity-60" />
      Upload
    </Button>
    <Modal open={open} onClose={() => setOpen(false)} title="Upload your photos or videos" hideTitle>
      {uploads.signedIn
        ? <div className="flex flex-col gap-3">
          <FileDropzone
          accept={ACCEPT}
          icon={ImageIcon}
          title={`Drop up to ${MAX_SHELF_PICTURES} photos or clips`}
          hint="JPG, PNG, WebP, MP4, MOV, WebM, GIF"
          buttonLabel="Browse files"
          inputLabel="Picture files"
          note="Only upload media you have the rights to use."
          onSelectMany={files => void pick(files)}
          />
          {IS_ALIGNMENT_STAGING && token && !sending && <PhoneUpload token={token} kind="picture" onFiles={files => void pick(files)} />}
          {hasEarlier && <Button onClick={() => { setOpen(false); setPicking(true); }}>Pick your own uploads</Button>}
        </div>
        : <p className="text-sm text-muted-foreground">Sign in (top right) to use your own media.</p>}
    </Modal>
    {picking && <UploadsPicker uploads={uploads} onClose={() => setPicking(false)}
      onUse={ids => { onChange(); setPicking(false); uploads.reuse(ids); }} />}
  </>;
}
