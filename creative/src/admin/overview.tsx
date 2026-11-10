import type { Overview } from './api';

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="flex flex-col gap-1 rounded-[var(--radius-panel)] bg-card p-5 shadow-sm">
    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-3xl font-semibold tabular-nums">{value}</span>
    {note && <span className="text-xs text-muted-foreground">{note}</span>}
  </div>;
}

function Soon({ label }: { label: string }) {
  return <div className="flex flex-col gap-1 rounded-[var(--radius-panel)] border border-dashed border-border p-5">
    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-sm text-muted-foreground">Appears when payments are connected.</span>
  </div>;
}

/** The first page: a few honest numbers. Money and referrals show here once there are payments. */
export function OverviewView({ overview }: { overview: Overview }) {
  return <div className="mx-auto flex max-w-4xl flex-col gap-8">
    <header><h1 className="m-0 text-2xl font-semibold">Overview</h1></header>
    <section aria-label="Library" className="flex flex-col gap-3">
      <h2 className="m-0 text-sm font-medium text-muted-foreground">Library</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Approved" value={overview.library.approved} note="Used by the templates" />
        <Stat label="Waiting" value={overview.library.pending} note="Uploaded, not approved yet" />
        <Stat label="Hidden" value={overview.library.hidden} />
      </div>
    </section>
    <section aria-label="Health" className="flex flex-col gap-3">
      <h2 className="m-0 text-sm font-medium text-muted-foreground">People and errors</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="People" value={overview.people} note="Signed up" />
        <Stat label="New errors" value={overview.problems.unseen} note={overview.problems.unseen ? 'Open Errors to read them' : 'Nothing unseen'} />
      </div>
    </section>
    <section aria-label="Money" className="flex flex-col gap-3">
      <h2 className="m-0 text-sm font-medium text-muted-foreground">Money</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Soon label="Sales" />
        <Soon label="Refunds" />
        <Soon label="Tokens sold and used" />
      </div>
    </section>
  </div>;
}
