import { CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { sessionToken } from './account';
import { CREDIT_PACKS, perVideo, type CreditPack } from './credit-packs';
import { LegalCorner } from './legal-corner';
import { checkout } from './purchase-credits';
import { keepReferral, pendingReferral } from './referral';
import '@fontsource-variable/inter';
import './styles/index.css';

const INCLUDED = [
  'Every template and look on the shelf',
  'Your lyrics, read and timed to the song',
  'Cut to the beat of your music',
  'A vertical 1080×1920 video, ready for Reels, TikTok and Shorts',
  'No watermark',
  'Kept in your Media, with 5 GB of room',
];

const QUESTIONS = [
  { q: 'What is a credit?', a: 'One credit makes one video. There are no other units to work out.' },
  { q: 'Is it a subscription?', a: 'No. You pay once for a pack, and the credits stay in your account until you use them. They never expire.' },
  { q: 'What does the first video cost?', a: 'Nothing. Every new account makes its first video free, with no watermark, so you can see what you get before you pay.' },
  { q: 'Can I get free videos?', a: 'Yes. Invite friends from your account menu: a friend who signs up with your link gets 10 extra videos on their first pack, and you get 10 free videos once they have paid (for up to 20 friends a month).' },
  { q: 'Who takes the payment?', a: 'Polar (polar.sh), our payment partner, takes the payment and adds tax where it applies. We never see your card. Each invoice is in Invoices in your account.' },
  { q: 'Can I get a refund?', a: 'Credits are non-refundable, except where the law requires it, for example a render that fails and that we cannot fix.' },
];

/**
 * /pricing: what MUMOO costs, for anyone, before they sign in. Signed in, Buy opens Polar's checkout straight away; signed out it
 * goes to the app, which asks them to sign in and then opens the checkout.
 */
function PricingPage() {
  const [opening, setOpening] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [invited] = useState(() => pendingReferral() !== null);
  const buy = async (pack: CreditPack) => {
    setNote('');
    setOpening(pack.usd);
    try {
      if (!await sessionToken().catch(() => null)) { location.assign(`/?buy=${pack.usd}`); return; }
      await checkout(pack);
    } catch (cause) {
      setOpening(null);
      setNote((cause as Error).message);
    }
  };
  return <div className="flex flex-1 flex-col text-foreground">
    <header className="flex items-center justify-between px-6 pt-6 pb-4">
      <a href="/" aria-label="MUMOO"><img src="/brand/mumoo-logo.png" alt="MUMOO" className="h-5" /></a>
      <a href="/" className="text-sm text-muted-foreground hover:text-foreground">Open MUMOO</a>
    </header>
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-6 pt-10 pb-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="m-0 text-4xl font-semibold tracking-tight text-balance md:text-5xl">One credit. One video.</h1>
        <p className="m-0 max-w-xl text-base text-balance text-muted-foreground">
          Pay once, no subscription, and your credits never expire. Your first video is free, with no watermark.
        </p>
        {invited && <p role="status" className="m-0 rounded-[var(--radius)] bg-primary/10 px-4 py-2 text-sm text-foreground">A friend invited you: your first pack comes with 10 extra videos, free.</p>}
        <Button className="mt-2" onClick={() => location.assign('/')}>Make my first video free</Button>
      </div>

      <div role="group" aria-label="Credit packs" className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-3">
        {CREDIT_PACKS.map(pack => <div key={pack.usd}
          className={cn('relative flex flex-col gap-6 rounded-3xl bg-muted p-6', pack.popular && 'outline-[3px] outline-primary')}>
          {pack.popular && <span className="absolute top-6 right-6 rounded-lg bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">Popular</span>}
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">{pack.videos.toLocaleString()} videos</span>
            <span className="text-4xl font-semibold tracking-tight tabular-nums">${pack.usd}</span>
            <span className="text-sm text-muted-foreground">{perVideo(pack)} a video</span>
          </div>
          <Button variant={pack.popular ? 'default' : 'secondary'} className="mt-auto w-full rounded-full"
            disabled={opening !== null} aria-busy={opening === pack.usd} onClick={() => void buy(pack)}>
            {opening === pack.usd ? 'Opening checkout…' : `Buy ${pack.videos.toLocaleString()} videos`}
          </Button>
        </div>)}
        </div>
        {note && <p role="alert" className="m-0 text-center text-sm text-destructive">{note}</p>}
        <p className="m-0 text-center text-xs text-muted-foreground">Prices in US dollars. Tax is added at checkout where it applies.</p>
      </div>

      <div className="grid gap-10 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <h2 className="m-0 text-lg font-semibold">Every video comes with</h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {INCLUDED.map(line => <li key={line} className="flex items-start gap-3 text-sm text-muted-foreground">
              <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{line}
            </li>)}
          </ul>
          <p className="m-0 text-sm text-muted-foreground">Smart links for your songs are free, and need no credits.</p>
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="m-0 text-lg font-semibold">Questions</h2>
          <dl className="m-0 flex flex-col divide-y divide-border border-y border-border">
            {QUESTIONS.map(({ q, a }) => <div key={q} className="flex flex-col gap-1 py-4">
              <dt className="text-sm font-medium text-foreground">{q}</dt>
              <dd className="m-0 text-sm text-muted-foreground">{a}</dd>
            </div>)}
          </dl>
          <p className="m-0 text-xs text-muted-foreground">
            See the <a href="/terms" className="underline underline-offset-4 hover:text-foreground">Terms</a> and the <a href="/refunds" className="underline underline-offset-4 hover:text-foreground">Refund policy</a>. Anything else: <a href="mailto:moo@mumoo.app" className="underline underline-offset-4 hover:text-foreground">moo@mumoo.app</a>.
          </p>
        </div>
      </div>
    </main>
    <LegalCorner />
  </div>;
}

keepReferral();
createRoot(document.getElementById('root')!).render(<PricingPage />);
