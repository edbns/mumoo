/** Sends one plain email from MUMOO through Resend. Throws when it cannot, so callers never assume it went. */
export async function sendMail({ to, subject, text }) {
  if (!process.env.RESEND_API_KEY) throw new Error('Email is not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'MUMOO <moo@mumoo.app>', to, subject, text }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Email was refused (${response.status}).`);
}
