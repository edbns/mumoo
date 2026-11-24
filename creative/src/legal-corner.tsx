import { useEffect, useState } from 'react';
import {
  CookieConsent, CookieConsentAcceptAll, CookieConsentActions, CookieConsentCategories, CookieConsentCategory,
  CookieConsentDescription, CookieConsentLink, CookieConsentManage, CookieConsentRejectAll, CookieConsentSave, CookieConsentTitle,
} from '@/components/ui/cookie-consent';
import { CONSENT_KEY, COOKIE_SETTINGS_EVENT, openCookieSettings, readConsent } from './consent';
import { LEGAL_INDEX, LEGAL_PATHS, PRICING_PATH } from './site-paths';

export const LEGAL_LINKS = [
  { href: PRICING_PATH, label: 'Pricing' },
  { href: LEGAL_PATHS.terms, label: 'Terms' },
  { href: LEGAL_PATHS.privacy, label: 'Privacy' },
  { href: LEGAL_PATHS.cookies, label: 'Cookies' },
  { href: LEGAL_INDEX, label: 'Legal' },
];

// The status page (status.mumoo.app) says how mumoo is doing in one word; the dot and the word take its colour.
const STATUS_URL = import.meta.env.VITE_STATUS_URL ?? 'https://status.mumoo.app';
const STATUS_TONES = { up: 'text-primary', warning: 'text-chart-2', down: 'text-destructive' } as const;
const STATUS_EVERY_MS = 5 * 60_000;
type SiteStatus = { tone: keyof typeof STATUS_TONES; label: string };

/** Nothing until the status page answers, and nothing when it cannot (its checks have stopped, or it is unreachable). */
function StatusDot() {
  const [status, setStatus] = useState<SiteStatus | null>(null);
  useEffect(() => {
    let gone = false;
    const read = () => fetch(`${STATUS_URL}/api/summary`)
      .then(response => response.ok ? response.json() : null)
      .then((next: Partial<SiteStatus> | null) => {
        if (!gone) setStatus(next?.tone && next.tone in STATUS_TONES && next.label ? next as SiteStatus : null);
      })
      .catch(() => { if (!gone) setStatus(null); });
    read();
    const timer = setInterval(read, STATUS_EVERY_MS);
    return () => { gone = true; clearInterval(timer); };
  }, []);
  if (!status) return null;
  return <span role="status" className={`me-auto flex items-center gap-1.5 ${STATUS_TONES[status.tone]}`}>
    <span className="status-dot" data-live={status.tone === 'up' || undefined} aria-hidden />
    {status.label}
  </span>;
}

export function CookieBanner() {
  const [open, setOpen] = useState(() => readConsent() === null);
  const [prefs, setPrefs] = useState(() => readConsent() ?? undefined);
  useEffect(() => {
    const reopen = () => { setPrefs(readConsent() ?? undefined); setOpen(true); };
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
  }, []);
  return (
    <CookieConsent key={open ? 'open' : 'closed'} storageKey={CONSENT_KEY} open={open} onOpenChange={setOpen} defaultPreferences={prefs}>
      <div className="flex flex-col gap-1.5">
        <CookieConsentTitle>We use cookies</CookieConsentTitle>
        <CookieConsentDescription>
          Necessary cookies keep you signed in. Analytics help us see how people use mumoo (only if you say yes).{' '}
          <CookieConsentLink href={LEGAL_PATHS.cookies}>Cookie policy</CookieConsentLink>
        </CookieConsentDescription>
      </div>
      <CookieConsentCategories>
        <CookieConsentCategory id="necessary" name="Necessary" description="Sign-in, security, and remembering this choice." required />
        <CookieConsentCategory id="analytics" name="Analytics" description="Google Analytics: pages and features used (all counted together)." />
      </CookieConsentCategories>
      <CookieConsentActions>
        <CookieConsentAcceptAll />
        <CookieConsentRejectAll />
        <CookieConsentSave />
        <CookieConsentManage className="ms-auto" />
      </CookieConsentActions>
    </CookieConsent>
  );
}

/** How mumoo is doing at the bottom left of the layer, the small links at the bottom right (they scroll with it, clear of its
    rounded corner), and the cookie banner. */
export function LegalCorner() {
  return <>
    <nav aria-label="Legal" className="mt-auto flex items-center justify-end gap-3 px-8 pt-8 pb-5 text-[11px] text-muted-foreground/70">
      <StatusDot />
      {LEGAL_LINKS.map(link => <a key={link.href} href={link.href} className="hover:text-foreground">{link.label}</a>)}
      <button type="button" onClick={openCookieSettings} className="cursor-pointer rounded-none bg-transparent p-0 text-inherit hover:text-foreground">Cookie settings</button>
    </nav>
    <CookieBanner />
  </>;
}
