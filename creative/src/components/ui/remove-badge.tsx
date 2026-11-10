import { XIcon } from 'lucide-react';

/** The red round × that sits in the top right corner of a picture, to take it away. */
export function RemoveBadge({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-label={label}
      className="absolute top-2 right-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-destructive p-0 text-white outline-ring transition-transform hover:scale-110 focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-50">
      <XIcon aria-hidden="true" className="size-4" />
    </button>
  );
}
