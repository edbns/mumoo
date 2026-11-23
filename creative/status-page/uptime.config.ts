// mumoo's status page (UptimeFlare). Keep this repository private: the Telegram bot token below must not be public.
//
// The workers on Modal are never called from here. Each `/api/status?part=…` monitor is judged on the site from how the real
// requests of the last hour went (`creative/netlify/functions/status.mjs`), so checking costs no Modal time.
// Every check runs on UptimeFlare's one schedule, the `cron` in its `deploy.tf` ("* * * * *", every minute). Every minute these
// 8 checks cost about 300 Netlify credits a month; set it to "*/5 * * * *" (every 5 minutes) for about 60.

import { MaintenanceConfig, PageConfig, WorkerConfig } from './types/config'

// The site the status page watches. Switch to https://mumoo.app when the product moves there from staging.
const SITE = 'https://mumoo-staging.netlify.app'
// One published Smart Link, so the fan pages are checked the way fans open them.
const FAN_PAGE = `${SITE}/l/stefnaxyz-sem-vergonha`

const part = (id: string, name: string, tooltip: string) => ({
  id,
  name,
  method: 'GET',
  target: `${SITE}/api/status?part=${id}`,
  tooltip,
  expectedCodes: [200],
  timeout: 10000,
  headers: { 'User-Agent': 'UptimeFlare (mumoo status)' },
  hideLatencyChart: true,
})

const pageConfig: PageConfig = {
  title: 'mumoo Status',
  links: [
    { link: SITE, label: 'mumoo', highlight: true },
  ],
  logo: '/logo.png',
  favicon: '/favicon.png',
  // UptimeFlare's credit (Apache-2.0), kept small in place of its footer.
  customFooter: '<p style="text-align: center; font-size: 11px; color: #868e96; margin: 24px 0 16px;">Status page by <a href="https://github.com/lyc8503/UptimeFlare" target="_blank" rel="noopener" style="color: inherit;">UptimeFlare</a></p>',
  group: {
    'Video Creation': ['analysis', 'lyrics', 'renders'],
    'Accounts': ['website', 'accounts', 'storage', 'payments'],
    'Smart Links': ['fan-pages'],
  },
}

const workerConfig: WorkerConfig = {
  monitors: [
    {
      id: 'website',
      name: 'Website',
      method: 'GET',
      target: `${SITE}/`,
      tooltip: 'The mumoo site opens.',
      statusPageLink: SITE,
      expectedCodes: [200],
      hideLatencyChart: true,
      timeout: 10000,
      headers: { 'User-Agent': 'UptimeFlare (mumoo status)' },
    },
    part('accounts', 'Sign-in', 'Signing in and your account.'),
    part('storage', 'Uploads & downloads', 'Your uploads, your videos and their downloads.'),
    part('analysis', 'Song analysis', 'Reading the beat, the mood and the genre of your song.'),
    part('lyrics', 'Lyrics', 'Finding, timing and reading your lyrics.'),
    part('renders', 'Rendering', 'Making your HD videos. If this is red, your videos are waiting, not lost, and your credits are safe.'),
    part('payments', 'Payments', 'Buying video packs and adding their credits.'),
    {
      id: 'fan-pages',
      name: 'Fan pages',
      method: 'GET',
      target: FAN_PAGE,
      tooltip: 'The pages fans open from your Smart Links.',
      expectedCodes: [200],
      hideLatencyChart: true,
      timeout: 10000,
      headers: { 'User-Agent': 'UptimeFlare (mumoo status)' },
    },
  ],
  // Alerts to you on Telegram, off until the bot exists: fill in its token and your chat id, then uncomment.
  // notification: {
  //   // Alerts go to you only, never to users. Fill in your bot token (from @BotFather) and your own chat id.
  //   webhook: {
  //     url: 'https://api.telegram.org/botYOUR_BOT_TOKEN/sendMessage',
  //     payloadType: 'x-www-form-urlencoded',
  //     payload: { chat_id: 'YOUR_CHAT_ID', text: '$MSG' },
  //     timeout: 10000,
  //   },
  //   timeZone: 'Asia/Makassar',
  //   // Two failed checks in a row before an alert, so one slow moment does not wake you.
  //   gracePeriod: 2,
  // },
}

// A banner at the top of the page while something is being worked on. Example, left off:
// { title: 'Scheduled maintenance', body: 'Upgrading the render engine (about 15 minutes).', start: '2026-12-01T10:00:00+08:00', end: '2026-12-01T10:15:00+08:00', monitors: ['renders'], color: 'blue' }
const maintenances: MaintenanceConfig[] = []

export { maintenances, pageConfig, workerConfig }
