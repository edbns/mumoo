import type { Overview } from './api';

/** With `href`, the number opens the list behind it. */
function Stat({ label, value, note, href }: { label: string; value: string | number; note?: string; href?: string }) {
  const look = 'flex flex-col gap-1 rounded-[var(--radius-panel)] bg-card p-5 text-foreground no-underline shadow-sm';
  const body = <>
    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-3xl font-semibold tabular-nums">{value}</span>
    {note && <span className="text-xs text-muted-foreground">{note}</span>}
  </>;
  return href
    ? <a href={href} className={`${look} outline-ring transition-shadow hover:shadow-md focus-visible:outline-2`}>{body}</a>
    : <div className={look}>{body}</div>;
}

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** The first page: the library waiting for a decision, people and errors, and the money. */
export function OverviewView({ overview }: { overview: Overview }) {
  const { sales, credits, recent } = overview.money;
  const currencies = [...new Set(sales.map(line => line.currency))];
  const line = (currency: string, status: 'paid' | 'refunded') => sales.find(entry => entry.currency === currency && entry.status === status);
  const sum = (status: 'paid' | 'refunded', key: 'amount' | 'last30' | 'orders') =>
    currencies.length ? currencies.map(currency => key === 'orders' ? String(line(currency, status)?.orders ?? 0) : money(line(currency, status)?.[key] ?? 0, currency)).join(' + ')
      : key === 'orders' ? '0' : money(0, 'USD');
  const left = credits.sold + credits.bonus - credits.used;

  return <div className="flex flex-col gap-8">
    <header><h2 className="m-0 text-lg font-semibold">Library, money and errors</h2></header>
    <section aria-label="Library" className="flex flex-col gap-3">
      <h2 className="m-0 text-sm font-medium text-muted-foreground">Library</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Waiting" value={overview.library.pending} note="Not approved yet. Open to check them" href="#library/pending" />
        <Stat label="Hidden" value={overview.library.hidden} note="Never used. Open to see them" href="#library/hidden" />
        <Stat label="Approved" value={overview.library.approved} note="Used by the templates" href="#library/approved" />
      </div>
    </section>
    <section aria-label="Money" className="flex flex-col gap-3">
      <h2 className="m-0 text-sm font-medium text-muted-foreground">Money</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Sales" value={sum('paid', 'amount')} note={`${sum('paid', 'orders')} orders from ${credits.buyers} ${credits.buyers === 1 ? 'person' : 'people'} · ${sum('paid', 'last30')} in the last 30 days`} />
        <Stat label="Refunds" value={sum('refunded', 'amount')} note={`${sum('refunded', 'orders')} orders refunded in full`} />
        <Stat label="Credits" value={`${credits.used} of ${credits.sold + credits.bonus}`} note={`Used of sold (${credits.sold}) and given (${credits.bonus}) · ${left} left · ${credits.free} free videos made`} />
      </div>
      <div className="overflow-hidden rounded-[var(--radius-panel)] bg-card shadow-sm">
        <h3 className="m-0 px-5 pt-4 text-sm font-medium">Latest orders</h3>
        {recent.length === 0 ? <p className="m-0 px-5 py-4 text-sm text-muted-foreground">No orders yet.</p>
          : <table className="w-full border-collapse text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2 font-medium">When</th><th className="px-5 py-2 font-medium">Pack</th>
              <th className="px-5 py-2 text-right font-medium">Paid</th><th className="px-5 py-2 font-medium">Status</th>
            </tr></thead>
            <tbody>{recent.map((order, at) => <tr key={at} className="border-t border-border">
              <td className="px-5 py-2">{when(order.at)}</td>
              <td className="px-5 py-2">{order.videos} videos</td>
              <td className="px-5 py-2 text-right tabular-nums">{money(order.amount, order.currency)}</td>
              <td className="px-5 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${order.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>
                {order.status === 'paid' ? 'Paid' : 'Refunded'}</span></td>
            </tr>)}</tbody>
          </table>}
      </div>
    </section>
    <section aria-label="Health" className="flex flex-col gap-3">
      <h2 className="m-0 text-sm font-medium text-muted-foreground">People and errors</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="People" value={overview.people} note="Signed up" />
        <Stat label="New errors" value={overview.problems.unseen} note={overview.problems.unseen ? 'Open to read them' : 'Nothing unseen'} href={overview.problems.unseen ? '#errors' : undefined} />
      </div>
    </section>
  </div>;
}
