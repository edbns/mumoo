# Privacy Policy

**Last updated:** 26 November 2026  
**Privacy contact / privacy officer:** moo@mumoo.app

This Privacy Policy explains how mumoo (“we”, “us”) collects, uses, and shares personal data when you use the mumoo web application and Smart Link pages.

mumoo is operated by an individual.

## 1. Who this covers
- **Creators** (account holders): artists, bands, labels, and other users who create audiovisual content or Smart Links.
- **Fans**: people who visit public Smart Link pages. Fans do not have accounts.

Minimum age is 16.

## 2. Data we collect from creators
- **Account data:** email address; name and profile picture if you sign in with Google; sign-in session data; join date and last-visit date. Sign-in is by one-time email code or Google (no passwords stored by us).
- **Song data:** the browser reads title, artist, and cover art locally. Cover art is reduced to colour numbers in the browser and the image is never uploaded. Only a 15-second clip is sent to our servers for analysis (beat, mood, genre) and lyric transcription/interpretation. The clip itself is not stored separately, but it is contained inside the finished Creatives you keep.
- **Uploads:** photos, videos, and GIFs you upload (up to 10 GB and 500 pictures per account). A background cut-out of the person is made automatically for certain templates. These files are private and never shown to other users.
- **Creatives:** finished videos kept in your history.
- **Smart Links (free service):** song details, cover art, and destination links you provide, together with visit and click statistics. Basic Smart Links do not require a video-credit purchase. Optional Meta Pixel / Conversions API or TikTok Pixel / Events API credentials are stored encrypted if connected.
- **Usage signals:** plays, selections, downloads, and watch time, recorded as codes. Used only to train mumoo’s own recommendations (never a generative model).
- **Error reports:** when a render, download, or sign-in fails. These may include your email.
- **Payments:** handled entirely by Polar (Merchant of Record). We never see card details.
- **IP addresses:** seen by the hosting provider for delivery, security, and rate limiting, but not stored in our database.

## 3. Data we collect from fans on Smart Link pages
- Visit or click time, country (derived from IP address — the IP itself is not stored by us), browser, device, operating system, referrer, campaign tags, and ad click IDs (fbclid, ttclid, gclid).
- No cookies and no tracking scripts are used on fan pages.
- **If the creator has connected an ad account:** each visit and click is forwarded server-side to Meta or TikTok. This includes the fan’s IP address, browser details, and ad click ID. For this processing the creator is the controller and mumoo is the processor (see the short Data Processing Agreement).

## 4. How we use the data
- To provide the Service (accounts, audiovisual creation and delivery, free Smart Links, and visit/click statistics).
- To process payments via Polar.
- To send transactional emails (sign-in codes, a welcome email, receipts, deletion reminders, storage warnings). We do not send marketing emails.
- To improve recommendations based on anonymised usage signals.
- For security, rate limiting, error diagnosis, and preventing the free Creative from being claimed more than once per email address.
- To comply with law.

## 5. Use of AI
All AI models are open-source and run on servers we rent and control (Modal). No user content is sent to external AI companies (no OpenAI, Anthropic, Google AI, Grok, etc.). Your songs, lyrics, photos, and videos are never used to train generative models. The only thing mumoo learns from is genre tagging, as described below.

- Lyrics transcription and word timing (Whisper + alignment model).
- Lyric meaning for mood/theme suggestions (Qwen3-8B) — lyrics held in memory only, never stored.
- Genre suggestion from a “style print” of the 15-second clip (CLAP): a list of numbers describing its sound, not the audio itself. When you pick or confirm a genre, the style print and genre label are saved to help improve genre suggestions for future tracks. They are stored with a one-way cryptographic code tied to that song and account, never your name or email, and are only used once they pass our checks (for example, several accounts agreeing on the genre).
- Photo background removal (u2net) — no face recognition or identification.
- Internal library sorting only (Qwen2.5-VL) — never applied to user uploads.

AI suggestions can be wrong. You can edit them before creating videos. See the separate AI Disclosure.

## 6. Third parties
- **Netlify (USA):** hosting and server functions.
- **Neon / Databricks:** database and sign-in. Database located in Singapore.
- **Cloudflare R2:** file storage.
- **Modal (USA):** AI processing and video rendering on servers we control.
- **Resend (USA):** transactional email.
- **Polar (polar.sh):** payments (Merchant of Record).
- **Google:** optional Google sign-in. Google Analytics is planned for later and will require a cookie consent banner (see Cookie Policy).
- **Meta and TikTok:** receive fan events only when a creator enables ad forwarding.
- **Deezer, Apple (iTunes), Spotify:** receive only song search queries (titles, ISRCs, links) — no personal data.

Data is transferred to the USA, Singapore, and other locations as needed to provide the Service. We rely on appropriate safeguards where required (e.g., standard contractual clauses for GDPR transfers).

## 7. Retention
- **Account data:** until you delete the account. Self-service deletion in Settings removes everything (files, history, Smart Links, sign-in).
- **Free Creative check:** if you used your free Creative, we keep a one-way code (SHA-256 hash) of your email address after you delete the account or change its email, so that the same address cannot claim another free Creative. The code cannot be turned back into your address and is kept for no other purpose.
- **Uploads and Creatives:** until you delete them, delete the account, or do not visit for 90 days. We email you at 60 and 83 days before automatic deletion. The account itself remains.
- **Usage signals:** anonymised when the account is deleted.
- **Song style prints and genre labels:** kept when you pick or confirm a genre, with a one-way code tied to that song and account. If you delete your account, your personal link to that code is removed. Labels that do not pass our checks within 120 days are set aside and never used.
- **Fan event data:** anonymous visit and click statistics (no IP address, user agent, cookie or click ID) are kept until the creator deletes the Smart Link or their account. Data forwarded to Meta or TikTok is sent in real time and not kept by us.

## 8. Your rights
Depending on your location (including under GDPR, UK GDPR, CCPA/CPRA, and other applicable privacy laws) you may have rights to access, correct, delete, restrict, or port your data, or to object to certain processing. You can delete your account yourself. For other requests contact moo@mumoo.app. We will respond within the time required by applicable law.

Fans who visit Smart Links can contact the creator (controller) regarding ad-forwarded data, or contact us if needed.

## 9. Security
We use industry-standard measures including encryption of ad tokens, access controls, and secure hosting. No method of transmission or storage is 100% secure.

## 10. Children
The Service is not directed at children under 16. We do not knowingly collect data from anyone under 16.

## 11. Changes
We will update this policy as needed and post the new version with a revised date. Material changes may be notified by email.

## 12. Contact
Privacy questions or requests: moo@mumoo.app
