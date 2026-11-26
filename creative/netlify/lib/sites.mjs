/**
 * The two sites this code runs on, each with its own Modal environment: staging keeps working for testing after launch. Any other
 * site or address (a deploy preview, a branch deploy, netlify.app of the live site) gets none of the cloud features.
 */
export const SITES = [
  { name: 'staging', id: '097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5', origin: 'https://mumoo-staging.netlify.app', modal: 'mumoo-staging' },
  { name: 'live', id: '130ebb77-011f-44f0-90ae-4566510d1b38', origin: 'https://mumoo.app', modal: 'mumoo-production' },
];

/** The site this code is deployed on, or null. */
export const thisSite = () => SITES.find(site => site.id === process.env.SITE_ID) ?? null;

/** The site that `request` was sent to, when it is one of ours at its own address. */
export function siteOf(request) {
  const site = thisSite();
  return site && new URL(request.url).origin === site.origin ? site : null;
}

/** A Modal web endpoint ("mumoo-lyrics-v2-staging-submit") in this site's Modal environment (staging's when none). */
export const modal = (endpoint) => `https://edbns-${thisSite()?.modal ?? 'mumoo-staging'}--${endpoint}.us-east.modal.run`;
