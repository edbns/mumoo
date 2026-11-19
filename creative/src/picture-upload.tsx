import { CheckIcon, ImageIcon, PlayIcon, UploadIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { Modal } from '@/components/ui/modal';
import { PhoneUpload } from './phone-upload';
import { IS_ALIGNMENT_STAGING } from './staging-alignment';
import { ACCEPT, MAX_SHELF_PICTURES } from './uploads';
import type { Uploads } from './use-uploads';
import { RenderProgress } from './render-progress';

const UPLOAD_PHASES = [
  { at: 0, label: 'Sending your media' },
  { at: 70, label: 'Getting it ready' },
  { at: 95, label: 'Almost there' },
];

/** Shown in place of the shelf while a batch comes in: the Director starts once all of it is here. */
export function UploadProgress({ uploads }: { uploads: Uploads }) {
  const { sending, batchPercent } = uploads;
  if (batchPercent === null) return null;
  const label = sending
    ? (sending.total > 1 ? `Sending ${sending.index + 1} of ${sending.total}` : 'Sending')
    : 'Preparing in the cloud';
  return <RenderProgress phases={UPLOAD_PHASES} progress={{ percent: batchPercent, label }}
    note="Creatives use your media once everything’s here. Don’t close this window." />;
}

/** What the person uploaded before (kept in History → Uploads), to tick and put back on the shelf together. */
function EarlierUploads({ uploads, onUse }: { uploads: Uploads; onUse: (ids: string[]) => void }) {
  const earlier = (uploads.list ?? []).filter(item => item.status === 'ready' && item.url);
  const [chosen, setChosen] = useState<string[]>(() => uploads.current.map(item => item.id));
  if (!earlier.length) return null;
  const toggle = (id: string) => setChosen(current => current.includes(id)
    ? current.filter(other => other !== id)
    : current.length < MAX_SHELF_PICTURES ? [...current, id] : current);
  return <section className="flex flex-col gap-3 pt-2" aria-label="Your uploads">
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="m-0 text-sm font-semibold text-foreground">Or use your uploads</h3>
      <span className="text-xs text-muted-foreground">{chosen.length} of {MAX_SHELF_PICTURES}</span>
    </div>
    <ul className="m-0 grid max-h-56 list-none grid-cols-4 gap-2 overflow-y-auto p-0.5 sm:grid-cols-5">
      {earlier.map(item => {
        const on = chosen.includes(item.id);
        return <li key={item.id}>
          <button type="button" aria-pressed={on} onClick={() => toggle(item.id)}
            aria-label={`${item.kind === 'motion' ? 'Video' : 'Photo'} from ${new Date(item.createdAt).toLocaleDateString()}`}
            className={cn('relative block aspect-square w-full overflow-hidden rounded-xl bg-secondary p-0 outline-none transition',
              'focus-visible:ring-2 focus-visible:ring-primary', on ? 'ring-2 ring-primary' : 'opacity-80 hover:opacity-100')}>
            <img src={item.url} alt="" loading="lazy" className="size-full object-cover" />
            {item.kind === 'motion' && <PlayIcon aria-hidden="true" className="absolute bottom-1.5 left-1.5 size-3.5 fill-white text-white drop-shadow" />}
            {on && <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
              <CheckIcon aria-hidden="true" className="size-3.5" strokeWidth={3} />
            </span>}
          </button>
        </li>;
      })}
    </ul>
    <Button disabled={!chosen.length} onClick={() => onUse(chosen)}>
      {chosen.length ? `Use ${chosen.length === 1 ? 'this one' : `these ${chosen.length}`}` : 'Pick one or more'}
    </Button>
  </section>;
}

/**
 * The shelf's own pictures: one button that opens the upload popup (up to ten photos, videos or GIFs, picked together), and a
 * plain line about what is happening to them. The creatives are dealt from all of them, so nothing needs choosing or removing.
 */
export function PictureUpload({ uploads, token, onChange }: {
  uploads: Uploads;
  /** Staging access, for sending the pictures from a phone. */
  token: string;
  /** Called before the pictures change, so the page can stop what is playing. */
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { sending } = uploads;
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
    <Modal open={open} onClose={() => setOpen(false)}
      title="Use your own photos or videos"
      description={`Pick up to ${MAX_SHELF_PICTURES} at once — each creative uses one of them. By uploading you confirm you own the rights. Videos/GIFs skip the ones that need a photo.`}>
      {uploads.signedIn
        ? <div className="flex flex-col gap-3">
          <FileDropzone
          accept={ACCEPT}
          icon={ImageIcon}
          title={`Drop up to ${MAX_SHELF_PICTURES} photos, videos or GIFs here`}
          hint="JPG, PNG, WebP, MP4, MOV, WebM or GIF"
          buttonLabel="Select files"
          inputLabel="Picture files"
          onSelectMany={files => void pick(files)}
          />
          {IS_ALIGNMENT_STAGING && token && !sending && <PhoneUpload token={token} kind="picture" onFiles={files => void pick(files)} />}
          <EarlierUploads uploads={uploads} onUse={ids => { onChange(); setOpen(false); uploads.reuse(ids); }} />
        </div>
        : <p className="text-sm text-muted-foreground">Sign in (top right) to use your own pictures.</p>}
    </Modal>
  </>;
}
