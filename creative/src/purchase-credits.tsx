import { CheckIcon, ClockIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { PricingInteraction } from '@/components/ui/pricing-interaction';
import { CREDIT_PACKS, packFor, type CreditPack } from './credit-packs';
import { accountFetch } from './account';
import type { Shortfall } from './credit-events';
import { loadReferral } from './referral';

/** How long the popup waits for Polar to tell our server about the payment before saying it is still on its way. */
const WAIT_MS = 60_000;
const POLL_MS = 2_000;

type Arrival = { status: 'pending' } | { status: 'paid'; videos: number; bonus?: number; credits: number };

/** Sends the person to Polar's checkout for `pack`. Fails with the words to show. */
export async function checkout(pack: CreditPack) {
  const response = await accountFetch('/api/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usd: pack.usd }),
  });
  const { url } = await response.json() as { url: string };
  location.assign(url);
}

/** The card shown once Polar brings the person back: centred, with a mark, a heading and what happened. */
function Outcome({ mark, title, children, onClose }: { mark: ReactNode; title: string; children: ReactNode; onClose?: () => void }) {
  return <div className="flex flex-col items-center gap-4 rounded-[var(--radius-panel)] bg-muted px-8 pt-10 pb-8 text-center shadow-[0_28px_56px_-24px_#000]">
    <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">{mark}</span>
    <div className="flex flex-col gap-2">
      <p className="m-0 text-xl font-semibold text-foreground">{title}</p>
      <div className="m-0 text-sm text-balance text-muted-foreground">{children}</div>
    </div>
    {onClose && <Button className="mt-2 w-full" onClick={onClose}>Make a video</Button>}
  </div>;
}

/** After Polar's checkout: waits for the payment to reach our server, then says what it added. */
function Arrived({ checkoutId, onCredits, onClose }: { checkoutId: string; onCredits: (credits: number) => void; onClose: () => void }) {
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

  if (arrival && arrival !== 'late' && arrival.status === 'paid') return <Outcome mark={<CheckIcon className="size-6" />} title="Thank you" onClose={onClose}>
    <p className="m-0">{(arrival.videos + (arrival.bonus ?? 0)).toLocaleString()} videos are in your account{arrival.bonus ? `, ${arrival.bonus} of them from your friend’s invite` : ''}. You now have {arrival.credits.toLocaleString()} {arrival.credits === 1 ? 'credit' : 'credits'}.</p>
    <p className="m-0 mt-1">Receipt is on its way by email, invoice is in Invoices.</p>
  </Outcome>;
  if (arrival === 'late') return <Outcome mark={<ClockIcon className="size-6" />} title="Almost there" onClose={onClose}>
    Payment is still on its way. Credits show up as soon as it lands. If not within an hour, email moo@mumoo.app.
  </Outcome>;
  return <Outcome mark={<LoaderCircleIcon className="size-6 animate-spin" />} title="Payment received">
    <span role="status">Adding your credits…</span>
  </Outcome>;
}

/**
 * The popup for topping up credit. Choosing a pack opens Polar's checkout; Polar brings the person back with `checkoutId`, and
 * the popup then shows the credits arriving. With `autoBuy` (a pack chosen on the pricing page) the checkout opens straight away.
 */
export function PurchaseCredits({ open, onClose, initial, autoBuy = false, checkoutId, shortfall, onCredits }: {
  open: boolean;
  onClose: () => void;
  /** The pack to choose at first, by its price in dollars (from the pricing page). */
  initial?: number;
  /** Opens the checkout for `initial` at once. */
  autoBuy?: boolean;
  /** Set when Polar has just brought the person back from paying. */
  checkoutId?: string;
  /** Set when a download wanted more videos than the person can make. */
  shortfall?: Shortfall;
  onCredits: (credits: number) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  /** Videos a friend's invite adds to this person's first pack. */
  const [bonus, setBonus] = useState(0);
  useEffect(() => {
    if (open && !checkoutId) loadReferral(accountFetch).then(info => setBonus(info.firstPackBonus), () => setBonus(0));
  }, [open, checkoutId]);
  const choose = (pack: CreditPack) => {
    setNote('');
    setBusy(true);
    checkout(pack).catch(cause => { setBusy(false); setNote((cause as Error).message); });
  };
  const started = useRef(false);
  useEffect(() => {
    const pack = initial ? packFor(initial) : undefined;
    if (!open || !autoBuy || !pack || started.current) return;
    started.current = true;
    choose(pack);
  }, [open, autoBuy, initial]);
  const close = () => { setNote(''); onClose(); };

  if (checkoutId) return <Modal open={open} onClose={close} bare maxWidth={400} title="Your purchase">
    <Arrived checkoutId={checkoutId} onCredits={onCredits} onClose={close} />
  </Modal>;
  return <Modal open={open} onClose={close} title="Purchase Credits" description="One credit makes one video.">
    <div className="flex flex-col gap-4">
      {shortfall && <p role="status" className="m-0 rounded-[var(--radius-control)] bg-primary/10 px-4 py-3 text-sm text-foreground">
        {shortfall.have === 0
          ? `You’re out of credits. ${shortfall.need === 1 ? 'This video needs' : `These ${shortfall.need} videos need`} ${shortfall.need === 1 ? 'one' : shortfall.need}. Your chosen videos are kept.`
          : `${shortfall.need} videos need ${shortfall.need} credits and you have ${shortfall.have}. Buy a pack or pick fewer.`}
      </p>}
      {bonus > 0 && <p role="status" className="m-0 rounded-[var(--radius-control)] bg-primary/10 px-4 py-3 text-sm text-foreground">
        A friend invited you: your first pack comes with {bonus} extra videos free.
      </p>}
      <PricingInteraction key={initial} packs={CREDIT_PACKS} initial={initial} busy={busy} onChoose={choose} />
      {note && <p role="alert" className="m-0 text-center text-sm text-destructive">{note}</p>}
      <p className="m-0 text-center text-sm text-muted-foreground">One-time purchase, no subscription. Credits never expire. Payment by Polar; tax added where it applies.</p>
      <p className="m-0 text-center text-xs text-muted-foreground">Credits are non-refundable. See <a href="/terms" className="underline underline-offset-4 hover:text-foreground">Terms</a> and <a href="/refunds" className="underline underline-offset-4 hover:text-foreground">Refund policy</a>.</p>
    </div>
  </Modal>;
}
