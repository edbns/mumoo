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

/** More videos were chosen than the person can make, and they can make some (`free`: the only one is their free first video). */
export type TooMany = Shortfall & { free: boolean };
export const TOO_MANY_CHOSEN = 'mumoo:too-many-chosen';
/** Asks whether to buy credits or make only the videos they can, instead of going straight to Purchase Credits. */
export const askToChooseFewer = (tooMany: TooMany) => window.dispatchEvent(new CustomEvent<TooMany>(TOO_MANY_CHOSEN, { detail: tooMany }));
