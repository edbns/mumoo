/**
 * Every email we send, in one place. Each is written once as blocks and sent two ways: a light designed HTML version (white page,
 * the four dots, a code box or one dark button, a quiet footer) and the same words as plain text for apps that show no HTML.
 * They never name the person or show their address: we do not collect names, and an email forwarded or seen over a shoulder
 * should not give the address away. A code is always in the subject, so it can be read from the notification.
 * `**words**` in a paragraph are bold in the HTML version.
 */

const site = (url) => url || process.env.URL || 'https://mumoo.app';

const p = (text) => ({ p: text });
const code = (value) => ({ code: value });
const button = (label, href) => ({ button: label, href });
const facts = (rows) => ({ facts: rows });
const note = (text) => ({ note: text });

function size(bytes) {
  return bytes >= 1e9 ? `${Number((bytes / 1e9).toFixed(1))} GB` : `${Math.round(bytes / 1e6)} MB`;
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const bold = (text) => escape(text).replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;color:#111827">$1</strong>');
const plain = (text) => text.replace(/\*\*(.+?)\*\*/g, '$1');

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function htmlBlock(block) {
  if (block.p) return `<p style="margin:0 0 24px;font-size:17px;line-height:1.6;color:#111827">${bold(block.p)}</p>`;
  if (block.code) {
    return `<div style="margin:0 0 32px;padding:28px 16px;border-radius:12px;background:#f3f4f6;text-align:center;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:40px;font-weight:700;letter-spacing:12px;color:#111827">${escape(block.code)}</div>`;
  }
  if (block.button) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px"><tr><td align="center" style="border-radius:999px;background:#111827"><a href="${escape(block.href)}" style="display:block;padding:16px 24px;border-radius:999px;font-size:17px;font-weight:500;color:#ffffff;text-decoration:none">${escape(block.button)}</a></td></tr></table>`;
  }
  if (block.facts) {
    const rows = block.facts.map(([label, value]) => `<tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:16px;color:#6b7280">${escape(label)}</td><td align="right" style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:16px;font-weight:600;color:#111827">${escape(value)}</td></tr>`).join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px;border-top:1px solid #e5e7eb">${rows}</table>`;
  }
  return `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#6b7280">${bold(block.note)}</p>`;
}

function textBlock(block) {
  if (block.p) return plain(block.p);
  if (block.code) return block.code;
  if (block.button) return `${block.button}: ${block.href}`;
  if (block.facts) return block.facts.map(([label, value]) => `${label}: ${value}`).join('\n');
  return plain(block.note);
}

