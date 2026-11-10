export type ProblemKind = 'render' | 'download' | 'sign_in';

/**
 * Tells our server that something failed, so the admin can see it (what, when and who). Never throws and never waits:
 * a failed note must not get in the person's way. When someone is signed in the server names them from their session;
 * a failed sign-in has nobody yet, so the address they typed goes with it, unchecked.
 */
export function reportProblem(kind: ProblemKind, message: string, options: { email?: string; signedOut?: boolean } = {}) {
  void (async () => {
    // The sign-in code lives with the account; it is only loaded when someone might be signed in.
    const token = options.signedOut ? null : await import('./account').then(account => account.sessionToken()).catch(() => null);
    await fetch('/api/report-problem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify({ kind, message: message.slice(0, 300), ...(options.email && { email: options.email }) }),
      keepalive: true,
    });
  })().catch(() => undefined);
}
