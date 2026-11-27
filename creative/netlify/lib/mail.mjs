import { createTransport } from 'nodemailer';
import { db } from './person.mjs';

const FROM = 'mumoo <moo@mumoo.app>';
let smtp;

const ses = () => Boolean(process.env.SES_SMTP_USER && process.env.SES_SMTP_PASSWORD);

/** Whether mumoo can send email at all: Amazon SES when its SMTP login is set, Resend otherwise. */
export const mailReady = () => ses() || Boolean(process.env.RESEND_API_KEY);

/**
 * Sends one email from mumoo: the designed `html` with `text` as its plain version. Throws when it cannot, so callers never assume
 * it went. `once` (an event id) makes a retried request send nothing new: SES has no such key, so the id is kept in `mail_sent`
 * for a day; Resend keeps it itself.
 */
export async function sendMail({ to, subject, text, html, once }) {
  if (ses()) return sendWithSes({ to, subject, text, html, once });
  if (!process.env.RESEND_API_KEY) throw new Error('Email is not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(once ? { 'Idempotency-Key': once } : {}),
    },
    body: JSON.stringify({ from: FROM, to, subject, text, ...(html ? { html } : {}) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Email was refused (${response.status}).`);
}

async function sendWithSes({ to, subject, text, html, once }) {
  const sql = once && process.env.DATABASE_URL ? db() : null;
  if (sql) {
    await sql`delete from mail_sent where at < now() - interval '1 day'`;
    const [fresh] = await sql`insert into mail_sent (key) values (${once}) on conflict do nothing returning key`;
    if (!fresh) return;
  }
  smtp ??= createTransport({
    host: `email-smtp.${process.env.SES_REGION || 'ap-southeast-2'}.amazonaws.com`,
    port: 465,
    secure: true,
    auth: { user: process.env.SES_SMTP_USER, pass: process.env.SES_SMTP_PASSWORD },
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await smtp.sendMail({ from: FROM, to, subject, text, ...(html ? { html } : {}) });
  } catch (cause) {
    if (sql) await sql`delete from mail_sent where key = ${once}`;
    throw new Error('Email was refused.', { cause });
  }
}
