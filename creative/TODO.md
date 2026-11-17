# What is left

## 1. Admin dashboard (`/admin`)
Done (staging DB migrated, tests in `scripts/admin.test.mjs`):
- Sign-in for admins only: `ADMIN_EMAILS` (comma separated) is checked on the server, and the email must be confirmed in Neon Auth.
- Errors: failed renders, downloads and sign-ins, with the time and the person; mark as seen.
- Approved content: photos, videos and GIFs (no music: music comes from the users), with who cleared them and when.
  Each item has attitudes (the brain's 10 moods, up to 4), a few shared tags (up to 5 per item, 40 in all) and an optional genre / sub-genre.
  Approve, hide and delete an item.

Still to do:
- Done: `ADMIN_EMAILS=moo@mumoo.app` on both Netlify sites. mumoo.app (site `mumoo`) is still password-protected with no other variables: it needs the database, Neon Auth, R2 and Resend variables when the app moves there.
- Library to templates, wired for **Our photography** (photos, videos, GIFs; only `approved` and ready items; the song's attitude is the main match, a set genre/sub-genre is preferred and kept to its own genre, an unset one is free for any; a tag that is one of the genre's themes from `src/genre-guide.ts` is a small plus).
  - Done (migration 031): genre colours. Each ready picture's colours (a clip's from its poster) are measured on our server like a song's cover (`jpegColours`, `measureColours`) and matched to the colours its genre calls for (`coloursFor` in `genre-guide.ts`, `colourFit`). They only lift a picture that already shows something the song wants. The admin item panel shows the palette.
- Financials: sales, refunds, tokens sold and used, per day and per month (needs payments).
- Referral figures (needs the referral program).

## 2. Referral program
- Each person gets a personal link and code.
- A friend who signs up through it and buys: both get free tokens (amount to decide).
- A "Refer a friend" line in the account menu, with the link, how many joined and tokens earned.
- Guards: no self-referral, one reward per new person.
- Shows in the admin dashboard.

## 3. Payments (last)
- Lemon Squeezy: the Purchase Credits popup (5 / 10 / 15 USD) goes to checkout.
- Decide the real number of tokens in each pack (now placeholders: 50 / 110 / 180).
- A webhook adds the tokens and writes the invoice; the real `/api/invoices` and the token balance come from it.

## 4. Smaller things
- Real `/terms` and `/privacy` pages.
- Landing page (Hirael template 781).
- Done (migration 032): change email. Neon's managed sign-in refuses every way of changing an email and has no setting for it, so our server does it (`/api/account/email`, `email-change.mjs`): a 6-digit code to the new address through Resend (10 minutes, 5 tries), then the email changes in `neon_auth."user"` and `app_users`. Same account, so everything made stays; open sessions see the new address at once.
- Done: delete account completely (Settings → Delete account, typing the email to confirm; `DELETE /api/account`, `delete-account.mjs`). Every file under the person's `uploads/` and `renders/` in storage (also leftovers no row knows), their rows (account, history, pictures, email change), error reports naming them, and their Neon sign-in with its sessions and Google link. Feedback stays as untraceable codes. A token still in use cannot bring the account back.
- Done: a person's own pictures and clips stay in their account (History → Uploads) until they delete them; they used to be cleared on every visit and on Start over. The shelf still starts empty each run and takes ten at once; the account keeps up to 500 within its storage.
- Done: History plays downloaded videos (and uploaded videos and GIFs): a play button on each card opens it large, with sound and a Download button.
- Done: the product-flow tests walk the current flow again (the one style box, the shelf without a heading), with a mocked library so the cards paint; the cover test reads the Dust card and the lyric-meaning test the live looks.
- Smart links v1 (free tool, fan pages at mumoo.app/l/slug): step 1 done, the song lookup (`POST /api/links/lookup`, `song-lookup.mjs`, migration 035). Spotify/Apple Music/YouTube link → Deezer (by ISRC when known, else by name and length) and Apple (preview, large cover), searches for the rest; kept once per link. A Spotify link gives only its title without SPOTIFY_CLIENT_ID/SECRET (a free Spotify developer app): the artist then picks the song from candidates and it is looked up again by its ISRC or Deezer track (kept apart, so a pick never changes another person's lookup). Spotify's API works on staging (`X-Spotify-Api: ok`; Spotify requires Premium on the developer account). Only sure answers are kept or read back, so a guess never hides Spotify. Step 2 done, the editor (`/links`, see README). Step 3 done, the fan page (`/l/<slug>`, about 5 KB, CDN-cached and emptied on every change). Editor redone after the artist's review: search by name (Spotify first, so new releases are found), Deezer links, exact Spotify buttons by ISRC, service logos, drag to order, and the real fan page on an iPhone beside it with a working preview. Next: click stats, the bridge card into the generator (title, artist, cover, genre pre-filled; the artist uploads their master). Test in the Instagram and TikTok in-app browsers that https links open the Spotify and Apple Music apps. Publishing signs in with Google or email.
- Done: "Continue with Google" in the sign-in window, in a popup so the song on the page is kept (`signInWithGoogle` in `account.tsx`; the SDK in the popup hands the session verifier back). It uses Neon's shared Google credentials, which are for testing: before launch, make our own Google OAuth client (consent screen named mumoo, with the privacy and terms links; redirect URI `{NEON_AUTH_BASE_URL}/callback/google`) and enter its ID and secret in Neon (Auth → OAuth providers → Google). When the app moves to mumoo.app, add it to Neon's trusted domains.
- Done (migration 034): emails all from "mumoo" (lowercase, no name or address in them, the code in the subject), Neon's sign-in code sent by us through its `send.otp` webhook, a letter when an account is deleted, the inactivity reminders reworded, and a letter when storage passes 90% of 5 GB.

## Brain feedback
- Done: every play, select, download press and refresh is kept in `brain_feedback` (codes only), against the person when signed in; `nth_download` 1 is their first download (the free one).
- Done (migration 023): the whole reel and the Director's seed, preview watch time (`watch`), finished downloads (`delivered`, copied from the card's own download press), and the song's other moods, themes, drive and key. Admin → Learning reads it per row, look, vibe, mood and library picture.
- Done: library picks lean a little (at most ±0.3, below one theme) towards pictures people keep, with a seeded draw so new pictures still get turns (`learnedNudge`). Counts come with `/api/library` (last 90 days).
- Done: downloads lead the learning. A downloaded card counts in full, one only put in the cart a third (`learnedCounts`). Each template leads with the kind of card people download (`learnedCards`, `learnedLead`: treatment variant, Window colour, Silhouette figure and colour, Riso ink, live look). Admin → Learning shows what people download, most downloaded first.
- Done (migration 031): each card on our picture tells the brain how well that picture carried the genre's colours (`colour_fit`). Admin → Learning → Genre colour match shows whether strong matches are downloaded more; if they are, raise `COLOUR_WEIGHT` in `library-pick.ts`.
- Done (migration 033): learning per lane. Pictures, each template's kinds of card and the templates themselves are counted per lane the brain chose for the song (the lane already folds in the mood of the words); a song's own lane counts in full, the others a quarter (`inLane`). The shelf's order is learned too (`shelfOrder`): templates people download in songs of the lane move up a few places, seeded per song so the same song always gets the same shelf. Each card tells where its template was on the shelf (`shelf_place`); Admin → Learning shows templates by lane and by place.
- To do: mark the free download properly once credits exist.
