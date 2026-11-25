import { DownloadIcon } from '@/components/icons';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { accountFetch, authClient } from './account';
import { keep, recall } from './page-memory';
import { AccountColumn, AccountSection, EmptyState } from './account-section';
import { money } from './money';
import { friendlyError } from './friendly-error';

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
};

/** Opens the invoice file Polar keeps for the payment. The tab is opened at once, as a browser blocks one opened after a wait. */
async function openInvoice(id: string) {
  const tab = window.open('about:blank', '_blank');
  try {
    const result = await (await accountFetch(`/api/invoices?id=${encodeURIComponent(id)}`)).json() as { url?: string; error?: string };
    if (!result.url) throw new Error(result.error || 'Invoice is unavailable right now. Try again in a moment.');
    if (tab) tab.location.href = result.url;
    else location.assign(result.url);
  } catch (cause) {
    tab?.close();
    throw cause;
  }
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** What the person paid for and how much, newest first, each with its invoice to download. */
export default function InvoicesPage() {
  const owner = authClient.useSession().data?.user.id;
  const [invoices, setInvoices] = useState<Invoice[] | null>(() => recall<Invoice[]>('invoices', owner));
  const [error, setError] = useState('');

  useEffect(() => {
    accountFetch('/api/invoices')
      .then(response => response.json() as Promise<{ invoices: Invoice[] }>)
      .then(result => { keep('invoices', owner, result.invoices); setInvoices(result.invoices); })
      .catch(cause => setError(friendlyError(cause, 'Your invoices are unavailable right now. Try again soon.')));
  }, []);

  return <AccountColumn>
    <AccountSection label="Invoices">
      {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
      {invoices === null && !error && <div aria-hidden="true" className="flex flex-col gap-3">
        {[0, 1, 2].map(row => <div key={row} className="h-14 animate-pulse rounded-[var(--radius-control)] bg-muted" />)}
      </div>}
      {invoices?.length === 0 && <EmptyState className="py-12">
        No payments yet. When you pay, each invoice shows up here with what it was for and the amount.
      </EmptyState>}
      {invoices && invoices.length > 0 && <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {invoices.map(invoice => <li key={invoice.id} className="flex items-center gap-4 rounded-[var(--radius-control)] bg-muted px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{invoice.description}</span>
            <span className="text-xs text-muted-foreground">{day(invoice.createdAt)} · {invoice.number}</span>
          </div>
          <span className={cn('rounded-full px-2 py-0.5 text-xs', invoice.status === 'paid' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')}>
            {invoice.status === 'paid' ? 'Paid' : 'Refunded'}
          </span>
          <span className="w-20 text-right text-sm font-medium tabular-nums">{money(invoice.amount, invoice.currency)}</span>
          <button type="button" onClick={() => openInvoice(invoice.id).catch(cause => setError(friendlyError(cause, 'That invoice couldn’t open. Try again.')))}
            aria-label={`Download invoice ${invoice.number}`}
            className="flex size-8 shrink-0 cursor-pointer items-center p-0 justify-center rounded-full bg-secondary text-secondary-foreground outline-ring transition-colors hover:bg-secondary/70 focus-visible:outline-2">
            <DownloadIcon aria-hidden="true" className="size-4" />
          </button>
        </li>)}
      </ul>}
    </AccountSection>
  </AccountColumn>;
}
