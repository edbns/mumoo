/** What the person can still make: their credits (one makes one video) and whether their free first video is still to come. */
export type Allowance = { credits: number; freeVideo: boolean };
/** A download wanted `need` videos and the person can make `have`. */
export type Shortfall = { need: number; have: number };

/** How many videos the person can start now. */
export const videosLeft = ({ credits, freeVideo }: Allowance) => credits + (freeVideo ? 1 : 0);

export const CREDITS_CHANGED = 'mumoo:credits-changed';
export const BUY_CREDITS = 'mumoo:buy-credits';
/** Tells the account corner the credits changed (a video started), so the menu shows the new amount. */
export const creditsChanged = () => window.dispatchEvent(new Event(CREDITS_CHANGED));
/** Opens Purchase Credits from anywhere, saying how many more videos the person wanted than they can make. */
export const askToBuyCredits = (shortfall: Shortfall) => window.dispatchEvent(new CustomEvent<Shortfall>(BUY_CREDITS, { detail: shortfall }));
