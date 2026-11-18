import { useState } from 'react';
import { CheckIcon, CopyIcon, ExternalLinkIcon } from 'lucide-react';
import { addressOf } from './smart-links';

const COPIED_MS = 1500;

export const iconButton = 'grid size-9 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-control)] bg-transparent p-0 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30';
export const textButton = 'cursor-pointer bg-transparent p-0 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground';

/** The song's cover on its grey square, fading in once it has loaded rather than popping in. */
export function Cover({ src, size }: { src: string | null; size: string }) {
  const [loaded, setLoaded] = useState<string | null>(null);
  return <span className={`${size} block shrink-0 overflow-hidden rounded-[6px] bg-muted`}>
    {src && <img key={src} src={src} alt="" onLoad={() => setLoaded(src)} ref={image => { if (image?.complete && image.naturalWidth) setLoaded(src); }}
      className={`size-full object-cover transition-opacity duration-300 ${loaded === src ? 'opacity-100' : 'opacity-0'}`} />}
  </span>;
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className={iconButton} aria-label={copied ? 'Copied' : 'Copy link'}
    onClick={() => void navigator.clipboard.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), COPIED_MS); })}>
    {copied ? <CheckIcon className="size-4 text-primary" /> : <CopyIcon className="size-4" />}
  </button>;
}

/** A text button that copies `text`, saying so for a moment. */
export function CopyTextButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className={textButton}
    onClick={() => void navigator.clipboard.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), COPIED_MS); })}>
    {copied ? 'Copied' : label}
  </button>;
}

export function OpenButton({ slug }: { slug: string }) {
  return <a className={iconButton} href={addressOf(slug)} target="_blank" rel="noreferrer" aria-label="Open link"><ExternalLinkIcon className="size-4" /></a>;
}

export function AddressLine({ slug }: { slug: string }) {
  const address = addressOf(slug);
  return <div className="flex items-center gap-2 rounded-[var(--radius-control)] bg-muted py-1 pl-3 pr-1">
    <span className="min-w-0 flex-1 truncate text-sm">{address.replace(/^https?:\/\//, '')}</span>
    <CopyButton text={address} />
    <OpenButton slug={slug} />
  </div>;
}
