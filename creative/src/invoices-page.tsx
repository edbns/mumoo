import { DownloadIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { accountFetch } from './account';
import { AccountColumn, AccountSection } from './account-section';
import { money } from './money';

type Invoice = {
  id: string;
  /** The number printed on the invoice. */
  number: string;
  createdAt: string;
  /** What was paid for, in words the person knows. */
  description: string;
  /** In the smallest unit of the currency (cents). */
  amount: number;
  currency: string;
  status: 'paid' | 'refunded';
  /** The invoice as a file. */
  url: string;
};

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** What the person paid for and how much, newest first, each with its invoice to download. */
export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    accountFetch('/api/invoices')
      .then(response => response.json() as Promise<{ invoices: Invoice[] }>)
      .then(result => setInvoices(result.invoices))
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Your invoices are unavailable right now.'));
  }, []);

  return <AccountColumn>
    <AccountSection label="Invoices">
      {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
      {invoices === null && !error && <div aria-hidden="true" className="flex flex-col gap-3">
        {[0, 1, 2].map(row => <div key={row} className="h-14 animate-pulse rounded-[var(--radius)] bg-muted" />)}
      </div>}
      {invoices?.length === 0 && <p className="m-0 text-sm text-muted-foreground">
        No payments yet. When you pay, each invoice appears here with what it was for and how much.
      </p>}
      {invoices && invoices.length > 0 && <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {invoices.map(invoice => <li key={invoice.id} className="flex items-center gap-4 rounded-[var(--radius)] bg-muted px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{invoice.description}</span>
            <span className="text-xs text-muted-foreground">{day(invoice.createdAt)} · {invoice.number}</span>
          </div>
          <span className={cn('rounded-full px-2 py-0.5 text-xs', invoice.status === 'paid' ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground')}>
            {invoice.status === 'paid' ? 'Paid' : 'Refunded'}
          </span>
          <span className="w-20 text-right text-sm font-medium tabular-nums">{money(invoice.amount, invoice.currency)}</span>
          <a href={invoice.url} download="" aria-label={`Download invoice ${invoice.number}`}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground outline-ring transition-colors hover:bg-secondary/70 focus-visible:outline-2">
            <DownloadIcon aria-hidden="true" className="size-4" />
          </a>
        </li>)}
      </ul>}
    </AccountSection>
  </AccountColumn>;
}
