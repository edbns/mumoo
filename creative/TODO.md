# What is left

## 1. Admin dashboard (`/admin`)
Done (staging DB migrated, tests in `scripts/admin.test.mjs`):
- Sign-in for admins only: `ADMIN_EMAILS` (comma separated) is checked on the server, and the email must be confirmed in Neon Auth.
- Errors: failed renders, downloads and sign-ins, with the time and the person; mark as seen.
- Approved content: photos, videos and GIFs (no music: music comes from the users), with who cleared them and when.
  Each item has attitudes (the brain's 18 codes, up to 4), a few shared tags (up to 5 per item, 40 in all) and an optional genre / sub-genre.
  Approve, hide and delete an item.

Still to do:
- Set `ADMIN_EMAILS=moo@mumoo.app` in the Netlify environment (staging and production).
- Library to templates, wired for **Our photography** (photos, videos, GIFs; only `approved` and ready items; the song's attitude is the main match, a set genre/sub-genre is preferred and kept to its own genre, an unset one is free for any; tags are stored but not used yet). Still to do:
  - Genre guidance for the brain (the user is gathering it), then use tags in the choice.
  - Riso, Dust and Window: they need a cut-out of the subject, so library photos must be run through the prepare worker (`kind: photo`) when they arrive, then dealt like plates. Window also needs a reading per picture.
  - Decide what a card shows when an item is removed from the library while it sits in someone's cart (it is dropped from the download quietly now).
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