/** One email: its subject, the plain text and the HTML. `why` is a line in the footer saying why this address got it. */
function letter(subject, blocks, { why = '', siteUrl } = {}) {
  const home = site(siteUrl);
  const text = [...blocks.map(textBlock), ...(why ? [why] : []), 'mumoo'].join('\n\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center" style="padding:40px 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:${FONT}">
<tr><td style="padding:0 0 40px"><a href="${escape(home)}"><img src="${escape(home)}/brand/email-logo.png" width="120" height="32" alt="mumoo" style="display:block;border:0"></a></td></tr>
<tr><td>${blocks.map(htmlBlock).join('\n')}</td></tr>
<tr><td style="padding:8px 0 0;border-top:1px solid #e5e7eb;text-align:center">
${why ? `<p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#6b7280">${escape(why)}</p>` : ''}
<p style="margin:20px 0 0;font-size:15px;font-weight:600;color:#111827"><a href="${escape(home)}" style="color:#111827;text-decoration:none">mumoo</a></p>
</td></tr>
</table></td></tr></table>
</body></html>`;
  return { subject, text, html };
}

/** The code Neon's sign-in asks us to deliver (`otp_type` sign-in or email-verification; there are no passwords to reset). */
export function signInCode(value, minutes, type = 'sign-in') {
  if (type === 'email-verification') {
    return letter(`${value} — confirm your mumoo email`, [
      p(`Just one more step! Use this code to confirm your email. **It expires in ${minutes} minutes.**`),
      code(value),
      note('Didn’t request this? You can safely ignore this email.'),
    ]);
  }
  return letter(`${value} — your mumoo sign-in code`, [
    p(`Here’s your code to sign in to mumoo. **It expires in ${minutes} minutes.**`),
    code(value),
    note('Didn’t ask for this? You can safely ignore this email. No one can sign in without the code.'),
  ]);
}

export function emailChangeCode(value, minutes) {
  return letter(`${value} — confirm your new mumoo email`, [
    p(`You’re almost done changing your email. Use this code to confirm your new address. **It expires in ${minutes} minutes.**`),
    code(value),
    note('Didn’t request this? You can ignore this email. Nothing will change.'),
  ]);
}

/** Once, after signing up, to an address whose free video is still to come. */
export function welcome(siteUrl) {
  return letter('Welcome to mumoo — your first video is on us', [
    p('Welcome to mumoo!'),
    p('We’ve added **1 free video** to your account so you can give it a try. Pick your music, make something you like, and see where it takes you.'),
    button('Start creating', site(siteUrl)),
    note('Have fun creating!'),
  ], { siteUrl });
}

/** After a pack is paid for: what it added and where the invoice is. `paid` is the amount as the person reads it ("$20.00"). */
export function creditsAdded(videos, credits, paid, siteUrl, bonus = 0) {
  const home = site(siteUrl);
  return letter(`Your ${videos + bonus} mumoo video credits are ready`, [
    p(bonus
      ? `You’re all set! We’ve added **${videos} video credits** from your purchase, plus **${bonus} extra credits** for joining through a friend’s invite. That’s ${videos + bonus} credits added to your account!`
      : `You’re all set! We’ve added **${videos} video credits** to your account.`),
    p('One credit makes one video, and your credits never expire.'),
    facts([['You paid', paid], ['Your balance', `${credits} ${credits === 1 ? 'credit' : 'credits'}`]]),
    button('View invoice', `${home}/invoices`),
    note(`Your payment was processed by Polar, so you may see Polar on your statement. ${bonus ? 'Thanks for giving mumoo a try. ' : ''}Have fun creating!`),
  ], { siteUrl });
}

/** Someone the person invited bought their first pack, and it earned the person `videos` free videos. */
export function referralEarned(videos, credits, siteUrl) {
  return letter(`Your invite worked! ${videos} free credits for you`, [
    p(`Good news! Someone you invited just bought their first video pack, so we’ve added **${videos} free credits** to your account as a thank you.`),
    facts([['Your new balance', `${credits} ${credits === 1 ? 'credit' : 'credits'}`]]),
    button('Make something', site(siteUrl)),
    note('You can find your invite link under “Invite friends” in your account menu. Thanks for sharing mumoo!'),
  ], { siteUrl });
}

export function storageAlmostFull(used, quota, siteUrl) {
  return letter('A heads-up about your mumoo storage', [
    p(`Hey, just a heads-up! You’re getting close to your storage limit. You’ve used **${size(used)} of ${size(quota)}**.`),
    p('Once it’s full, you won’t be able to save new videos or uploads until you make some room.'),
    p('To free up space, open Media, download anything you’d like to keep, and delete what you no longer need.'),
    button('Open Media', `${site(siteUrl)}/media`),
  ], { siteUrl });
}

/** The reminder after `days` without a visit; the files go after `deleteDays`. */
export function inactivityReminder(days, deleteDays, siteUrl) {
  const left = deleteDays - days;
  const keep = note('Want a copy on your computer? Open Media, choose “Select all”, then “Download”.');
  if (left <= 10) {
    return letter(`${left} days left to keep your mumoo files`, [
      p(`One last heads-up! It’s been ${days} days since your last visit. **Your stored videos and uploads will be deleted in ${left} days** if you don’t sign in.`),
      p('Want to keep everything? Just sign in before then.'),
      button('Keep my files', site(siteUrl)),
      keep,
    ], { siteUrl });
  }
  return letter('It’s been a while — your mumoo files are still here', [
    p(`Hey, it’s been a while! You haven’t visited mumoo in ${days} days, so here’s a quick heads-up.`),
    p(`We delete stored videos and uploads after ${deleteDays} days without a visit. That means you have **about ${left} days left** to keep yours. Just sign in before then, and your files will stay.`),
    button('Keep my files', site(siteUrl)),
    keep,
    note('Hope to see you around!'),
  ], { siteUrl });
}

export function accountDeleted() {
  return letter('Your mumoo account has been deleted', [
    p('Your mumoo account has been deleted, as requested.'),
    p('Your saved videos, uploaded photos, videos, GIFs, and history have been removed from storage. This account can no longer be used to sign in.'),
    p('If you ever decide to come back, signing up again will start a fresh, empty account. The free video comes only with an email address’s first account.'),
    note('Didn’t request this? Please reply to this email so we can look into it. Thanks for spending some time with mumoo.'),
  ]);
}
