// Not prefixed `mumoo-`: signing out clears those keys, and a cookie choice belongs to the browser, not the account.
export const CONSENT_KEY = 'cookie-consent';
export const COOKIE_SETTINGS_EVENT = 'mumoo:cookie-settings';

export type CookiePreferences = Record<string, boolean>;

export function readConsent(): CookiePreferences | null {
  try {
    const saved = localStorage.getItem(CONSENT_KEY);
    const parsed: unknown = saved ? JSON.parse(saved) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as CookiePreferences : null;
  } catch {
    return null;
  }
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT));
}
