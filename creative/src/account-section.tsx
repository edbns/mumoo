import type { ReactNode } from 'react';

/** A page of the account: one centred column, as tall as the layer, so an empty state can sit in its middle. */
export function AccountColumn({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return <main className={`mx-auto flex w-full flex-1 flex-col gap-4 px-6 pb-24 pt-6 ${wide ? 'max-w-[1400px]' : 'max-w-[640px]'}`}>{children}</main>;
}

/** A titled panel of the account, in the same black as the rows of the main screen. */
export function AccountSection({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return <section aria-label={label} className="flex flex-col gap-4 rounded-[var(--radius-panel)] bg-background p-5">
    <div className="flex min-h-9 items-center justify-between gap-3">
      <h2 className="m-0 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</h2>
      {aside}
    </div>
    {children}
  </section>;
}

/** What a page or panel says while it has nothing to show: in the middle of the space left, both ways. */
export function EmptyState({ children, action, className = '' }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return <div className={`flex flex-1 flex-col items-center justify-center gap-4 text-center ${className}`}>
    <p className="m-0 max-w-sm text-sm text-balance text-muted-foreground">{children}</p>
    {action}
  </div>;
}
