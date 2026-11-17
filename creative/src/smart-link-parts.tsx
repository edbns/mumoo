import { useState, type ReactNode } from 'react';
import { CheckIcon, CopyIcon, ExternalLinkIcon } from 'lucide-react';
import { addressOf } from './smart-links';

const COPIED_MS = 1500;

export const iconButton = 'grid size-9 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-control)] bg-transparent p-0 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30';
export const textButton = 'cursor-pointer bg-transparent p-0 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground';

/** A smart links page, titled like History: its name large on the left, a short note on the right. */
export function LinksSection({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return <div role="region" aria-label={label} className="flex flex-col gap-4">
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <h2 className="m-0 text-2xl font-semibold tracking-tight">{label}</h2>
      {aside && <p className="m-0 text-sm text-muted-foreground">{aside}</p>}
    </div>
    {children}
  </div>;
}

export function Cover({ src, size }: { src: string | null; size: string }) {
  return src ? <img src={src} alt="" className={`${size} shrink-0 rounded-[6px] object-cover`} /> : <span className={`${size} shrink-0 rounded-[6px] bg-muted`} />;
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className={iconButton} aria-label={copied ? 'Copied' : 'Copy link'}
    onClick={() => void navigator.clipboard.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), COPIED_MS); })}>
    {copied ? <CheckIcon className="size-4 text-primary" /> : <CopyIcon className="size-4" />}
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
