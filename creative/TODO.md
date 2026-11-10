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
- The creatives templates must read only `approved` library items: attitude and tags match, an item with a genre is preferred for that genre, one without is free for any.
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
