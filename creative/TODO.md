# What is left

## 1. Admin dashboard (`/admin`)
Done (staging DB migrated, tests in `scripts/admin.test.mjs`):
- Sign-in for admins only: `ADMIN_EMAILS` (comma separated) is checked on the server, and the email must be confirmed in Neon Auth.
- Errors: failed renders, downloads and sign-ins, with the time and the person; mark as seen.
- Approved content: photos, videos and GIFs (no music: music comes from the users), with who cleared them and when.
  Each item has attitudes (the brain's 10 moods, up to 4), a few shared tags (up to 5 per item, 40 in all) and an optional genre / sub-genre.
  Approve, hide and delete an item.

Still to do:
- Set `ADMIN_EMAILS=moo@mumoo.app` on the production Netlify site too (staging is done).
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
- Send the sub-genre to the feedback log and the server.
- Check on Neon that "change email" is switched on.
- Update the old product-flow tests to the new nav, genre / sub-genre and account menu.

## Brain feedback
- Done: every play, select, download press and refresh is kept in `brain_feedback` (codes only), against the person when signed in; `nth_download` 1 is their first download (the free one).
- Done (migration 023): the whole reel and the Director's seed, preview watch time (`watch`), finished downloads (`delivered`, copied from the card's own download press), and the song's other moods, themes, drive and key. Admin → Learning reads it per row, look, vibe, mood and library picture.
- Done: library picks lean a little (at most ±0.3, below one theme) towards pictures people keep, with a seeded draw so new pictures still get turns (`learnedNudge`). Counts come with `/api/library` (last 90 days).
- Done: downloads lead the learning. A downloaded card counts in full, one only put in the cart a third (`learnedCounts`). Each template leads with the kind of card people download (`learnedCards`, `learnedLead`: treatment variant, Window colour, Silhouette figure and colour, Riso ink, live look). Admin → Learning shows what people download, most downloaded first.
- Done (migration 031): each card on our picture tells the brain how well that picture carried the genre's colours (`colour_fit`). Admin → Learning → Genre colour match shows whether strong matches are downloaded more; if they are, raise `COLOUR_WEIGHT` in `library-pick.ts`.
- To do: mark the free download properly once credits exist; learn per mood or lane instead of overall; learn the order of the templates on the shelf.
