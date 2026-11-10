/**
 * Every visit starts clean: nothing of the person's work (song, genre, clip, lyrics) is kept between visits, so a refresh,
 * by mistake or not, starts over. Only the cart is kept. This removes what an earlier version of the app left behind in this browser.
 */
const LEFTOVER_KEY = 'mumoo-session';

export function forgetSession(): void {
  try { localStorage.removeItem(LEFTOVER_KEY); } catch { /* storage unavailable: nothing to forget */ }
  try { indexedDB.deleteDatabase('mumoo'); } catch { /* same */ }
}
