const pulse = 'animate-pulse rounded-full bg-muted';
const control = 'h-[var(--control-height-md)] animate-pulse rounded-[var(--radius-control)] bg-muted';
const SERVICE_ROWS = 8;

/** Whether this browser keeps a found song for a link not yet published (smart-links.ts keeps it under this key). */
function draftKept() {
  try { return Boolean(JSON.parse(localStorage.getItem('mumoo-link-draft') ?? 'null')?.link); } catch { return false; }
}

/**
 * The smart link page's shape in grey, until its code has loaded and the phone preview has drawn: the song section with its
 * search field on the left (with the song's details and its buttons when a draft is kept), the phone on the right, laid out
 * as the page is so nothing jumps when it arrives.
 */
export function LinksSkeleton({ className = '', hidden = false, filled }: { className?: string; hidden?: boolean; filled?: boolean }) {
  const full = filled ?? draftKept();
  return <div aria-busy={!hidden} aria-hidden={hidden || undefined} aria-label="Loading smart links" className={`mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-6 pb-24 pt-6 ${className}`}>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-[var(--radius-panel)] bg-background p-5">
          <div className="flex min-h-9 items-center"><span className={`${pulse} h-3 w-24`} /></div>
          {!full && <span className={`${pulse} h-3.5 w-4/5`} />}
          <span className={control} />
          {full && <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map(index => <div key={index} className="flex flex-col gap-1.5"><span className={`${pulse} h-3 w-12`} /><span className={control} /></div>)}
          </div>}
        </div>
        {full && <div className="flex flex-col gap-4 rounded-[var(--radius-panel)] bg-background p-5">
          <div className="flex min-h-9 items-center"><span className={`${pulse} h-3 w-20`} /></div>
          <span className={`${pulse} h-3.5 w-11/12`} />
          {Array.from({ length: SERVICE_ROWS }, (_, index) => <span key={index} className="h-[52px] animate-pulse rounded-[var(--radius-control)] bg-muted" />)}
        </div>}
      </div>
      <div className="flex flex-col items-center gap-4">
        <span className="block aspect-[1/2] w-[320px] max-w-full animate-pulse rounded-[44px] bg-muted" />
        <span className={`${pulse} h-3 w-24`} />
      </div>
    </div>
  </div>;
}
