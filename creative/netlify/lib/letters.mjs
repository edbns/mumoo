/**
 * Every email we send, in one place. They all come from "mumoo", always written in lowercase, and never name the person or show
 * their address: we do not collect names, and an email forwarded or seen over a shoulder should not give the address away.
 * A code is always in the subject, so it can be read from the notification.
 */

const SIGN_OFF = ['', 'mumoo'];
const letter = (subject, lines) => ({ subject, text: [...lines, ...SIGN_OFF].join('\n') });

function size(bytes) {
  return bytes >= 1e9 ? `${Number((bytes / 1e9).toFixed(1))} GB` : `${Math.round(bytes / 1e6)} MB`;
}

/** The code Neon's sign-in asks us to deliver (`otp_type` sign-in, email-verification or forget-password). */
export function signInCode(code, minutes, type = 'sign-in') {
  const what = type === 'forget-password' ? 'reset your password' : type === 'email-verification' ? 'confirm your email' : 'sign in';
  return letter(`${code} is your mumoo code`, [
    `Your code to ${what} on mumoo is ${code}.`,
    '',
    `It works for ${minutes} minutes. If you did not ask for it, ignore this email: nobody can sign in without the code.`,
  ]);
}

export function emailChangeCode(code, minutes) {
  return letter(`${code} is your mumoo code`, [
    `Your code to make this your mumoo email is ${code}.`,
    '',
    `It works for ${minutes} minutes. If you did not ask for it, ignore this email: nothing changes.`,
  ]);
}

export function accountDeleted() {
  return letter('Your mumoo account is deleted', [
    'Your mumoo account has been deleted, as you asked.',
    '',
    'Your creatives, your uploaded photos, videos and GIFs, and your history are gone from our storage, and this email can no longer sign in to them. Signing in again starts a new, empty account.',
    '',
    'If you did not ask for this, reply to this email.',
  ]);
}

/** The reminder after `days` without a visit; the files go after `deleteDays`. */
export function inactivityReminder(days, deleteDays, siteUrl) {
  const left = deleteDays - days;
  return letter(left > 10 ? 'Your mumoo creatives are waiting' : `Your mumoo files will be deleted in ${left} days`, [
    `You have not been to mumoo for ${days} days.`,
    '',
    `To keep storage tidy, the creatives and uploads saved in your account are deleted after ${deleteDays} days without a visit. That is in about ${left} days.`,
    '',
    `Sign in at ${siteUrl} before then and everything stays. To keep a copy, open History, choose Select all and then Download.`,
  ]);
}

export function storageAlmostFull(used, quota, siteUrl) {
  return letter('Your mumoo storage is almost full', [
    `Your mumoo storage is almost full: ${size(used)} of ${size(quota)} is used.`,
    '',
    `When it is full, new creatives and uploads cannot be saved. Sign in at ${siteUrl}, open History, download what you want to keep, then delete it to make room.`,
  ]);
}
