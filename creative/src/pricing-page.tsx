import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { accountFetch, checkSignInCode, sendSignInCode, sessionToken, signInWithGoogle } from './account';
import { CREDIT_PACKS, perVideo, type CreditPack } from './credit-packs';
import { LegalCorner } from './legal-corner';
import { checkout } from './purchase-credits';
import { claimPendingReferral, keepReferral, pendingReferral } from './referral';
import { SignInDialog } from './sign-in-dialog';
import { useFreeVideo } from './use-free-video';
import '@fontsource-variable/inter';
import './styles/index.css';

const INCLUDED = [
  'Every template and look on the shelf',
  'Your lyrics, read and timed to the song',
  'Cut to the beat of your music',
  'Vertical 1080×1920 video, ready for Reels, TikTok and Shorts',
  'No watermark',
  'Kept in your Media, with 5 GB of room',
];

const QUESTIONS = [
  { q: 'What is a credit?', a: 'One credit makes one video. That’s it.' },
  { q: 'Is it a subscription?', a: 'Nope. Pay once, credits stay until you use them. They never expire.' },
  { q: 'What does the first video cost?', a: 'Nothing. Every new account gets its first video free, no watermark.' },
  { q: 'Can I get free videos?', a: 'Yeah. Invite friends from your account menu: they get 10 extra on their first pack, you get 10 free once they pay (up to 20 friends a month).' },
  { q: 'Who takes the payment?', a: 'Polar (polar.sh), our payment partner, takes the payment and adds tax where it applies. We never see your card. Each invoice is in Invoices in your account.' },
  { q: 'Can I get a refund?', a: 'Credits are non-refundable except where the law says so (like a render that fails and we can’t fix).' },
];

const BUY_SIGN_IN = { title: 'Sign in to buy credits', lead: 'Your credits stay in your account.' };

/**
 * /pricing: what MUMOO costs, for anyone, before they sign in. Buy opens Polar's checkout straight away; signed out, the sign-in
 * popup opens here first and the checkout follows as soon as they are in.
 */
function PricingPage() {
  const [opening, setOpening] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [invited] = useState(() => pendingReferral() !== null);
  const [signingIn, setSigningIn] = useState(false);
  /** The pack chosen before signing in, bought once they are in. */
  const wanted = useRef<CreditPack | null>(null);
  const signedIn = useRef(false);
  const address = useRef('');
  const freeLeft = useFreeVideo();

  const open = async (pack: CreditPack) => {
    setNote('');
    setOpening(pack.usd);
    try {
      // A friend's invite is claimed before paying, so this first pack gets its extra videos.
      await claimPendingReferral(accountFetch);
      await checkout(pack);
    } catch (cause) {
      setOpening(null);
      setNote((cause as Error).message);
    }
  };
  const buy = async (pack: CreditPack) => {
    if (await sessionToken().catch(() => null)) { await open(pack); return; }
    wanted.current = pack;
    signedIn.current = false;
    setSigningIn(true);
  };
  const closeSignIn = useCallback(() => {
    setSigningIn(false);
    const pack = wanted.current;
    wanted.current = null;
    if (pack && signedIn.current) void open(pack);
  }, []);
  return <div className="flex flex-1 flex-col text-foreground">
    <header className="flex items-center justify-between px-6 pt-6 pb-4">
      <a href="/" aria-label="MUMOO"><img src="/brand/mumoo-logo.png" alt="MUMOO" className="h-5" /></a>
      <a href="/" className="text-sm text-muted-foreground hover:text-foreground">Open MUMOO</a>
    </header>
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-6 pt-10 pb-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="m-0 text-4xl font-semibold tracking-tight text-balance md:text-5xl">One credit. One video.</h1>
        <p className="m-0 max-w-xl text-base text-balance text-muted-foreground">
          Pay once, no subscription, credits never expire. First video free, no watermark.
        </p>
        {invited && <p role="status" className="m-0 rounded-[var(--radius)] bg-primary/10 px-4 py-2 text-sm text-foreground">A friend invited you: your first pack comes with 10 extra videos free.</p>}
        {freeLeft && <Button className="mt-2" onClick={() => location.assign('/')}>Make my first video free</Button>}
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
        <p className="m-0 text-center text-xs text-muted-foreground">Prices in US dollars. Tax added at checkout where it applies.</p>
      </div>

      <div className="flex flex-col items-center gap-4 text-center">
        <h2 className="m-0 text-lg font-semibold">Every video comes with</h2>
        <ul className="m-0 flex list-none flex-col items-center gap-3 p-0">
          {INCLUDED.map(line => <li key={line} className="flex items-start gap-3 text-sm text-muted-foreground">
            <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{line}
          </li>)}
        </ul>
        <p className="m-0 text-sm text-muted-foreground">Smart links for your songs are free, no credits needed.</p>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <h2 className="m-0 text-center text-lg font-semibold text-balance">Everything you need to know about making a video with MUMOO</h2>
        <div className="flex flex-col divide-y divide-border border-y border-border">
          {QUESTIONS.map(({ q, a }) => <details key={q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <p className="m-0 pb-4 text-sm text-muted-foreground">{a}</p>
          </details>)}
        </div>
      </div>
    </main>
    <LegalCorner />
    <SignInDialog open={signingIn} onClose={closeSignIn} reason={BUY_SIGN_IN}
      onSendCode={async email => { await sendSignInCode(email); address.current = email; }}
      onCheckCode={async code => { await checkSignInCode(address.current, code); signedIn.current = true; return true; }}
      onGoogle={async () => { await signInWithGoogle(); signedIn.current = true; }} />
  </div>;
}

keepReferral();
createRoot(document.getElementById('root')!).render(<PricingPage />);
