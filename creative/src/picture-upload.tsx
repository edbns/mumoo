import { ImageIcon, UploadIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { Modal } from '@/components/ui/modal';
import { ACCEPT, photoOnly, type PictureUse } from './uploads';
import type { Uploads } from './use-uploads';

/**
 * One row's own picture: a button that opens the upload popup, and a plain line about what is happening to it.
 * Adding a picture replaces the old one once it is ready, so nothing needs choosing or removing.
 */
export function PictureUpload({ use, uploads, onChange }: {
  use: PictureUse;
  uploads: Uploads;
  /** Called before the row's picture changes, so the page can stop what is playing. */
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const photo = photoOnly(use);
  const sending = uploads.sending?.use === use ? uploads.sending : null;
  const preparing = uploads.current.some(item => item.use === use && item.status === 'preparing');
  const problem = uploads.problem && (uploads.problem.use === use || uploads.problem.use === null) ? uploads.problem.message : '';
  const status = sending
    ? (sending.share === undefined ? 'Sending…' : sending.share < 1 ? `Sending ${Math.round(sending.share * 100)}%` : 'Starting…')
    : preparing ? 'Preparing…' : '';

  async function pick(file: File) {
    onChange();
    await uploads.add(file, use);
    setOpen(false);
  }

  return <>
    {problem && <span role="alert" className="text-sm text-destructive">{problem}</span>}
    {status && <span role="status" className="text-sm text-muted-foreground">{status}</span>}
    <Button variant="secondary" disabled={uploads.pending || uploads.sending !== null || preparing} onClick={() => setOpen(true)}>
      <UploadIcon aria-hidden="true" className="-ms-1 size-4 opacity-60" />
      Upload
    </Button>
    <Modal open={open} onClose={() => setOpen(false)}
      title={photo ? 'Use your own photo' : 'Use your own photo or video'}
      description="By uploading you confirm you own the rights to it.">
      {uploads.signedIn
        ? <div className="flex flex-col gap-3">
          <FileDropzone
          accept={ACCEPT[use]}
          icon={ImageIcon}
          title={photo ? 'Drop your photo here' : 'Drop your photo, video or GIF here'}
          hint={photo ? 'JPG, PNG or WebP' : 'JPG, PNG, WebP, MP4, MOV, WebM or GIF'}
          buttonLabel={photo ? 'Select photo' : 'Select file'}
          inputLabel="Picture file"
          onSelect={file => void pick(file)}
          />
          {status && <p role="status" className="text-center text-sm text-muted-foreground">{status}</p>}
        </div>
        : <p className="text-sm text-muted-foreground">Sign in (top right) to use your own picture.</p>}
    </Modal>
  </>;
}
