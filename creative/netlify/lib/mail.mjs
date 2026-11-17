/**
 * Sends one plain email from mumoo through Resend. Throws when it cannot, so callers never assume it went.
 * `once` (an event id) makes a retried request send nothing new: Resend keeps the key for a day.
 */
export async function sendMail({ to, subject, text, once }) {
  if (!process.env.RESEND_API_KEY) throw new Error('Email is not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(once ? { 'Idempotency-Key': once } : {}),
    },
    body: JSON.stringify({ from: 'mumoo <moo@mumoo.app>', to, subject, text }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Email was refused (${response.status}).`);
}
