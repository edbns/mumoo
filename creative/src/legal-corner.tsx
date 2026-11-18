import { useEffect, useState } from 'react';
import {
  CookieConsent, CookieConsentAcceptAll, CookieConsentActions, CookieConsentCategories, CookieConsentCategory,
  CookieConsentDescription, CookieConsentLink, CookieConsentManage, CookieConsentRejectAll, CookieConsentSave, CookieConsentTitle,
} from '@/components/ui/cookie-consent';
import { CONSENT_KEY, COOKIE_SETTINGS_EVENT, openCookieSettings, readConsent } from './consent';

export const LEGAL_LINKS = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/legal', label: 'Legal' },
];

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
          Necessary cookies keep you signed in. With your permission we&rsquo;d also use analytics to see how MUMOO is used.{' '}
          <CookieConsentLink href="/cookies">Cookie policy</CookieConsentLink>
        </CookieConsentDescription>
      </div>
      <CookieConsentCategories>
        <CookieConsentCategory id="necessary" name="Necessary" description="Sign-in, security, and remembering this choice." required />
        <CookieConsentCategory id="analytics" name="Analytics" description="Google Analytics: pages visited and features used, counted together." />
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

/** The small links at the bottom right of every page of the app, and the cookie banner above them. */
export function LegalCorner() {
  return <>
    <nav aria-label="Legal" className="fixed bottom-3 right-4 z-[4] flex items-center gap-3 text-[11px] text-muted-foreground/70">
      {LEGAL_LINKS.map(link => <a key={link.href} href={link.href} className="hover:text-foreground">{link.label}</a>)}
      <button type="button" onClick={openCookieSettings} className="cursor-pointer rounded-none bg-transparent p-0 text-inherit hover:text-foreground">Cookie settings</button>
    </nav>
    <CookieBanner />
  </>;
}
