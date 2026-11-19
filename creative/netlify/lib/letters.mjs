/**
 * Every email we send, in one place. They all come from "MUMOO", always written in capitals, and never name the person or show
 * their address: we do not collect names, and an email forwarded or seen over a shoulder should not give the address away.
 * A code is always in the subject, so it can be read from the notification.
 */

const SIGN_OFF = ['', 'MUMOO'];
const letter = (subject, lines) => ({ subject, text: [...lines, ...SIGN_OFF].join('\n') });

function size(bytes) {
  return bytes >= 1e9 ? `${Number((bytes / 1e9).toFixed(1))} GB` : `${Math.round(bytes / 1e6)} MB`;
}

/** The code Neon's sign-in asks us to deliver (`otp_type` sign-in, email-verification or forget-password). */
export function signInCode(code, minutes, type = 'sign-in') {
  const what = type === 'forget-password' ? 'reset your password' : type === 'email-verification' ? 'confirm your email' : 'sign in';
  return letter(`${code} is your MUMOO code`, [
    `Your code to ${what} on MUMOO is ${code}.`,
    '',
    `Works for ${minutes} minutes. If you didn’t ask for it, ignore this — nobody can sign in without the code.`,
  ]);
}

export function emailChangeCode(code, minutes) {
  return letter(`${code} is your MUMOO code`, [
    `Your code to make this your MUMOO email is ${code}.`,
    '',
    `Works for ${minutes} minutes. If you didn’t ask for it, ignore this — nothing changes.`,
  ]);
}

export function accountDeleted() {
  return letter('Your MUMOO account is deleted', [
    'Your MUMOO account has been deleted, as you asked.',
    '',
    'Your creatives, uploaded photos/videos/GIFs and history are gone from storage. This email can’t sign in anymore. Signing in again starts a fresh empty account.',
    '',
    'If you didn’t ask for this, reply to this email.',
  ]);
}

/** The reminder after `days` without a visit; the files go after `deleteDays`. */
export function inactivityReminder(days, deleteDays, siteUrl) {
  const left = deleteDays - days;
  return letter(left > 10 ? 'Your MUMOO creatives are waiting' : `Your MUMOO files will be deleted in ${left} days`, [
    `You haven’t been to MUMOO for ${days} days.`,
    '',
    `To keep storage tidy, creatives and uploads get deleted after ${deleteDays} days without a visit. That’s in about ${left} days.`,
    '',
    `Sign in at ${siteUrl} before then and everything stays. To keep a copy, open History → Select all → Download.`,
  ]);
}

export function storageAlmostFull(used, quota, siteUrl) {
  return letter('Your MUMOO storage is almost full', [
    `Storage is almost full: ${size(used)} of ${size(quota)} used.`,
    '',
    `When it’s full, new creatives and uploads can’t be saved. Sign in at ${siteUrl}, open History, download what you want, then delete to free space.`,
  ]);
}

/** After a pack is paid for: what it added and where the invoice is. `paid` is the amount as the person reads it ("$20.00"). */
export function creditsAdded(videos, credits, paid, siteUrl, bonus = 0) {
  return letter(`Your ${videos + bonus} MUMOO videos are ready`, [
    `Thanks. ${videos} video credits are now in your MUMOO account. One credit = one video, they never expire.`,
    ...(bonus ? [`Your friend’s invite added ${bonus} more, free.`] : []),
    '',
    `You paid ${paid}. You now have ${credits} ${credits === 1 ? 'credit' : 'credits'}.`,
    '',
    `Invoice is in Invoices: ${siteUrl}/invoices. Payment was taken by Polar so it shows as Polar on your statement.`,
  ]);
}

/** Someone the person invited bought their first pack, and it earned the person `videos` free videos. */
export function referralEarned(videos, credits, siteUrl) {
  return letter(`A friend joined MUMOO: ${videos} free videos for you`, [
    `Someone you invited just bought their first pack, so ${videos} free videos are now in your account. Thanks for sharing MUMOO.`,
    '',
    `You now have ${credits} ${credits === 1 ? 'credit' : 'credits'}. Make something at ${siteUrl}, and find your invite link under Invite friends in your account menu.`,
  ]);
}
