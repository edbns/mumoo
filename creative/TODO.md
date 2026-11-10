# What is left

## 1. Admin dashboard
- Sign-in for admins only (a list of admin emails, checked on the server).
- Financials: sales, refunds, tokens sold and used, per day and per month.
- Errors: failed renders, failed downloads, failed sign-ins, with the time and the person; mark as seen.
- Approved content: upload cleared-copyright photos, videos and music, with who cleared them and when.
  Each item is tagged (genre, mood, kind) so the creatives templates can pick from it later.
- Approve, hide and delete an item.

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
