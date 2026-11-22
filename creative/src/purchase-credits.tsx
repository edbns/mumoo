import { CheckIcon, ClockIcon, LoaderCircleIcon } from '@/components/icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { PricingInteraction } from '@/components/ui/pricing-interaction';
import { CREDIT_PACKS, packFor, type CreditPack } from './credit-packs';
import { accountFetch } from './account';
import type { Shortfall } from './credit-events';
import { LEGAL_PATHS } from './site-paths';
import { loadReferral } from './referral';
import { friendlyError } from './friendly-error';

/** How long the popup waits for Polar to tell our server about the payment before saying it is still on its way. */
const WAIT_MS = 60_000;
const POLL_MS = 2_000;

type Arrival = { status: 'pending' } | { status: 'paid'; videos: number; bonus?: number; credits: number };

/** The window Polar's checkout opens in, and how long the person may take there. */
const WINDOW_FEATURES = 'width=520,height=780,popup=yes';
const CHECKOUT_MINUTES = 30;
/** What the page Polar brings the window back to says to the page that opened it. */
export const CHECKOUT_DONE = 'mumoo:checkout-done';

/**
 * Opens Polar's checkout for `pack` and answers the checkout's id once the person has paid, or null when they left without paying.
 * It opens in `popup` (opened straight from the click, or the browser blocks it), so the person's song, clip and chosen videos stay
 * on this page; a refresh would lose them. Without one (blocked) this tab goes to Polar instead. Fails with the words to show.
 */
export async function checkout(pack: CreditPack, popup: Window | null): Promise<string | null> {
  try {
    const response = await accountFetch('/api/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usd: pack.usd, window: Boolean(popup) }),
    });
    const { url, id } = await response.json() as { url: string; id?: string };
    if (!popup) {
      location.assign(url);
      return await new Promise<never>(() => undefined);
    }
    popup.location.href = url;
    const told = await new Promise<string | null | undefined>((resolve) => {
      const done = (answer: string | null | undefined) => { window.removeEventListener('message', onMessage); clearInterval(watch); clearTimeout(limit); resolve(answer); };
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== location.origin || event.source !== popup || event.data?.type !== CHECKOUT_DONE) return;
        done(typeof event.data.checkoutId === 'string' ? event.data.checkoutId : null);
      };
      // Closed without a word (by the person, or the browser cut the window off from this page): whether it was paid is asked below.
      const watch = setInterval(() => { if (popup.closed) done(undefined); }, 500);
      const limit = setTimeout(() => done(undefined), CHECKOUT_MINUTES * 60_000);
      window.addEventListener('message', onMessage);
    });
    popup.close();
    if (told !== undefined || !id) return told ?? null;
    const arrival = await accountFetch(`/api/checkout?id=${encodeURIComponent(id)}`).then(answer => answer.json() as Promise<Arrival>, () => null);
    return arrival?.status === 'paid' ? id : null;
  } catch (cause) {
    popup?.close();
    throw cause;
  }
}

/** On the page Polar brings the checkout window back to: tells the page that opened it how it went, and closes. False when it is not that window. */
export function handOverCheckout(): boolean {
  const params = new URLSearchParams(location.search);
  if (!window.opener || !params.has('checkout_window')) return false;
  try {
    (window.opener as Window).postMessage({ type: CHECKOUT_DONE, checkoutId: params.get('checkout_id') }, location.origin);
  } catch {
    return false;
  }
  window.close();
  return true;
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
function Arrived({ checkoutId, onCredits, onClose }: { checkoutId: string; onCredits: (credits: number, videos: number) => void; onClose: () => void }) {
  const [arrival, setArrival] = useState<Arrival | 'late' | null>(null);
  useEffect(() => {
    let stopped = false;
    const started = Date.now();
    const look = async () => {
      const result = await accountFetch(`/api/checkout?id=${encodeURIComponent(checkoutId)}`)
        .then(response => response.json() as Promise<Arrival>, () => null);
      if (stopped) return;
      if (result?.status === 'paid') { setArrival(result); onCredits(result.credits, result.videos + (result.bonus ?? 0)); return; }
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
export function PurchaseCredits({ open, onClose, initial, autoBuy = false, checkoutId, shortfall, onCredits, onBoughtForDownload }: {
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
  /** The credits a download asked for (`shortfall`) have arrived: the popup gives way to the videos starting. */
  onBoughtForDownload: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  /** Videos a friend's invite adds to this person's first pack. */
  const [bonus, setBonus] = useState(0);
  useEffect(() => {
    if (open && !checkoutId) loadReferral(accountFetch).then(info => setBonus(info.firstPackBonus), () => setBonus(0));
  }, [open, checkoutId]);
  /** The checkout paid in the window opened from here (Polar brings the tab itself back with `checkoutId`). */
  const [paid, setPaid] = useState<string>();
  useEffect(() => { if (!open) setPaid(undefined); }, [open]);
  const choose = (pack: CreditPack, fromClick = true) => {
    setNote('');
    setBusy(true);
    const popup = fromClick ? window.open('about:blank', 'mumoo-checkout', WINDOW_FEATURES) : null;
    checkout(pack, popup).then((id) => {
      setBusy(false);
      if (id) setPaid(id);
    }, (cause) => { setBusy(false); setNote(friendlyError(cause, 'Checkout didn’t open. Try again in a moment.')); });
  };
  const started = useRef(false);
  useEffect(() => {
    const pack = initial ? packFor(initial) : undefined;
    if (!open || !autoBuy || !pack || started.current) return;
    started.current = true;
    // Not from a click, so no window: this tab goes to Polar (from the pricing page, where there is no work to keep).
    choose(pack, false);
  }, [open, autoBuy, initial]);
  const close = () => { setNote(''); onClose(); };

  const arrivedId = checkoutId ?? paid;
  if (arrivedId) return <Modal open={open} onClose={close} bare maxWidth={400} title="Your purchase">
    <Arrived checkoutId={arrivedId} onClose={close} onCredits={(credits, videos) => {
      onCredits(credits);
      if (shortfall && videos > 0) onBoughtForDownload();
    }} />
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
      <PricingInteraction key={initial} packs={CREDIT_PACKS} initial={initial} busy={busy} busyLabel="Finish paying in the Polar window…" onChoose={pack => choose(pack)} />
      {note && <p role="alert" className="m-0 text-center text-sm text-destructive">{note}</p>}
      <p className="m-0 text-center text-sm text-muted-foreground">One-time purchase, no subscription. Credits never expire. Payment by Polar; tax added where it applies.</p>
      <p className="m-0 text-center text-xs text-muted-foreground">Credits are non-refundable. See <a href={LEGAL_PATHS.terms} className="underline underline-offset-4 hover:text-foreground">Terms</a> and <a href={LEGAL_PATHS.refunds} className="underline underline-offset-4 hover:text-foreground">Refund policy</a>.</p>
    </div>
  </Modal>;
}
