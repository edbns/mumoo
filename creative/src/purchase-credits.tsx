import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { PricingInteraction } from '@/components/ui/pricing-interaction';
import { CREDIT_PACKS, type CreditPack } from './credit-packs';
import { accountFetch } from './account';

/** How long the popup waits for Polar to tell our server about the payment before saying it is still on its way. */
const WAIT_MS = 60_000;
const POLL_MS = 2_000;

type Arrival = { status: 'pending' } | { status: 'paid'; videos: number; credits: number };

/** Sends the person to Polar's checkout for `pack`. Fails with the words to show. */
async function checkout(pack: CreditPack) {
  const response = await accountFetch('/api/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usd: pack.usd }),
  });
  const { url } = await response.json() as { url: string };
  location.assign(url);
}

/** After Polar's checkout: waits for the payment to reach our server, then says what it added. */
function Arrived({ checkoutId, onCredits }: { checkoutId: string; onCredits: (credits: number) => void }) {
  const [arrival, setArrival] = useState<Arrival | 'late' | null>(null);
  useEffect(() => {
    let stopped = false;
    const started = Date.now();
    const look = async () => {
      const result = await accountFetch(`/api/checkout?id=${encodeURIComponent(checkoutId)}`)
        .then(response => response.json() as Promise<Arrival>, () => null);
      if (stopped) return;
      if (result?.status === 'paid') { setArrival(result); onCredits(result.credits); return; }
      if (Date.now() - started > WAIT_MS) { setArrival('late'); return; }
      setTimeout(look, POLL_MS);
    };
    void look();
    return () => { stopped = true; };
  }, [checkoutId]);

  if (arrival && arrival !== 'late' && arrival.status === 'paid') return <div className="flex flex-col gap-2 text-center">
    <p className="m-0 text-xl font-semibold text-foreground">{arrival.videos.toLocaleString()} videos added</p>
    <p className="m-0 text-sm text-muted-foreground">You have {arrival.credits.toLocaleString()} {arrival.credits === 1 ? 'credit' : 'credits'}. Your invoice is in Invoices.</p>
  </div>;
  return <p role="status" className="m-0 text-center text-sm text-muted-foreground">
    {arrival === 'late'
      ? 'Your payment is still on its way to us. Your credits appear as soon as it arrives; if they do not within an hour, write to moo@mumoo.app.'
      : 'Payment received. Adding your credits…'}
  </p>;
}

/**
 * The popup for topping up credit. Choosing a pack opens Polar's checkout; Polar brings the person back with `checkoutId`, and
 * the popup then shows the credits arriving.
 */
export function PurchaseCredits({ open, onClose, initial, checkoutId, onCredits }: {
  open: boolean;
  onClose: () => void;
  /** The pack to choose at first, by its price in dollars (from the pricing page). */
  initial?: number;
  /** Set when Polar has just brought the person back from paying. */
  checkoutId?: string;
  onCredits: (credits: number) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const choose = (pack: CreditPack) => {
    setNote('');
    setBusy(true);
    checkout(pack).catch(cause => { setBusy(false); setNote((cause as Error).message); });
  };
  return <Modal open={open} onClose={() => { setNote(''); onClose(); }}
    title={checkoutId ? 'Thank you' : 'Purchase Credits'}
    description={checkoutId ? undefined : 'One credit makes one video.'}>
    <div className="flex flex-col gap-4">
      {checkoutId
        ? <Arrived checkoutId={checkoutId} onCredits={onCredits} />
        : <PricingInteraction key={initial} packs={CREDIT_PACKS} initial={initial} busy={busy} onChoose={choose} />}
      {note && <p role="alert" className="m-0 text-center text-sm text-destructive">{note}</p>}
      {!checkoutId && <>
        <p className="m-0 text-center text-sm text-muted-foreground">One-time purchase, no subscription. Credit never expires. Payment by Polar; tax is added where it applies.</p>
        <p className="m-0 text-center text-xs text-muted-foreground">Credits are non-refundable. See the <a href="/terms" className="underline underline-offset-4 hover:text-foreground">Terms</a> and <a href="/refunds" className="underline underline-offset-4 hover:text-foreground">Refund policy</a>.</p>
      </>}
    </div>
  </Modal>;
}
