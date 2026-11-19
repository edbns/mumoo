const pulse = 'animate-pulse rounded-full bg-muted';

/**
 * The smart link page's shape in grey, until its code has loaded and the phone preview has drawn: the song section with its
 * search field and button on the left, the phone on the right, laid out exactly as the page is so nothing jumps when it arrives.
 */
export function LinksSkeleton({ className = '', hidden = false }: { className?: string; hidden?: boolean }) {
  return <div aria-busy={!hidden} aria-hidden={hidden || undefined} aria-label="Loading smart links" className={`mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-6 pb-24 pt-6 ${className}`}>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4 rounded-[var(--radius-panel)] bg-background p-5">
        <div className="flex min-h-9 items-center"><span className={`${pulse} h-3 w-24`} /></div>
        <span className={`${pulse} h-3.5 w-4/5`} />
        <div className="flex gap-2">
          <span className="h-[var(--control-height-md)] flex-1 animate-pulse rounded-[var(--radius-control)] bg-muted" />
          <span className="h-[var(--control-height-md)] w-20 animate-pulse rounded-[var(--radius-control)] bg-muted" />
        </div>
      </div>
      <div className="flex flex-col items-center gap-4">
        <span className="block aspect-[1/2] w-[320px] max-w-full animate-pulse rounded-[44px] bg-muted" />
        <span className={`${pulse} h-3 w-52`} />
      </div>
    </div>
  </div>;
}
