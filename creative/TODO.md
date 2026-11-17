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
- History: downloaded videos play on the Creatives tab, so a person can check one before downloading it again.
- Update the old product-flow tests to the new nav, genre / sub-genre and account menu.

## Brain feedback
- Done: every play, select, download press and refresh is kept in `brain_feedback` (codes only), against the person when signed in; `nth_download` 1 is their first download (the free one).
- Done (migration 023): the whole reel and the Director's seed, preview watch time (`watch`), finished downloads (`delivered`, copied from the card's own download press), and the song's other moods, themes, drive and key. Admin → Learning reads it per row, look, vibe, mood and library picture.
- Done: library picks lean a little (at most ±0.3, below one theme) towards pictures people keep, with a seeded draw so new pictures still get turns (`learnedNudge`). Counts come with `/api/library` (last 90 days).
- Done: downloads lead the learning. A downloaded card counts in full, one only put in the cart a third (`learnedCounts`). Each template leads with the kind of card people download (`learnedCards`, `learnedLead`: treatment variant, Window colour, Silhouette figure and colour, Riso ink, live look). Admin → Learning shows what people download, most downloaded first.
- Done (migration 031): each card on our picture tells the brain how well that picture carried the genre's colours (`colour_fit`). Admin → Learning → Genre colour match shows whether strong matches are downloaded more; if they are, raise `COLOUR_WEIGHT` in `library-pick.ts`.
- Done (migration 033): learning per lane. Pictures, each template's kinds of card and the templates themselves are counted per lane the brain chose for the song (the lane already folds in the mood of the words); a song's own lane counts in full, the others a quarter (`inLane`). The shelf's order is learned too (`shelfOrder`): templates people download in songs of the lane move up a few places, seeded per song so the same song always gets the same shelf. Each card tells where its template was on the shelf (`shelf_place`); Admin → Learning shows templates by lane and by place.
- To do: mark the free download properly once credits exist.
