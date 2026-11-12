import { ImageIcon, UploadIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { Modal } from '@/components/ui/modal';
import { PhoneUpload } from './phone-upload';
import { IS_ALIGNMENT_STAGING } from './staging-alignment';
import { ACCEPT, MAX_SHELF_PICTURES, SHELF_PICTURE } from './uploads';
import type { Uploads } from './use-uploads';

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
  const use = SHELF_PICTURE;
  const sending = uploads.sending?.use === use ? uploads.sending : null;
  const preparing = uploads.current.filter(item => item.use === use && item.status === 'preparing').length;
  const problem = uploads.problem && (uploads.problem.use === use || uploads.problem.use === null) ? uploads.problem.message : '';
  const of = sending && sending.total > 1 ? ` ${sending.index + 1} of ${sending.total}` : '';
  const status = sending
    ? (sending.share === undefined ? `Sending${of}…` : sending.share < 1 ? `Sending${of} ${Math.round(sending.share * 100)}%` : `Starting${of}…`)
    : preparing ? (preparing > 1 ? `Preparing ${preparing}…` : 'Preparing…') : '';

  async function pick(files: File[]) {
    onChange();
    setOpen(false);
    await uploads.add(files, use);
  }

  return <>
    {problem && <span role="alert" className="text-sm text-destructive">{problem}</span>}
    {status && <span role="status" className="text-sm text-muted-foreground">{status}</span>}
    <Button variant="secondary" disabled={uploads.pending || uploads.sending !== null} onClick={() => setOpen(true)}>
      <UploadIcon aria-hidden="true" className="-ms-1 size-4 opacity-60" />
      Upload
    </Button>
    <Modal open={open} onClose={() => setOpen(false)}
      title="Use your own photos or videos"
      description={`Pick up to ${MAX_SHELF_PICTURES} at once; each creative is drawn from one of them. By uploading you confirm you own the rights to them. Only videos or GIFs leave out the creatives that need a photo.`}>
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
        </div>
        : <p className="text-sm text-muted-foreground">Sign in (top right) to use your own pictures.</p>}
    </Modal>
  </>;
}
