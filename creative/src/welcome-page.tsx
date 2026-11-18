import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { FlipDiskMatrix } from '@/components/ui/flip-disk-matrix';
import { accountFetch, sessionToken } from './account';
import { CookieBanner } from './legal-corner';
import '@fontsource-variable/inter';
import './styles/index.css';

/** Member numbers are shown with at least four digits: 0001, 0042, 12345. */
const padded = (n: number) => String(n).padStart(4, '0');
/** The board counts up to the number in this many flips, so it is seen arriving. */
const STEPS = 9;
const STEP_MS = 140;

type Known = { mine: boolean; number: number };

/** Whose number: the signed-in person's own member number, else the newest one (how many artists have joined). */
async function lookUp(): Promise<Known> {
  if (await sessionToken().catch(() => null)) {
    const account = await (await accountFetch('/api/account')).json() as { memberNo?: number | null };
    if (account.memberNo) return { mine: true, number: account.memberNo };
  }
  const { latest } = await (await fetch('/api/members')).json() as { latest: number };
  return { mine: false, number: latest };
}

/** /welcome: a flip-disc board showing the person's member number, counting up from 0000 as it arrives. */
function WelcomePage() {
  const [known, setKnown] = useState<Known | null>(null);
  const [shown, setShown] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => { lookUp().then(setKnown, () => setFailed(true)); }, []);

  useEffect(() => {
    if (!known) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(known.number); return; }
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      // Eased: quick at first, settling on the number.
      setShown(Math.round(known.number * (1 - (1 - step / STEPS) ** 3)));
      if (step >= STEPS) clearInterval(timer);
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [known]);

  const digits = padded(shown);
  return <div className="flex flex-1 flex-col text-foreground">
    <header className="flex items-center justify-between px-6 pt-6 pb-4">
      <a href="/" aria-label="MUMOO"><img src="/brand/mumoo-logo.png" alt="MUMOO" className="h-5" /></a>
    </header>
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 pb-16 text-center">
      <p className="m-0 text-xs font-medium uppercase tracking-[0.35em] text-muted-foreground">{known?.mine === false ? 'Artists on mumoo' : 'Welcome to mumoo'}</p>
      <FlipDiskMatrix text={known ? digits : ''} cols={Math.max(31, digits.length * 6 + 5)}
        label={known ? (known.mine ? `You are artist number ${known.number}` : `${known.number} artists have joined`) : 'Loading'} />
      <div className="flex min-h-24 flex-col items-center gap-4 transition-opacity duration-500" style={{ opacity: known || failed ? 1 : 0 }}>
        {failed
          ? <p className="m-0 text-sm text-muted-foreground">Your number is unavailable right now. Try again in a moment.</p>
          : known?.mine
            ? <p className="m-0 text-lg">You are artist <span className="font-semibold text-primary">no. {padded(known.number)}</span>. Your song, its visuals and its lyrics start here.</p>
            : <p className="m-0 text-lg">{known ? `${known.number.toLocaleString('en')} ${known.number === 1 ? 'artist has' : 'artists have'} joined so far.` : ''} Sign in to get your number.</p>}
        <Button onClick={() => location.assign('/')}>{known?.mine ? 'Start creating' : 'Get your number'}</Button>
      </div>
    </main>
    <CookieBanner />
  </div>;
}

createRoot(document.getElementById('root')!).render(<WelcomePage />);
