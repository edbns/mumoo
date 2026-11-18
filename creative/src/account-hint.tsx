import { Button } from '@/components/ui/button';
import { PROFILE_CORNER, ProfileDot } from '@/components/ui/profile-dot';

/**
 * Whether someone was signed in here last time. Only a hint for the first paint: the corner is drawn at once, with the rest of the
 * page, instead of after the sign-in code has loaded and the session has been checked. Holds no name, email or token.
 */
const HINT_KEY = 'mumoo-signed-in';

export const wasSignedIn = () => {
  try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; }
};

export const rememberSignedIn = (signedIn: boolean) => {
  try {
    if (signedIn) localStorage.setItem(HINT_KEY, '1'); else localStorage.removeItem(HINT_KEY);
  } catch { /* storage unavailable: the corner just guesses signed out */ }
};

/** The corner as it was last time, until the real one is ready: the profile disc, or the Sign in button. */
export function AccountPlaceholder({ onSignIn }: { onSignIn?: () => void }) {
  return wasSignedIn()
    ? <div className={PROFILE_CORNER}><ProfileDot /></div>
    : <Button variant="secondary" onClick={onSignIn}>Sign in</Button>;
}
