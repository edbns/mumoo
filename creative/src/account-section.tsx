import type { ReactNode } from 'react';

/** A page of the account: one centred column. */
export function AccountColumn({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return <main className={`mx-auto flex w-full flex-col gap-4 px-6 pb-24 pt-6 ${wide ? 'max-w-[1400px]' : 'max-w-[640px]'}`}>{children}</main>;
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
